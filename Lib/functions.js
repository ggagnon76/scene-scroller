import { ModuleName, ModuleTitle, SocketModuleName, ssc } from "../ss-initialize.js";
import { ScrollerInitiateScene } from "./forms.js";
import { SCSC_Flag_Schema } from "./SceneScroller.js";
import { message_handler } from "./Socket.js";


/*************************************************************************************/
/* Functions that are used in multiple places. */
/*************************************************************************************/


/** A wrapper function that works with the Foundryvtt-devMode module to output debugging info
 *  to the console.log, when a debugging boolean is activated in module settings.
 *  Or the code can pass TRUE to the force argument to output to console.log regardless of the debugging boolean.
 *  @param {Boolean}    force   - A manual bypass to force output regardless of the debugging boolean
 *  @param {}           args    - The content to be output to console.log
 *  @return {void}
 */
 export function log(force, ...args) {
    const isDebugging = game.modules.get('_dev-mode')?.api?.getPackageDebugValue(ModuleName);

    if ( isDebugging ) {
        console.log(ModuleTitle,  "DEBUG | ", ...args);
    } else if ( force ) {
        console.log(ModuleTitle, " | ", ...args)
    }
}

/**
 * A convenience function to determine if the scene has been initialized as a Scene Scroller viewport.
 * @param {object} scene *Optional* A Foundry Scene.  Defaults to the current active scene.
 * @returns {boolean}   
 */
export function isScrollerScene(scene = canvas.scene) {
    if (scene?.data?.flags?.hasOwnProperty(ModuleName) || ssc !== undefined) return true;
    return false;
}

/** Returns the UUID for a compendium scene document when given a pack name and scene name
 * @param {string}  pack    - The name of the compendium pack
 * @param {string}  scene   - The name of the scene in the above compendium pack
 * @returns {string}        - the UUID
 * 
 */
 export async function getUUID(pack, scene) {
    log(false, "Executing 'getSource' function.");
    const compndm = game.packs.filter(p => p.title === pack)[0];
    const clctn = compndm.collection;
    const scn_id = compndm.index.getName(scene)._id;
    return `Compendium.${clctn}.${scn_id}`;
}

/**
 * Changes the size of the scene locally.  Does not affect db or trigger canvas.draw().
 * @param {object} area {width: <number>, height: <number>}
 */
export async function localResizeScene(area) {
    log(false, "Executing 'localResizeScene() function.");

    const d = canvas.dimensions;
    canvas.dimensions = canvas.constructor.getDimensions({
        width: area.width,
        height: area.height,
        size: d.size,
        gridDistance: d.distance,
        padding: canvas.scene.data.padding,
        shiftX: d.shiftX,
        shiftY: d.shiftY,
        grid: canvas.scene.data.grid
    });

    const updates = ["stage", "sight", "controls", "drawings", "lighting", "notes", "sounds", "templates", "background", "foreground",  "tokens", "walls"];
    canvas.sight.height = canvas.dimensions.height;
    canvas.sight.width = canvas.dimensions.width;

    for (const u of updates) {
        canvas[u].hitArea = canvas.dimensions.rect;
    }
    canvas.walls._createBoundaries();
    await canvas.sight.draw();
    await canvas.grid.draw();
    canvas.background.drawOutline(canvas.outline);
    canvas.msk.clear().beginFill(0xFFFFFF, 1.0).drawShape(canvas.dimensions.rect).endFill();
    canvas.primary.mask = canvas.msk;
    canvas.effects.mask = canvas.msk;

    const bgRect = canvas.dimensions.rect.clone().pad(CONFIG.Canvas.blurStrength * 2);
    canvas.lighting.illumination.background.clear().beginFill(0xFFFFFF, 1.0).drawShape(bgRect).endFill();
}

/**
 * Redraws the placeable and replaces some eventListeners with custom functions.
 * @param {object} placeable A Foundry instance for any given placeable.
 */
async function placeableDraw(placeable) {
    await placeable.draw();

    // Replace the listener for drag drop so Foundry doesn't try to save change to database.  Update placeable coords instead.
    let placeableDragDrop;
    if ( placeable instanceof Token) {
        placeableDragDrop = (event) => tokenDragDrop(event);
    } else {
        placeableDragDrop = _placeableDragDrop.bind(placeable);
    }

    placeable.mouseInteractionManager.callbacks.dragLeftDrop = placeableDragDrop;
}

/**
 * Pans the canvas to center the view at the center of the current scene.
 * Only used when setting a new sub-scene which doesn't have tokens
 */
export function sceneCenterScaleToFit() {
    const pad = 75;
    const sidebarPad = $("#sidebar").width() + pad;
    const d = canvas.dimensions;

    const center = {
        x: d.width / 2,
        y: d.height / 2
    }

    const scale = {
        x: (window.innerWidth - sidebarPad - pad) / d.width,
        y: (window.innerHeight - 2 * pad) / d.height
    }

    const finalScale = scale.x < scale.y ? scale.x : scale.y;

    canvas.stage.pivot.set(center.x, center.y);
    canvas.stage.scale.set(finalScale, finalScale);
    canvas.updateBlur(finalScale)
}

