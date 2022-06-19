import { ModuleName, ModuleTitle, SocketModuleName, ssc } from "../ss-initialize.js";
import { ScrollerInitiateScene } from "./forms.js";
import { SCSC_Flag_Schema, SceneScroller_Cache } from "./SceneScroller.js";
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
    canvas.sight.draw();
    canvas.grid.draw();
    canvas.background.drawOutline(canvas.outline);
    canvas.msk.clear().beginFill(0xFFFFFF, 1.0).drawShape(canvas.dimensions.rect).endFill();
    canvas.primary.mask = canvas.msk;
    canvas.effects.mask = canvas.msk;

    const bgRect = canvas.dimensions.rect.clone().pad(CONFIG.Canvas.blurStrength * 2);
    canvas.lighting.illumination.background.clear().beginFill(0xFFFFFF, 1.0).drawShape(bgRect).endFill();
}

/*************************************************************************************/
/* onReady() and supporting functions */
/*************************************************************************************/

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
            doc : (data) => new SoundDocument(data, {parent: canvas.scene}),
            p: (doc) => new Sound(doc),
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
            cache: (t) => ssc.addToken(t)
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

async function cacheSubScene(uuid) {
    const source = await fromUuid(uuid);

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
    tileDoc.data.x = tileDoc.data._source.x = source.getFlag("scene-scroller-maker", ssc.compendiumFlags[2]).x;
    tileDoc.data.y = tileDoc.data._source.y = source.getFlag("scene-scroller-maker", ssc.compendiumFlags[2]).y;
    tileDoc.object._createAlphaMap({keepPixels: true});
    tileDoc.object.parentSubScene = uuid;

    // Save this tile in the cache referencing both tile.id and the scene uuid, for convenience
    const subSceneFlags = {
        [ssc.subSceneChildrenFlags[0]] : source.getFlag("scene-scroller-maker", ssc.compendiumFlags[0]),
        [ssc.subSceneChildrenFlags[1]] : source.getFlag("scene-scroller-maker", ssc.compendiumFlags[2]),
        [ssc.subSceneChildrenFlags[2]] : tileDoc.object,
        [ssc.subSceneChildrenFlags[3]] : source.getFlag("scene-scroller-maker", ssc.compendiumFlags[1]),
    }
    ssc.setSubSceneCache(tileDoc.id, subSceneFlags);
    ssc.setSubSceneCache(uuid, subSceneFlags);

    // Cache the placeables for this sub-scene
    cacheInScenePlaceables(source, tileDoc.object)
}

function populateScene(uuid) {
    const d = canvas.dimensions;
    const tile = ssc.getSubSceneTile(uuid);
    tile.data.x = tile.data._source.x += d.paddingX;
    tile.data.y = tile.data._source.y += d.paddingY;
    tile.draw();
    canvas.background.objects.addChild(tile);

    // populate child sub-scenes
    if ( uuid === ssc.activeScene ) {
        for (const child of ssc.ActiveChildren) {
            populateScene(child[ssc.subSceneChildrenFlags[0]]);
        }
    }

}

function _handleDragDrop(event) {
    ui.notifications.info("Resizing not implemented yet.");
}

function _placeableDragDrop(event) {
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

function _prePlaceableDragDrop(event) {
    const handleDragDrop = _handleDragDrop.bind(this);
    if ( this._dragHandle ) return handleDragDrop(event);
    const placeableDragDrop = _placeableDragDrop.bind(this);
    return placeableDragDrop(event);
}

async function placeableDraw(placeable) {
    await placeable.draw();

    // Replace the listener for drag drop so Foundry doesn't try to save change to database.  Update placeable coords instead.
    const prePlaceableDragDrop = _prePlaceableDragDrop.bind(placeable);
    placeable.mouseInteractionManager.callbacks.dragLeftDrop = prePlaceableDragDrop;
}

async function drawDoorControl(p) {
    await p.doorControl.draw();
    const doorControlLeftClick = _doorControlLeftClick.bind(p);
    const doorControlRightClick = _doorControlRightClick.bind(p);
    p.doorControl.off("mousedown")
     .off("rightdown")
     .on("mousedown", doorControlLeftClick)
     .on("rightdown", doorControlRightClick);
}

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

async function populatePlaceables() {
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

            const tile = ssc.getSubSceneTile(p.parentSubScene[0]);
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
            }

            if ( placeable !== "walls") {
                p.data.x = p.data._source.x = Math.round(p.data.x / 1000 * tile.data.width) + tile.data.x;
                p.data.y = p.data._source.y = Math.round(p.data.y / 1000 * tile.data.height) + tile.data.y;
            }

            pDict[placeable](p);
            placeableDraw(p);

            if ( placeable === "walls") {
                if ( p.data.door === 1 ) {
                    drawDoorControl(p);
                }
            }
        })
    }
}

