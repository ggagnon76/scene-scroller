import { ModuleName, ModuleTitle, SocketModuleName, ssc } from "../ss-initialize.js";
import { ScrollerToken } from "./classes.js";
import { ScrollerInitiateScene, ScrollerViewSubSceneSelector } from "./forms.js";
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
    if (scene?.flags?.hasOwnProperty(ModuleName) || ssc !== undefined) return true;
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

    canvas.primary.removeChildren();

    const sceneWidth = area.width;
    const sceneHeight = area.height;
    const gridType = canvas.grid.type;
    const gridCls = BaseGrid.implementationFor(gridType);
    const gridPadding = gridCls.calculatePadding(gridType, sceneWidth, sceneHeight, canvas.grid.size, canvas.scene.padding, {
        legacy: canvas.scene.flags.core?.legacyHex
    });
    const sceneX = gridPadding.x - canvas.scene.background.offsetX;
    const sceneY = gridPadding.y - canvas.scene.background.offsetY;

    const data = {
        width: gridPadding.width,
        height: gridPadding.height,
        size: canvas.grid.size,
        rect: new PIXI.Rectangle(0,0, gridPadding.width, gridPadding.height),
        sceneX: sceneX,
        sceneY: sceneY,
        sceneWidth: sceneWidth,
        sceneHeight: sceneHeight,
        sceneRect: new PIXI.Rectangle(sceneX, sceneY, sceneWidth, sceneHeight),
        distance: canvas.dimensions.distance,
        ratio: sceneWidth/sceneHeight,
        maxR: Math.hypot(gridPadding.width, gridPadding.height)
    }

    foundry.utils.mergeObject(canvas.dimensions, data);

    canvas.walls._draw();

    const updates = ["stage", "drawings", "environment", "grid", "hidden", "lighting", "notes", "rendered", "sounds", "templates", "tiles", "tokens", "walls", "weather"];

    for (const u of updates) {
        canvas[u].hitArea = canvas.dimensions.rect;
    }

    const outline = new PIXI.Graphics();
    const {scene, dimensions} = canvas;
    const displayCanvasBorder = scene.padding !== 0;
    const displaySceneOutline = !scene.background.src;
    if ( !(displayCanvasBorder || displaySceneOutline) ) return;
    if ( displayCanvasBorder ) outline.lineStyle({
      alignment: 1,
      alpha: 0.75,
      color: 0x000000,
      join: PIXI.LINE_JOIN.BEVEL,
      width: 4
    }).drawShape(dimensions.rect);
    if ( displaySceneOutline ) outline.lineStyle({
      alignment: 1,
      alpha: 0.25,
      color: 0x000000,
      join: PIXI.LINE_JOIN.BEVEL,
      width: 4
    }).beginFill(0xFFFFFF, 0.025).drawShape(dimensions.sceneRect).endFill();

    canvas.interface.removeChildAt(0);
    canvas.interface.addChildAt(outline, 0);
    canvas.grid.draw();

    canvas.fog.configureResolution();

    const cr = canvas.dimensions.rect;
    canvas.masks.canvas.clear().beginFill(0xFFFFFF, 1.0).drawRect(cr.x, cr.y, cr.width, cr.height).endFill();
    canvas.primary.sprite.mask = canvas.primary.mask = canvas.perception.mask = canvas.effects.mask = canvas.interface.grid.mask = canvas.masks.canvas;

    canvas.primary.draw();
    canvas.effects.illumination.draw();
    canvas.effects.visibility.draw();
}

/**
 * Redraws the placeable and replaces some eventListeners with custom functions.
 * @param {object} placeable A Foundry instance for any given placeable.
 */
export async function placeableDraw(placeable) {
    await placeable.draw();

    // Have to update the wall vertices.  Wall.#initializeVertices() is private.  So run Wall._onUpdate().
    if ( placeable instanceof Wall) {
        // Update the vertices
        const data = {
            c: placeable.document.c,
            _id: placeable.document._id
        }
        const options = [
            {
                diff: true,
            },
            game.user.id
        ]
        placeable._onUpdate(data, ...options);

        // Draw door controls
        if ( placeable.document.door === 1 ) {
            drawDoorControl(placeable);
        }
    }

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

        // Normalize token location to sub-scene coordinates
        const x = loc.x - sceneTile.x;
        const y = loc.y - sceneTile.y;

        // Test against the image polygon of the sub-scene
        const clipperPt = new ClipperLib.IntPoint(x, y);
        if ( !ClipperLib.Clipper.PointInPolygon(clipperPt, sceneTile.imagePath) ) continue;

        subSceneArray.push(sceneTile);
    }

    return subSceneArray;
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
            const doc = pDict[placeable].doc(data);
            const e = pDict[placeable].p(doc);
            e.parentSubScene = [tile.id]
            pDict[placeable].cache(e)
        })
    }
}