/**
 * Determines if a location is within the bounds of any sub-scenes being displayed in the viewport.
 * @param {object} loc {x: <number>, y: <number>}
 * @returns 
 */
function locInSubScenes(loc) {
    const subSceneArray = [];
    const viewportSubScenesUUIDs = [ssc.activeSceneUUID, ...ssc.ActiveChildrenUUIDs]
    for (const sceneUUID of viewportSubScenesUUIDs) {
        const sceneTile = ssc.getSubSceneTile(sceneUUID);

        if ( !sceneTile._alphaMap ) sceneTile._createAlphaMap({keepPixels: true});

        // Normalize token location to sub-scene coordinates
        const x = loc.x - sceneTile.data.x;
        const y = loc.y - sceneTile.data.y;

        // Test against the bounding box of the sub-scene
        if ( (x < sceneTile._alphaMap.minX) || (x > sceneTile._alphaMap.maxX) ) continue;
        if ( (y < sceneTile._alphaMap.minY) || (y > sceneTile._alphaMap.maxY) ) continue;

        subSceneArray.push(sceneTile);
    }

    return subSceneArray;
}

/**
 * Determines if a location is valid (not in transparent areas) in all sub-scenes supplied in an array
 * If there are more than one valid sub-scenes, the function returns the first one.
 * @param {object} loc {x: <number>, y: <number>}
 * @param {object} scenes An array of sub-scene objects (tiles)
 * @returns {object}    A Foundry Tile instance
 */
function locInSubSceneValidAlpha(loc, scenes) {
    const subSceneArrayByPX = [];
    // Skip the following algorithm if there's just one sub-scene in the array
    if ( scenes.length > 1 ) {
        // Test a specific pixel for each sub-scene
        for (const sScene of scenes) {
            // Normalize coordinates to tile top left corner
            const coord = {
                x: loc.x - sScene.data.x,
                y: loc.y - sScene.data.y
            };
        
            const px = (Math.round(coord.y) * Math.round(Math.abs(sScene.data.width))) + Math.round(coord.x);
            const isInSubScene = sScene._alphaMap.pixels[px] === 1;
            if ( isInSubScene ) subSceneArrayByPX.push(sScene);
        }    
    }

    // Check for edge case where token is dropped on a tile, but in an area of zero alpha
    if ( !subSceneArrayByPX.length && scenes.length > 1 ) {
        return "Error: In Zero-Alpha";
    }

    // If there are still more than one possible sub-scenes, then just take the first one.  (So random)
    return subSceneArrayByPX[0] || scenes[0];
} 

/*************************************************************************************/
/* onReady() and supporting functions */
/*************************************************************************************/

/**
 * Queries a scene in a compendium to copy all placeables into the cache.
 * All copied placeables reference the parent Tile/Scene
 * @param {object} scene An compendium scene
 * @param {object} tile A Foundry Tile instance
 */
function cacheInScenePlaceables(scene, tile) {
    const placeables = ["drawings", "lights", "notes", "sounds", "templates", "tiles", "tokens", "walls"];
    const pDict = {
        drawings: {
            doc : (data) => new DrawingDocument(data, {parent: canvas.scene}),
            p: (doc) => new Drawing(doc),
            cache: (d) => ssc.addDrawing(d)
        },
        lights : {
            doc : (data) => new AmbientLightDocument(data, {parent: canvas.scene}),
            p: (doc) => new AmbientLight(doc),
            cache: (l) => ssc.addLight(l)
        },
        notes : {
            doc : (data) => new NoteDocument(data, {parent: canvas.scene}),
            p: (doc) => new Note(doc),
            cache: (n) => ssc.addNote(n)
        },
        sounds: {
            doc : (data) => new AmbientSoundDocument(data, {parent: canvas.scene}),
            p: (doc) => new AmbientSound(doc),
            cache: (s) => ssc.addSound(s)
        },
        templates: {
            doc : (data) => new MeasuredTemplateDocument(data, {parent: canvas.scene}),
            p: (doc) => new MeasuredTemplate(doc),
            cache: (t) => ssc.addTemplate(t)
        },
        tiles: {
            doc: (data) => new TileDocument(data, {parent: canvas.scene}),
            p: (doc) => {return doc.object},
            cache: (t) => ssc.addTile(t)
        },
        tokens: {
            doc: (data) => new TokenDocument(data, {parent: canvas.scene}),
            p: (doc) => new Token(doc),
            cache: (t) => ssc.cacheToken(t)
        },
        walls: {
            doc: (data) => new WallDocument(data, {parent: canvas.scene}),
            p: (doc) => new Wall(doc),
            cache: (w) => ssc.addWall(w)
        }
    }

    for (const placeable of placeables) {
        scene[placeable].forEach(p=> {
            const data = p.toObject();

            switch(placeable) {
                case "walls":
                    data.c[0] = data.c[0] / tile.data.width * 1000;
                    data.c[1] = data.c[1] / tile.data.height * 1000;
                    data.c[2] = data.c[2] / tile.data.width * 1000;
                    data.c[3] = data.c[3] / tile.data.height * 1000;
                    break;
                case "lights":
                    const dw = Math.round(data.config.dim / tile.data.width * 1000);
                    const dh = Math.round(data.config.dim / tile.data.height * 1000);
                    data.config.dim = dw < dh ? dw : dh;
                    const bw = Math.round(data.config.bright / tile.data.width * 1000);
                    const bh = Math.round(data.config.bright / tile.data.height * 1000);
                    data.config.dim = bw < bh ? bw : bh;
                    break;
                case "sounds":
                    const rw = Math.round(data.radius / tile.data.width * 1000);
                    const rh = Math.round(data.radius / tile.data.height * 1000);
                    data.radius = rw < rh ? rw : rh;
                    break;
            }

            if ( placeable !== "walls") {
                data.x = Math.round(data.x / tile.data.width * 1000);
                data.y = Math.round(data.y / tile.data.height * 1000);
            }

            const doc = pDict[placeable].doc(data);
            const e = pDict[placeable].p(doc);
            e.parentSubScene = [tile.id]
            pDict[placeable].cache(e)
        })
    }
}