export async function onReady(uuid = null) {

    if ( !isScrollerScene() && uuid === null ) return;
    log(false, "Executing 'onReady()' function.");

    if ( uuid !== null ) {
        ssc.cacheActiveScene(uuid);
    }

    // Scene is empty.  Build the scene using flag data.  
    // Cache the active sub-scene
    await cacheSubScene(ssc.activeScene, {parent: true});

    // Cache the children sub-scenes
    for (const data of ssc.ActiveChildren) {
        await cacheSubScene(data[ssc.subSceneChildrenFlags[0]]);
    }

    // Resize the scene to fit the active scene and it's children sub-scenes.
    localResizeScene(ssc.ActiveBounds);

    // Add sub-scene tiles to the canvas and to canvas.background
    populateScene(ssc.activeScene);

    // Add placeables to all sub-scenes in the viewport
    await populatePlaceables(ssc.activeScene);
}

/*************************************************************************************/
/* initialize() and supporting functions */
/*************************************************************************************/

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

function _tokenDragDrop() {
    ui.notifications.info("Token drag-drop functionality not yet implemented.");
}

async function tokenDraw(token) {
    await token.draw();

    // Replace the listener for drag drop so Foundry doesn't try to save change to database.  Update placeable coords instead.
    const tokenDragDrop = _tokenDragDrop.bind(token);
    token.mouseInteractionManager.callbacks.dragLeftDrop = tokenDragDrop;
}

const debounceTokenCreation = foundry.utils.debounce( async (token) => {
    // Cache the token
    ssc.addToken(token);
    // Add the token to the scene
    canvas.tokens.objects.addChild(token);

    // Draw token and update eventListeners
    tokenDraw(token);

    token.visible = true;
}, 50);

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

    // Check to see if the token drop location is contained in a sub-scene.
    const subSceneArray = [];
    for (const scene of ssc.allSubScenes) {
        // Normalize token location to sub-scene coordinates
        const x = tc.x - scene.Tile.data.x;
        const y = tc.y - scene.Tile.data.y;

        // Test against the bouding box of the sub-scene
        if ( (x < scene.Tile._alphaMap.minX) || (x > scene.Tile._alphaMap.maxX) ) continue;
        if ( (y < scene.Tile._alphaMap.minY) || (y > scene.Tile._alphaMap.maxY) ) continue;

        subSceneArray.push(scene);
    }

    // If the token was dropped in the viewport but not in any sub-scene, don't create the token...
    if ( !subSceneArray.length ) {
        log(false, "Aborting token creation.  Not dropped in area defined by a sub-scene (tile).");
        ui.notifications.warn("Token drop location is not contained in any sub-scene.  Token creation aborted.");
        return false;
    }

    // Check alpha maps to determine which sub-scene the token occupies
    const subSceneArrayByPX = [];
    // Skip the following algorithm if there's just one sub-scene in the array
    if ( subSceneArray.length > 1 ) {
        // Test a specific pixel for each sub-scene
        for (const sScene of subSceneArray) {
            const px = (Math.round(y) * Math.round(Math.abs(sScene.data.width))) + Math.round(x);
            const isInSubScene = sScene._alphaMap.pixels[px] === 1;
            if ( isInSubScene ) subSceneArrayByPX.push(subScene);
        }    
    }

    // Check for edge case where token is dropped on a tile, but in an area of zero alpha
    if ( !subSceneArrayByPX.length && subSceneArray.length > 1 ) {
        log(false, "Aborting token creation.  Token dropped in area of sub-scene (tile) with zero alpha.");
        ui.notifications.warn("Token drop location is not in a valid part of any sub-scene.  Token creation aborted.");
        return false;
    }

    // If there are still more than one possible sub-scenes, then just take the first one.  (So random)
    const finalSubScene = subSceneArrayByPX[0]?.Tile || subSceneArray[0].Tile;

    // Update the token flags with the required data.
    doc.data.update({
        "flags.scene-scroller.CurrentTile" : finalSubScene.parentSubScene,
        "flags.scene-scroller.inTileLoc" : {x: data.x - finalSubScene.data.x, y: data.y - finalSubScene.data.y}
    });
    // update data to place the token at (0,0)
    data.x = 0;
    data.y = 0;
    // Assign an ID to the token document
    doc.data._id = foundry.utils.randomID(16);

    const t = new Token(doc);
    
    // Debounce to save the token in the cache and put our own local token on the scene.
    debounceTokenCreation(t);

    // Don't allow creation of token in db.
    return false;
}