function initializeTile(tileDoc) {

    const tile = new Tile(tileDoc);
    canvas.scene.collections.tiles.set(tile.id, tile.document)
    tile.draw();
}

/** Given an array of compendium scene UUID's, create Froundry Tiles for each, cache them and recreate the placeables.
 * @param {string|array.<string>}   uuids   The array of uuid strings
 */
async function cacheSubScene(uuids, {isGrandChild = false}={}) {
    if ( !Array.isArray(uuids) ) uuids = [uuids];

    for (const uuid of uuids) {

        if ( !ssc.compendiumSourceFromCache(uuid) ) {
            // Save the tile compendium source in the cache referencing the uuid
            const source = await fromUuid(uuid);
            if ( source ) ssc.cacheCompendiumSource(uuid, source);
        }
        const source = ssc.compendiumSourceFromCache(uuid);
        if ( !source ) continue;

        if ( !ssc.spriteFromCache(uuid) ) {
            // Have Foundry load the texture
            await TextureLoader.loader.load([source.background.src])
            ssc.cacheSubSceneSprite(uuid, new PIXI.Sprite(await loadTexture(source.background.src)));
        }

        if ( !ssc.getSubSceneTile(uuid) ) {
            // Create a local memory tile for this source.  (not saved to database)
            const data = {
                x: 0,
                y: 0,
                width: source.width,
                height: source.height,
                overhead: false,
                img: source.background.src,
                _id: foundry.utils.randomID(16)
            }
            const tileDoc = new TileDocument(data, {parent: canvas.scene});

            // Save this tile in the cache referencing both tile.id and the scene uuid, for convenience
            ssc.setSubSceneCache(tileDoc.id, tileDoc);
            ssc.setSubSceneCache(uuid, tileDoc);
        }
        const tileDoc = ssc.getSubSceneTile(uuid);
        tileDoc.compendiumSubSceneUUID = uuid;

        const sourcePath = source.getFlag("scene-scroller-maker", ssc.compendiumFlags[3]);
        tileDoc.imagePath = PolygonMesher.getClipperPathFromPoints(sourcePath);

        // Cache the placeables for this sub-scene
        cacheInScenePlaceables(source, tileDoc);
    }
}

/**
 * Given a compendium scene UUID, populates the viewport with the parent and children sub-scenes.
 * @param {string} uuid A compendium scene UUID
 */
async function populateScene(uuid, {isParent = false,}={}) {

    const subScene = ssc.getSubSceneTile(uuid);
    const activeSceneSource = ssc.compendiumSourceFromCache(uuid);
    const activeSceneLoc = activeSceneSource.getFlag("scene-scroller-maker", ssc.compendiumFlags[2]);

    if ( isParent ) {
        // Cache this as the new activeScene
        ssc.cacheactiveSceneUUID(uuid);
        // Resize the scene to fit the active scene bounds data.
        const activeSceneBounds = activeSceneSource.getFlag("scene-scroller-maker", ssc.compendiumFlags[1]);
        await localResizeScene(activeSceneBounds);
    }

    // The cached subScene is unaware of the current scene size or padding
    // If we're updating the scene, the current location may be incorrect too.
    // TO INVESTIGATE:  Using subScene.updateSource() here doesn't work?
    const d = canvas.dimensions;
    if ( isParent ) {
        //subScene.updateSource({
        //    x: activeSceneLoc.x + d.sceneX,
        //    y: activeSceneLoc.y + d.sceneY
        //})
        subScene.x = subScene._source.x = activeSceneLoc.x + d.sceneX;
        subScene.y = subScene._source.y = activeSceneLoc.y + d.sceneY;
    } else {
        const childrenFlags = ssc.ActiveChildrenFlags;
        const childFlags = childrenFlags.filter(c => c[ssc.subSceneChildrenFlags[0]].includes(uuid)).pop();
        //subScene.updateSource({
        //    x: childFlags.ChildCoords.x + d.sceneX,
        //    y: childFlags.ChildCoords.y + d.sceneY
        //})
        subScene.x = subScene._source.x = childFlags.ChildCoords.x + d.sceneX;
        subScene.y = subScene._source.y = childFlags.ChildCoords.y + d.sceneY;
    }

    initializeTile(subScene);

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
        let dest = {x: c.x, y: c.y};
        if ( !originalEvent.shiftKey ) {
        dest = canvas.grid.getSnappedPosition(c.x, c.y, this.layer.gridPrecision);
        }
        c.x = c.document.x = dest.x;
        c.y = c.document.y = dest.y;
        c._id = c._original.id;
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
    if ( !p.doorControl ) p.doorControl = p.createDoorControl();
    p.doorControl.draw();

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
    /** Copied from DoorControls#_onMouseDown(), line 31545 */
    if ( event.data.originalEvent.button !== 0 ) return; // Only support standard left-click
    event.stopPropagation();
    const state = this.document.ds;
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
    this.document.ds = state === states.CLOSED ? states.OPEN : states.CLOSED;
    drawDoorControl(this);

    // Doesn't make sense that this has to be done.... ???
    for (const token of canvas.tokens.placeables) {
        token.updateSource();
    }

    // Update the lighting and sight
    canvas.effects.refreshLighting();
    canvas.perception.update({
        refreshLighting: true,
        refreshVision: true
      }, true);
}