function initializeTile(tile, sprite) {
    tile.texture = sprite.texture;
    tile.tile = tile.addChild(sprite);
    tile.tile.anchor.set(0.5,0.5);

    tile.tile.scale.x = tile.data.width / tile.texture.width;
    tile.tile.scale.y = tile.data.height / tile.texture.height;
    tile.tile.position.set(Math.abs(tile.data.width)/2, Math.abs(tile.data.height)/2);
    tile.tile.rotation = Math.toRadians(tile.data.rotation);
}

/** Given an array of compendium scene UUID's, create Froundry Tiles for each, cache them and recreate the placeables.
 * @param {string|array.<string>}   uuids   The array of uuid strings
 */
async function cacheSubScene(uuids, {isGrandChild = false}={}) {
    if ( !Array.isArray(uuids) ) uuids = [uuids];

    for (const uuid of uuids) {

        if ( !ssc.compendiumSourceFromCache(uuid) ) {
            // Save the tile compendium source in the cache referencing the uuid
            ssc.cacheCompendiumSource(uuid, await fromUuid(uuid));
        }
        const source = ssc.compendiumSourceFromCache(uuid);

        if ( !ssc.spriteFromCache(uuid) ) {
            // Have Foundry load the texture
            await TextureLoader.loader.load([source.img])
            ssc.cacheSubSceneSprite(uuid, new PIXI.Sprite(await loadTexture(source.img)));
        }
        const tileSprite = ssc.spriteFromCache(uuid);

        if ( !ssc.getSubSceneTile(uuid) ) {
            // Create a local memory tile for this source.  (not saved to database)
            const data = {
                x: 0,
                y: 0,
                width: source.dimensions.width,
                height: source.dimensions.height,
                overhead: false,
                img: source.data.img,
                _id: foundry.utils.randomID(16)
            }
            const tileDoc = new TileDocument(data, {parent: canvas.scene});

            // Save this tile in the cache referencing both tile.id and the scene uuid, for convenience
            ssc.setSubSceneCache(tileDoc.id, tileDoc.object);
            ssc.setSubSceneCache(uuid, tileDoc.object);
        }
        const tile = ssc.getSubSceneTile(uuid);
        tile.compendiumSubSceneUUID = uuid;

        // Cache the placeables for this sub-scene
        cacheInScenePlaceables(source, tile);

        if ( isGrandChild ) continue;

        // The position in scene, assuming this tile is the parent.  Needs to be updated if tile is a child.
        tile.data.x = tile.data._source.x = source.getFlag("scene-scroller-maker", ssc.compendiumFlags[2]).x;
        tile.data.y = tile.data._source.y = source.getFlag("scene-scroller-maker", ssc.compendiumFlags[2]).y;

        initializeTile(tile, tileSprite);
    }
}

/**
 * Given a compendium scene UUID, populates the viewport with the parent and children sub-scenes.
 * @param {string} uuid A compendium scene UUID
 */
async function populateScene(uuid, {isParent = false,}={}) {

    const tile = ssc.getSubSceneTile(uuid);
    const activeSceneSource = ssc.compendiumSourceFromCache(uuid);

    if ( isParent ) {
        // Cache this as the new activeScene
        ssc.cacheactiveSceneUUID(uuid);
        // Resize the scene to fit the active scene bounds data.
        const activeSceneBounds = activeSceneSource.getFlag("scene-scroller-maker", ssc.compendiumFlags[1]);
        await localResizeScene(activeSceneBounds);
    }

    // The cached tile is unaware of the current scene size or padding
    // If we're updating the scene, the current location may be incorrect too.
    const d = canvas.dimensions;
    if ( isParent ) {
        const activeSceneLoc = activeSceneSource.getFlag("scene-scroller-maker", ssc.compendiumFlags[2]);
        tile.data.x = tile.data._source.x = activeSceneLoc.x + d.paddingX;
        tile.data.y = tile.data._source.y = activeSceneLoc.y + d.paddingY;
    } else {
        const childrenFlags = ssc.ActiveChildrenFlags;
        const childFlags = childrenFlags.filter(c => c[ssc.subSceneChildrenFlags[0]].includes(uuid)).pop();
        tile.data.x = tile.data._source.x = childFlags.ChildCoords.x + d.paddingX;
        tile.data.y = tile.data._source.y = childFlags.ChildCoords.y + d.paddingY;
    }

    if ( tile.texture === undefined ) {
        const sprite = ssc.spriteFromCache(uuid)
        initializeTile(tile, sprite);
    }
    tile.position.set(tile.data.x, tile.data.y);

    // populate child sub-scenes
    if ( isParent ) { 
        for (const childUUID of ssc.ActiveChildrenUUIDs) {
            await populateScene(childUUID);
        }
    }
}

/**
 * A replacement function for a placeables resize event.
 * @param {object} event HTML event
 */
function _handleDragDrop(event) {
    ui.notifications.info("Resizing not implemented yet.");
}

/**
 * A replacement function for a placeables drag-drop event.
 * @param {object} event HTML event
 */
function _placeableDragDrop(event) {

    if ( this._dragHandle ) {
        const handleDragDrop = _handleDragDrop.bind(this);
        return handleDragDrop(event);
    }

    const {clones, destination, originalEvent} = event.data;
    if ( !clones || !canvas.grid.hitArea.contains(destination.x, destination.y) ) return false;
    const updates = clones.map(c => {
        let dest = {x: c.data.x, y: c.data.y};
        if ( !originalEvent.shiftKey ) {
        dest = canvas.grid.getSnappedPosition(c.data.x, c.data.y, this.layer.gridPrecision);
        }
        c.data.x = c.data._source.x = dest.x;
        c.data.y = c.data._source.y = dest.y;
        c.data._id = c._original.id;
        return c
    });

    for (const update of updates) {
        const placeable = ssc[update.document.collectionName].get(update.id);
        const data = foundry.utils.deepClone(update.data);
        placeable.data = data;
        placeableDraw(placeable);
    }
}

/**
 * Redraws the door control icon and replaces some eventListeners with custom functions.
 * @param {object} p A Foundry Wall instance
 */
async function drawDoorControl(p) {
    await p.doorControl.draw();
    const doorControlLeftClick = _doorControlLeftClick.bind(p);
    const doorControlRightClick = _doorControlRightClick.bind(p);
    p.doorControl.off("mousedown")
     .off("rightdown")
     .on("mousedown", doorControlLeftClick)
     .on("rightdown", doorControlRightClick);
}

/**
 * A replacement function for a left-click event on a door icon
 * @param {object} event HTML event
 */
function _doorControlLeftClick(event) {
    /** Copied from DoorControls#_onMouseDown() */
    if ( event.data.originalEvent.button !== 0 ) return; // Only support standard left-click
    event.stopPropagation();
    const state = this.data.ds;
    const states = CONST.WALL_DOOR_STATES;

    // Determine whether the player can control the door at this time
    if ( !game.user.can("WALL_DOORS") ) return false;
    if ( game.paused && !game.user.isGM ) {
      ui.notifications.warn("GAME.PausedWarning", {localize: true});
      return false;
    }

    // Play an audio cue for locked doors
    if ( state === states.LOCKED ) {
      AudioHelper.play({src: CONFIG.sounds.lock});
      return false;
    }

    /** This portion changed to not attempt to save to db. */
    this.data.ds = state === states.CLOSED ? states.OPEN : states.CLOSED;
    drawDoorControl(this);

    // Doesn't make sense that this has to be done.... ???
    for (const token of canvas.tokens.placeables) {
        token.updateSource();
    }

    // Update the lighting and sight
    canvas.lighting.refresh();
    canvas.sight.refresh({
        skipUpdateFog: false,
        forceUpdateFog: true
    });
}

/**
 * A replacement function for a right-click event on a door icon.
 * @param {object} event HTML event
 * @returns 
 */
function _doorControlRightClick(event) {
    /** Copied from DoorControls#_onRightDown() */
    event.stopPropagation();
    if ( !game.user.isGM ) return;
    let state = this.data.ds,
        states = CONST.WALL_DOOR_STATES;
    if ( state === states.OPEN ) return;

    /** This portion changed to not attempt to save to db. */
    this.data.ds = state === states.LOCKED ? states.CLOSED : states.LOCKED;
    drawDoorControl(this);
}

/**
 * Adds all placeables that need to be added to the viewport.
 * @param {array<string>}   uuids   An array of UUID strings.  Only placeables belonging to those UUID's get populated.
 */