/**
 * A replacement function for a right-click event on a door icon.
 * @param {object} event HTML event
 * @returns 
 */
function _doorControlRightClick(event) {
    /** Copied from DoorControls#_onRightDown(), line 31575 */
    event.stopPropagation();
    if ( !game.user.isGM ) return;
    let state = this.document.ds,
        states = CONST.WALL_DOOR_STATES;
    if ( state === states.OPEN ) return;

    /** This portion changed to not attempt to save to db. */
    this.document.ds = state === states.LOCKED ? states.CLOSED : states.LOCKED;
    drawDoorControl(this);
}

/**
 * Adds all placeables that need to be added to the viewport.
 * @param {array<string>}   uuids   An array of UUID strings.  Only placeables belonging to those UUID's get populated.
 */
async function populatePlaceables(uuids) {
    const placeables = ["walls", "drawings", "lights", "notes", "sounds", "templates", "tiles", "tokens"];

    for (const placeable of placeables) {
        for (const p of ssc[placeable].values()) {

            let subScene;
            if ( placeable === "tokens" ) {
                const tokenParentUUID = p.document.getFlag(ModuleName, ssc.tokenFlags[0]);
                subScene = ssc.getSubSceneTile(tokenParentUUID);
                p.parentSubScene = subScene.id;
            } else if ( placeable === "walls" && p.parentSubScene.length > 1 ) {
                // Walls can belong to two sub scenes.  Need to pick the correct one!
                subScene = ssc.getSubSceneTile(p.parentSubScene[0]);
                const subScene2 = ssc.getSubSceneTile(p.parentSubScene[1]);
                subScene = uuids.includes(subScene.compendiumSubSceneUUID) ? subScene : subScene2;
            } else subScene = ssc.getSubSceneTile(p.parentSubScene[0]);


            if ( !uuids.includes(subScene.compendiumSubSceneUUID) ) return;

            const subSceneSource = ssc.compendiumSourceFromCache(subScene.compendiumSubSceneUUID);
            const sourcePlaceable = subSceneSource[placeable].filter(w => w.id === p.id).pop();


            switch(placeable) {
                case "walls":
                    // If the wall is already in the scene, don't display it again!
                    if ( canvas.walls.placeables.filter(w => w.id === p.id).length >= 1 ) return;
                    p.document.updateSource({
                        c: [
                            sourcePlaceable.c[0] + subScene.x,
                            sourcePlaceable.c[1] + subScene.y,
                            sourcePlaceable.c[2] + subScene.x,
                            sourcePlaceable.c[3] + subScene.y
                        ]
                    })
                    break;
                case "lights":
                    p.config.updateSource({
                        dim: sourcePlaceable.config.dim,
                        bright: sourcePlaceable.config.bright
                    })
                    break;
                case "sounds":
                    p.document.updateSource({
                        radius: sourcePlaceable.radius
                    })
                    break;
                case "tokens" : 
                    const tokenLoc = p.document.getFlag(ModuleName, ssc.tokenFlags[1]);
                    p.document.updateSource({
                        x: tokenLoc.x + subScene.x,
                        y: tokenLoc.y + subScene.y
                    })
                    break;
            }

             if ( placeable !== "walls" && placeable !== "tokens" ) {
                p.document.updateSource({
                    x: sourcePlaceable.x + subScene.x,
                    y: sourcePlaceable.y + subScene.y
                })
            }

            canvas.scene.collections[placeable].set(p.id, p.document)
            canvas[p.layer.options.name].objects.addChild(p);
            if ( p.layer.quadtree ) p.layer.quadtree.insert({r: p.bounds, t: p});
            await placeableDraw(p);
        }
    }
    canvas.walls._deactivate();
    canvas.perception.update({refreshLighting: true, refreshVision: true}, true);
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
    await populatePlaceables(uuidsArr);

    if ( ssc.getAllTokens.length ) {
        // Pan to active token
        const activeTokenID = ssc.activeTokenID;
        const tok = ssc.getToken(activeTokenID);
        canvas.animatePan({x: tok.center.x, y: tok.center.y, duration: 0})
    } else sceneCenterScaleToFit();

    if ( ssc.getAllTokens.length ) {
        if ( ssc.selTokenApp === null ) ssc.selTokenApp = new ScrollerViewSubSceneSelector({}, {left: ui.sidebar._element[0].offsetLeft - 205, top: 3}).render(true);
        else this.selTokenApp.render(true);
    }

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
    game.modules.get(ModuleName).struct = SCSC_Flag_Schema;

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
 * See Foundry.js, line 47395
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
      let dest = {x: c.x, y: c.y};
      if ( !originalEvent.shiftKey && (canvas.grid.type !== CONST.GRID_TYPES.GRIDLESS) ) {
        const isTiny = (c.width < 1) && (c.height < 1);
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

        if ( inScenes.length > 1 ) {
            log(false, "Token is on overlapping pixels for two sub-scenes.  Choosing the first in the array (random).")
        }

        update.destinationSubScene = inScenes[0];
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
            tok.document.updateSource({
                x: update.x,
                y: update.y
            })
            // Animate token movement.  See Foundry.js, line 46650
            tok.animate(update);

            const currSubScene = ssc.getSubSceneTile(ssc.activeSceneUUID);
            updatedTokenArr.push({
                token: tok,
                loc: {x: update.x - currSubScene.x, y: update.y - currSubScene.y},
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

    // What are the sub-scenes that will be added?
    const scenesToAdd = subScenesToAdd(updates[0].destinationSubScene.compendiumSubSceneUUID)
    // What are the sub-scenes that need to be removed?
    const scenesToRemove = subScenesToRemove(updates[0].destinationSubScene.compendiumSubSceneUUID);
    // Remove sub-scenes that are now grandchildren
    removeSubScenes(scenesToRemove, updates[0].destinationSubScene.compendiumSubSceneUUID);

    // Save the viewport location of the soon to be active sub-scene.  To be used to generate a vector
    const tile = ssc.getSubSceneTile(updates[0].destinationSubScene.compendiumSubSceneUUID);
    const oldLoc = {
        x: tile.x,
        y: tile.y
    }

    // Redraw the viewport with the new sub-scene as the active scene
    await populateScene(updates[0].destinationSubScene.compendiumSubSceneUUID, {isParent : true});

    const vector = {
        x: tile.x - oldLoc.x,
        y: tile.y - oldLoc.y
    }

    // Pan the scene by the vector to maintain viewport orientation relative to the new activeScene
    canvas.stage.pivot.set(canvas.stage.pivot.x + vector.x, canvas.stage.pivot.y + vector.y);

    // Update the location of all the remaining placeables in the scene by the vector!
    updatePlaceablesLoc(vector);

    // Add missing placeables
    await populatePlaceables(scenesToAdd);

    // Move tokens
    for (const update of updates) {
        const tok = ssc.getToken(update._id);
        await tok.setPosition(update.x + vector.x, update.y + vector.y);
        tok.x = tok.document.x = update.x + vector.x;
        tok.y = tok.document.y = update.y + vector.y;
        const currSubScene = ssc.getSubSceneTile(ssc.activeSceneUUID);
        updatedTokenArr.push({
            token: tok,
            loc: {x: update.x + vector.x - currSubScene.x, y: update.y + vector.y - currSubScene.y},
            uuid: currSubScene.compendiumSubSceneUUID
        })
    }
    // Debounce the update of token flags with new loc (and new sub-scene if necessary) for updatedTokenArr
    debounceTokenUpdate(updatedTokenArr);

    // Cache the textures for all the grandchildren
    debounceGrandChildCache(ssc.ActiveChildrenUUIDs);
}

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
    const tw = doc.width * d.size / 2; // Half of Token Width
    const th = doc.height * d.size / 2;  // Half of Token Height
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

    if ( subSceneArr.length > 1 ) {
        log(false, "Token is on overlapping pixels for two sub-scenes.  Choosing the first in the array (random).")
    }

    const finalSubScene = subSceneArr[0];

    // Update the token flags with the required data.
    doc.updateSource({
        _id : foundry.utils.randomID(16),
        [`flags.${ModuleName}.${ssc.tokenFlags[0]}`] : finalSubScene.compendiumSubSceneUUID,
        [`flags.${ModuleName}.${ssc.tokenFlags[1]}`] : {x: data.x - finalSubScene.x, y: data.y - finalSubScene.y}
    });

    // Assign our own ID to the token document
    doc.ss_id = foundry.utils.randomID(16);
    
    // Create token placeable
    const tok = new ScrollerToken(doc);
    doc._object = tok;
    // Cache the token
    ssc.cacheToken(tok);
    // Add the token to the scene
    canvas.tokens.objects.addChild(tok);

    // Draw token and update eventListeners
    placeableDraw(tok);

    tok.visible = true;

    if ( ssc.selTokenApp === null ) ssc.selTokenApp = new ScrollerViewSubSceneSelector({}, {left: ui.sidebar._element[0].offsetLeft - 205, top: 3}).render(true);
    else ssc.selTokenApp.render(true);

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

function removePlaceables(uuids, newSubSceneUUID, bypass = false) {

    // Array of UUID's for all the sub-scenes for the newUuid
    const newUuidArr = [newSubSceneUUID, ...ssc.childrenUuids(newSubSceneUUID)];
    // Convert UUID's to Tile ID's
    const newIDArr = newUuidArr.map(t => {
        const subScene = ssc.getSubSceneTile(t);
        return subScene.id;
    })

    for (const uuid of uuids) {
        const subScene = ssc.getSubSceneTile(uuid);
        const placeables = ["walls", "drawings", "lighting", "notes", "sounds", "templates", "tiles", "tokens"];

        for (const placeable of placeables) {

            const filtered = canvas[placeable].placeables.filter(p => p.parentSubScene?.includes(subScene.id));
            for (const p of filtered) {

                // Check to see if any of the parentSubScene ID's are included in the newIDArr array.
                const checkFn = (e) => p.parentSubScene.includes(e);

                // If YES, don't delete it.
                if ( newIDArr.some(checkFn) && !bypass ) continue;

                if ( placeable === "walls" && p.door === 1 ) {
                    p.doorControl.removeAllListeners();
                    p.doorControl.destroy();
                }
                canvas[placeable].objects.removeChild(p);
            }
        }
    }
}

function removeSubScenes(uuids, newSubSceneUUID, bypass = false) {
    for (const uuid of uuids) {
        const subScene = ssc.getSubSceneTile(uuid);
        // If the sprite isn't cached for some reason...
        if ( !ssc.spriteFromCache(uuid) ) ssc.cacheSubSceneSprite(uuid, subScene.tile)
        // Remove the sprite from the sub-scene
        subScene.object.removeChildren();
        subScene.object.texture = undefined;
        subScene.object.tile = undefined;
    }
    // Also remove the placeables...
    removePlaceables(uuids, newSubSceneUUID, bypass);

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
                p.c[0] += vector.x; 
                p.c[1] += vector.y;
                p.c[2] += vector.x;
                p.c[3] += vector.y;
                if ( p.door === 1 ) {
                    p.doorControl.reposition();
            }
            } else {
                p.x = p.document.x += vector.x;
                p.y = p.document.y += vector.y;
            }

            if ( placeable === "walls" ) continue;
            p.position.set(p.position.x + vector.x, p.position.y + vector.y);
        }
    }
}

export async function updateViewport(newUUID) {

    const toCache = subScenesToAdd(newUUID);
    for (const uuid of toCache) {
        if ( !ssc.hasSubSceneInCache(uuid) ) await cacheSubScene(uuid); 
    }

    // Array of UUID's for all the sub-scenes currently displayed in the viewport
    const currUuidArr = [ssc.activeSceneUUID, ...ssc.ActiveChildrenUUIDs];

    removeSubScenes(currUuidArr, newUUID, true);
    
    // Redraw the viewport with the new sub-scene as the active scene
    await populateScene(newUUID, {isParent : true});
    
    // Center the new viewport in the window
    sceneCenterScaleToFit();
    
    // Add all placeables
    const newUuidArr = [newUUID, ...ssc.childrenUuids(newUUID)];
    await populatePlaceables(newUuidArr);
}