function populatePlaceables(uuids) {
    const placeables = ["drawings", "lights", "notes", "sounds", "templates", "tiles", "tokens", "walls"];
    const pDict = {
        drawings: (d) => canvas.drawings.objects.addChild(d),
        lights : (l) => canvas.lighting.objects.addChild(l),
        notes : (n) => canvas.notes.objects.addChild(n),
        sounds: (s) => canvas.sounds.objects.addChild(s),
        templates: (t) => canvas.templates.objects.addChild(t),
        tiles: (t) => {
            if ( t.data.overhead ) return canvas.foreground.objects.addChild(t);
            return canvas.background.objects.addChild(t);
        },
        tokens: (t) => canvas.tokens.objects.addChild(t),
        walls: (w) => canvas.walls.objects.addChild(w)
    }

    for (const placeable of placeables) {
        ssc[placeable].forEach(async (p) => {

            let tile;
            if ( placeable === "tokens" ) {
                const tokenParentUUID = p.document.getFlag(ModuleName, ssc.tokenFlags[0]);
                tile = ssc.getSubSceneTile(tokenParentUUID);
            } else tile = ssc.getSubSceneTile(p.parentSubScene[0])

            if ( !uuids.includes(tile.compendiumSubSceneUUID) ) return;

            switch(placeable) {
                case "walls": 
                    p.data.c[0] = p.data.c[0] / 1000 * tile.data.width + tile.data.x;
                    p.data.c[1] = p.data.c[1] / 1000 * tile.data.height + tile.data.y;
                    p.data.c[2] = p.data.c[2] / 1000 * tile.data.width + tile.data.x;
                    p.data.c[3] = p.data.c[3] / 1000 * tile.data.height + tile.data.y;
                    break;
                case "lights":
                    const dw = Math.round(p.data.config.dim / 1000 * tile.data.width);
                    const dh = Math.round(p.data.config.dim / 1000 * tile.data.height);
                    p.data.config.dim = dw < dh ? dw : dh;
                    const bw = Math.round(p.data.config.bright / 1000 * tile.data.width);
                    const bh = Math.round(p.data.config.bright / 1000 * tile.data.height);
                    p.data.config.dim = bw < bh ? bw : bh;
                    break;
                case "sounds":
                    const rw = Math.round(p.data.radius / 1000 * tile.data.width);
                    const rh = Math.round(p.data.radius / 1000 * tile.data.height);
                    p.data.radius = rw < rh ? rw : rh;
                    break;
                case "tokens" : 
                    const tokenLoc = p.document.getFlag(ModuleName, ssc.tokenFlags[1]);
                    p.data.x = p.data._source.x = tokenLoc.x + tile.data.x;
                    p.data.y = p.data._source.y = tokenLoc.y + tile.data.y;
                    break;
            }

             if ( placeable !== "walls" && placeable !== "tokens" ) {
                p.data.x = p.data._source.x = Math.round(p.data.x / 1000 * tile.data.width) + tile.data.x;
                p.data.y = p.data._source.y = Math.round(p.data.y / 1000 * tile.data.height) + tile.data.y;
            }

            pDict[placeable](p);
            placeableDraw(p);

            if ( placeable === "walls" && p.data.door === 1 ) {
                    drawDoorControl(p);
            }
        })
    }
}

const debounceGrandChildCache = foundry.utils.debounce( async (uuidArr) => {
    const missingGrandChildren = new Set();
    for (const childUuid of uuidArr) {
        const childSource = await fromUuid(childUuid);
        const childFlags = childSource.getFlag("scene-scroller-maker", ssc.compendiumFlags[0]);
        const grandChildrenUUIDs = childFlags.map(s => {
            return s[ssc.subSceneChildrenFlags[0]];
        });
        grandChildrenUUIDs.forEach(u => {
            if ( !ssc.getSubSceneTile(u) ) missingGrandChildren.add(u);
        })
    }
    cacheSubScene([...missingGrandChildren], {isGrandChild : true});
}, 1000);

/**
 * Called by a 'canvasReady' hook to rebuild the scene from flag data, or from a supplied UUID.
 * @param {string} uuid *Optional* A compendium scene UUID
 */
export async function onReady(uuid = null) {

    if ( !isScrollerScene() && uuid === null ) return;
    log(false, "Executing 'onReady()' function.");

    if ( uuid !== null ) {
        ssc.cacheactiveSceneUUID(uuid);
    }

    const activeSceneUuid = uuid === null ? ssc.activeSceneUUID : uuid;

    // Scene is empty.  Cache the active sub-scene and child sub-scenes.
    const source = await fromUuid(activeSceneUuid);
    const childrenFlags = source.getFlag("scene-scroller-maker", ssc.compendiumFlags[0]);
    const childrenUUIDs = childrenFlags.map(s => {
        return s[ssc.subSceneChildrenFlags[0]];
    });
    const uuidsArr = [activeSceneUuid, ...childrenUUIDs];
    await cacheSubScene(uuidsArr);

    // Add sub-scene tiles to the canvas and to canvas.background
    await populateScene(ssc.activeSceneUUID, {isParent : true});

    // Add placeables to all sub-scenes in the viewport
    populatePlaceables(uuidsArr);

    if ( ssc.getAllTokens.length ) {
        // Pan to active token
        const activeTokenID = ssc.activeTokenID;
        const tok = ssc.getToken(activeTokenID);
        canvas.animatePan({x: tok.center.x, y: tok.center.y, duration: 0})
    } else sceneCenterScaleToFit();

    // Cache the textures for all the grandchildren
    debounceGrandChildCache(ssc.ActiveChildrenUUIDs);
}

/*************************************************************************************/
/* initialize() and supporting functions */
/*************************************************************************************/

/**
 * A function that is called by a UI (or macro) by a GM to initialize a foundry scene as
 * a scene scroller viewport.
 */
export async function initialize() {
    if ( !game.user.isGM ) return;

    game.socket.on(SocketModuleName, message_handler);
    game.modules.get(ModuleName).schema = SCSC_Flag_Schema;

    const result = await new Promise(resolve => {
        new Dialog({
            title: game.i18n.localize("SceneScroller.ConfirmInitiateSceneUI.Title"),
            content:    `<p>${game.i18n.localize("SceneScroller.ConfirmInitiateSceneUI.Content1")}</p>
                        <p>${game.i18n.localize("SceneScroller.ConfirmInitiateSceneUI.Content2")}</p>`,
            buttons: {
                yes: {
                    icon: '<i class="fas fa-check"></i>',
                    label: "Yes",
                    callback: () => resolve(true)
                },
                no: {
                    icon: '<i class="fas fa-times"></i>',
                    label: "No",
                    callback: () => resolve(false)
                }
                }
            }).render(true);
    });
    if ( !result ) return;

    const sourceUUID = await new Promise((resolve) => {
        new ScrollerInitiateScene(resolve).render(true);
    })
    if ( sourceUUID === null ) {
        ui.notifications.error("No seed scene was selected.  Scene initialization failed.");
        log(false, "Scene Scroller Scene initialization failed because a seed scene was not selected.");
        return;
    }

    onReady(sourceUUID);
}

/*************************************************************************************/
/* token creation and supporting functions */
/*************************************************************************************/

/**
 * A debounced function to update token data (location, occpied sub-scene). 
 * Debounced 1 second because the user could be making multiple movements in succession.
 * @param {object} tokenArr An array of Foundry Token instances
 */
const debounceTokenUpdate = foundry.utils.debounce( (tokenArr) => {
    for (const {token, loc, uuid} of tokenArr) {
        ssc.updateTokenFlags(token, loc, uuid);
    }
}, 1000);

/** A function containing core workflow for a token move by mouse
 * @param {object} event HTML event
 * @returns {object}    array of updates
 */
function core_onDragLeftDrop(event) {
    const clones = event.data.clones || [];
    const {originalEvent, destination} = event.data;

    // Ensure the cursor destination is within bounds
    if ( !canvas.dimensions.rect.contains(destination.x, destination.y) ) return false;

    // Compute the final dropped positions
    const updates = clones.reduce((updates, c) => {

      // Get the snapped top-left coordinate
      let dest = {x: c.data.x, y: c.data.y};
      if ( !originalEvent.shiftKey && (canvas.grid.type !== CONST.GRID_TYPES.GRIDLESS) ) {
        const isTiny = (c.data.width < 1) && (c.data.height < 1);
        dest = canvas.grid.getSnappedPosition(dest.x, dest.y, isTiny ? 2 : 1);
      }

      // Test collision for each moved token vs the central point of it's destination space
      const target = c.getCenter(dest.x, dest.y);
      if ( !game.user.isGM ) {
        c._velocity = c._original._velocity;
        let collides = c.checkCollision(target);
        if ( collides ) {
          ui.notifications.error("ERROR.TokenCollide", {localize: true});
          return updates
        }
      }

      // Otherwise ensure the final token center is in-bounds
      else if ( !canvas.dimensions.rect.contains(target.x, target.y) ) return updates;

      // Perform updates where no collision occurs
      updates.push({_id: c._original.id, x: dest.x, y: dest.y});
      return updates;
    }, []);

    return updates;
}

/**
 * Define the destination sub-scene for every token being updated.  Mutates updates array.
 * @param {object}  updates Array of update objects generated by core_onDragLeftDrop()
 */
function determineDestination(updates) {
    for (let update of updates) {

        // Determine if the token landed in a new sub-scene, then add update details to updatedTokenArr
        const inScenes = locInSubScenes({x: update.x, y: update.y})

        // If somehow the token is dragged in empty space, outside of any sub-scene...
        if ( !inScenes.length ) {
            update.destinationSubScene = null;
            continue;
        }

        // Check alpha maps to determine which sub-scene(s) the token occupies
        const destinationSubScene = locInSubSceneValidAlpha({x: update.x, y: update.y}, inScenes)

        // Check for edge case where token is dropped on a tile, but in an area of zero alpha
        if ( destinationSubScene === "Error: In Zero-Alpha" ) {
            update.destinationSubScene = null;
            continue;
        }

        update.destinationSubScene = destinationSubScene;
    }
}

/** 
 * Determine if the viewport activeSubScene needs to be updated.
 * Do not update if at least one controllable token remains on the current active sub-scene.
 * @param {object}  updates The array of objects containing token update data.
 * @returns {boolean}   returns True if an update is required.
 */
function parentSceneNeedsUpdate(updates) {
    const currSubSceneUuid = ssc.activeSceneUUID;
    for (const update of updates) {
        if ( update.destinationSubScene.compendiumSubSceneUUID === currSubSceneUuid ) return false
    }
    return true;
}

/**
 * A replacement function for a token drag-drop event (token movement by mouse)
 * @param {object} event HTML event
 */
async function tokenDragDrop(event) {
    
    const updates = core_onDragLeftDrop(event);
    determineDestination(updates);
    const isUpdated = parentSceneNeedsUpdate(updates);

    const updatedTokenArr = [];

    if ( !isUpdated ) {
        // Move tokens
        for (const update of updates) {
            const tok = ssc.getToken(update._id);
            await tok.setPosition(update.x, update.y);
            tok.data.x = tok.data._source.x = update.x;
            tok.data.y = tok.data._source.y = update.y;
            const currSubScene = ssc.getSubSceneTile(ssc.activeSceneUUID);
            updatedTokenArr.push({
                token: tok,
                loc: {x: update.x - currSubScene.data.x, y: update.y - currSubScene.data.y},
                uuid: currSubScene.compendiumSubSceneUUID
            })
        }
        // Debounce the update of token flags with new loc (and new sub-scene if necessary) for updatedTokenArr
        debounceTokenUpdate(updatedTokenArr);
        return;
    }

    /****************************** */
    /* The active scene changes.    */
    /****************************** */

    // What are the sub-scenes that need to be removed?
    const scenesToRemove = subScenesToRemove(updates[0].destinationSubScene.compendiumSubSceneUUID);
    const scenesToAdd = subScenesToAdd(updates[0].destinationSubScene.compendiumSubSceneUUID)
    removeSubScenes(scenesToRemove);

    // Save the viewport location of the soon to be active sub-scene.  To be used to generate a vector
    const tile = ssc.getSubSceneTile(updates[0].destinationSubScene.compendiumSubSceneUUID);
    const oldLoc = {
        x: tile.data.x,
        y: tile.data.y
    }

    // Redraw the whole scene with the new sub-scene as the active scene
    await populateScene(updates[0].destinationSubScene.compendiumSubSceneUUID, {isParent : true});

    const vector = {
        x: tile.data.x - oldLoc.x,
        y: tile.data.y - oldLoc.y
    }

    // Pan the scene by the vector to maintain viewport orientation relative to the new activeScene
    canvas.stage.pivot.set(canvas.stage.pivot.x + vector.x, canvas.stage.pivot.y + vector.y);

    // Update the location of all the remaining placeables in the scene by the vector!
    updatePlaceablesLoc(vector);

    // Add missing placeables
    populatePlaceables(scenesToAdd);

    // Move tokens
    for (const update of updates) {
        const tok = ssc.getToken(update._id);
        await tok.setPosition(update.x + vector.x, update.y + vector.y);
        tok.data.x = tok.data._source.x = update.x + vector.x;
        tok.data.y = tok.data._source.y = update.y + vector.y;
        const currSubScene = ssc.getSubSceneTile(ssc.activeSceneUUID);
        updatedTokenArr.push({
            token: tok,
            loc: {x: update.x + vector.x - currSubScene.data.x, y: update.y + vector.y - currSubScene.data.y},
            uuid: currSubScene.compendiumSubSceneUUID
        })
    }
    // Debounce the update of token flags with new loc (and new sub-scene if necessary) for updatedTokenArr
    debounceTokenUpdate(updatedTokenArr);

    // Cache the textures for all the grandchildren
    debounceGrandChildCache(ssc.ActiveChildrenUUIDs);
}

/**
 * A debounced function to cache a created token, and add it to the canvas (local only)
 * Debounced because 'preCreateToken' hook is not async, and this function is.  (STILL TRUE??)
 * @param {object} token    A Foundry Token instance
 */
const debounceTokenCreation = foundry.utils.debounce( (token) => {
    // Cache the token
    ssc.cacheToken(token);
    // Add the token to the scene
    canvas.tokens.objects.addChild(token);

    // Draw token and update eventListeners
    placeableDraw(token);

    token.visible = true;
}, 50);

/**
 * Called by a 'preCreateToken' hook.  Stops the standard Foundry token creation workflow
 * and implements this custom workflow.
 * @param {object} doc Foundry Token document.  Supplied by 'preCreateToken' hook.
 * @param {object} data Foundry Token creation data.  Supplied by 'preCreateToken' hook.
 * @param {object} options Foundry Token creation options.  Supplied by 'preCreateToken' hook.
 * @param {string} userId Foundry game user ID.  Supplied by 'preCreateToken' hook.
 * @returns {boolean}   Returning false stops the standard Foundry creation workflow for a token.
 */
export function tokenCreate(doc, data, options, userId) {
    // Don't alter normal token creation for non-scene-scroller scenes.
    if ( !isScrollerScene() ) return true;

    const d = canvas.dimensions;
    const tw = doc.data.width * d.size / 2; // Half of Token Width
    const th = doc.data.height * d.size / 2;  // Half of Token Height
    const tc = {  // Token center
        x: data.x + tw,
        y: data.y + th
    }

    // Check to see if the token drop location is contained within the bounds of one or more sub-scenes.
    const subSceneArr = locInSubScenes(tc);
    
    // If the token was dropped in the viewport but not in any sub-scene, don't create the token...
    if ( !subSceneArr.length ) {
        log(false, "Aborting token creation.  Not dropped in area defined by a sub-scene (tile).");
        ui.notifications.warn("Token drop location is not contained in any sub-scene.  Token creation aborted.");
        return false;
    }

    // Check alpha maps to determine which sub-scene(s) the token occupies
    const finalSubScene = locInSubSceneValidAlpha(tc, subSceneArr)

    // Check for edge case where token is dropped on a tile, but in an area of zero alpha
    if ( finalSubScene === "Error: In Zero-Alpha" ) {
        log(false, "Aborting token creation.  Token dropped in area of sub-scene (tile) with zero alpha.");
        ui.notifications.warn("Token drop location is not in a valid part of any sub-scene.  Token creation aborted.");
        return false;
    }

    // Update the token flags with the required data.
    doc.data.update({
        [`flags.${ModuleName}.${ssc.tokenFlags[0]}`] : finalSubScene.compendiumSubSceneUUID,
        [`flags.${ModuleName}.${ssc.tokenFlags[1]}`] : {x: data.x - finalSubScene.data.x, y: data.y - finalSubScene.data.y}
    });

    // Assign an ID to the token document
    doc.data._id = foundry.utils.randomID(16);
    
    // Debounce to save the token in the cache and put our own local token on the scene.
    debounceTokenCreation(new Token(doc));

    // Don't allow creation of token in db.
    return false;
}

/*************************************************************************************/
/* Update viewport functions */
/*************************************************************************************/

function subScenesToRemove(newUuid) {
    // Array of UUID's for all the sub-scenes currently displayed in the viewport
    const currUuidArr = [ssc.activeSceneUUID, ...ssc.ActiveChildrenUUIDs];

    // Array of UUID's for all the sub-scenes for the newUuid
    const newUuidArr = [newUuid, ...ssc.childrenUuids(newUuid)];

    return currUuidArr.filter(u => !newUuidArr.includes(u) );
}

function subScenesToAdd(newUuid) {
    // Array of UUID's for all the sub-scenes currently displayed in the viewport
    const currUuidArr = [ssc.activeSceneUUID, ...ssc.ActiveChildrenUUIDs];

    // Array of UUID's for all the sub-scenes for the newUuid
    const newUuidArr = [newUuid, ...ssc.childrenUuids(newUuid)];

    return newUuidArr.filter(u => !currUuidArr.includes(u) );
}

function removePlaceables(uuid) {
    const subScene = ssc.getSubSceneTile(uuid);
    const placeables = ["drawings", "lights", "notes", "sounds", "templates", "foreground", "background", "tokens", "walls"];
    const pDict = {
        drawings: canvas.drawings,
        lights : canvas.lighting,
        notes : canvas.notes,
        sounds: canvas.sounds,
        templates: canvas.templates,
        foreground: canvas.foreground,
        background: canvas.background,
        tokens: canvas.tokens,
        walls: canvas.walls
    }

    for (const placeable of placeables) {
        const filtered = pDict[placeable].placeables.filter(p => p?.parentSubScene?.includes(subScene.id));
        for (const p of filtered) {
            pDict[placeable].objects.removeChild(p);

            if ( placeable === "walls" && p.data.door === 1 ) {
                p.doorControl.removeAllListeners();
                p.doorControl.destroy();
            }
        }
    }
}

function removeSubScenes(uuids) {
    for (const uuid of uuids) {
        const subScene = ssc.getSubSceneTile(uuid);
        // If the sprite isn't cached for some reason...
        if ( !ssc.spriteFromCache(uuid) ) ssc.cacheSubSceneSprite(uuid, subScene.tile)
        // Remove the sprite from the sub-scene
        subScene.removeChildren();
        subScene.texture = undefined;
        subScene.tile = undefined;
        // Also remove the placeables...
        removePlaceables(uuid);
    }
}

function updatePlaceablesLoc(vector) {
    const placeables = ["drawings", "lights", "notes", "sounds", "templates", "foreground", "background", "tokens", "walls"];
    const pDict = {
        drawings: canvas.drawings,
        lights : canvas.lighting,
        notes : canvas.notes,
        sounds: canvas.sounds,
        templates: canvas.templates,
        foreground: canvas.foreground,
        background: canvas.background,
        tokens: canvas.tokens,
        walls: canvas.walls
    }
    for (const placeable of placeables) {
        const placeablesArr = pDict[placeable].placeables;
        for (const p of placeablesArr) {
            if ( placeable === "background" && ssc.hasSubSceneInCache(p.id) ) continue;
            if ( placeable === "walls" ) {
                p.data.c[0] += vector.x; 
                p.data.c[1] += vector.y;
                p.data.c[2] += vector.x;
                p.data.c[3] += vector.y;
                if ( p.data.door === 1 ) {
                    p.doorControl.reposition();
            }
            } else {
                p.data.x = p.data._source.x += vector.x;
                p.data.y = p.data._source.y += vector.y;
            }

            if ( placeable === "walls" ) continue;
            p.position.set(p.position.x += vector.x, p.position.y += vector.y);
        }
    }
}