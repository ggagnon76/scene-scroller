import { ModuleName, ModuleTitle, SocketModuleName, ssfc } from "../ss-initialize.js";
import { ScrollerInitiateScene } from "./forms.js";
import { SCSC_Flag_Schema, SceneScroller_Flags } from "./SceneScroller.js";
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
    if (scene?.data?.flags?.hasOwnProperty(ModuleName)) return true;
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
            cache: (d) => ssfc.addDrawing(d)
        },
        lights : {
            doc : (data) => new AmbientLightDocument(data, {parent: canvas.scene}),
            p: (doc) => new AmbientLight(doc),
            cache: (l) => ssfc.addLight(l)
        },
        notes : {
            doc : (data) => new NoteDocument(data, {parent: canvas.scene}),
            p: (doc) => new Note(doc),
            cache: (n) => ssfc.addNote(n)
        },
        sounds: {
            doc : (data) => new SoundDocument(data, {parent: canvas.scene}),
            p: (doc) => new Sound(doc),
            cache: (s) => ssfc.addSound(s)
        },
        templates: {
            doc : (data) => new MeasuredTemplateDocument(data, {parent: canvas.scene}),
            p: (doc) => new MeasuredTemplate(doc),
            cache: (t) => ssfc.addTemplate(t)
        },
        tiles: {
            doc: (data) => new TileDocument(data, {parent: canvas.scene}),
            p: (doc) => {return doc.object},
            cache: (t) => ssfc.addTile(t)
        },
        tokens: {
            doc: (data) => new TokenDocument(data, {parent: canvas.scene}),
            p: (doc) => new Token(doc),
            cache: (t) => ssfc.addToken(t)
        },
        walls: {
            doc: (data) => new WallDocument(data, {parent: canvas.scene}),
            p: (doc) => new Wall(doc),
            cache: (w) => ssfc.addWall(w)
        }
    }

    for (const placeable of placeables) {
        scene[placeable].forEach(p=> {
            const data = p.toObject();

            switch(placeable) {
                case "walls":
                    data.c[0] = Math.round(data.c[0] / tile.data.width * 1000);
                    data.c[1] = Math.round(data.c[1] / tile.data.height * 1000);
                    data.c[2] = Math.round(data.c[2] / tile.data.width * 1000);
                    data.c[3] = Math.round(data.c[3] / tile.data.height * 1000);
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

async function cacheSubScene(uuid, {parent = false} = {}) {
    const source = await fromUuid(uuid);

    if ( parent ) {
        // Save the uuid of this parent scene in the cache and scene flags
        ssfc.setActiveScene(uuid);
        ssfc.addSubSceneInViewport(uuid);
    }

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
    tileDoc.data.x = tileDoc.data._source.x = source.getFlag("scene-scroller-maker", ssfc.compendiumFlags[2]).x;
    tileDoc.data.y = tileDoc.data._source.y = source.getFlag("scene-scroller-maker", ssfc.compendiumFlags[2]).y;
    tileDoc.object._createAlphaMap({keepPixels: true});


    // Save this tile in the cache referencing both tile.id and the scene uuid, for convenience
    const subSceneFlags = {
        [ssfc.subSceneChildrenFlags[0]] : source.getFlag("scene-scroller-maker", ssfc.compendiumFlags[0]),
        [ssfc.subSceneChildrenFlags[1]] : source.getFlag("scene-scroller-maker", ssfc.compendiumFlags[2]),
        [ssfc.subSceneChildrenFlags[2]] : tileDoc.object,
        [ssfc.subSceneChildrenFlags[3]] : source.getFlag("scene-scroller-maker", ssfc.compendiumFlags[1]),
    }
    ssfc.setSubSceneCache(tileDoc.id, subSceneFlags);
    ssfc.setSubSceneCache(uuid, subSceneFlags);

    // Cache the placeables for this sub-scene
    cacheInScenePlaceables(source, tileDoc.object)
}

function populateScene(uuid) {
    const d = canvas.dimensions;
    const tile = ssfc.getSubSceneTile(uuid);
    tile.data.x = tile.data._source.x += d.paddingX;
    tile.data.y = tile.data._source.y += d.paddingY;
    tile.draw();
    canvas.background.objects.addChild(tile);

    // populate child sub-scenes
    if ( uuid === ssfc.ActiveScene ) {
        for (const child of ssfc.ActiveChildren) {
            populateScene(child[ssfc.subSceneChildrenFlags[0]]);
        }
    }

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
        ssfc[placeable].forEach(async (p) => {

            const tile = ssfc.getSubSceneTile(p.parentSubScene[0]);
            switch(placeable) {
                case "walls": 
                    p.data.c[0] = Math.round(p.data.c[0] / 1000 * tile.data.width) + tile.data.x;
                    p.data.c[1] = Math.round(p.data.c[1] / 1000 * tile.data.height) + tile.data.y;
                    p.data.c[2] = Math.round(p.data.c[2] / 1000 * tile.data.width) + tile.data.x;
                    p.data.c[3] = Math.round(p.data.c[3] / 1000 * tile.data.height) + tile.data.y;
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
                p.data.x = Math.round(p.data.x / 1000 * tile.data.width) + tile.data.x;
                p.data.y = Math.round(p.data.y / 1000 * tile.data.height) + tile.data.y;
            }

            pDict[placeable](p);
            await p.draw();
            p.activateListeners();
        })
    }
}

export async function onReady({uuid = false} = {}) {

    if ( !isScrollerScene() && !uuid ) return;
    log(false, "Executing 'onReady()' function.");

    /*  Scene is empty.  Build the scene using flag data.  */

    // Active Scene can be different for players and GM.
    let activeSceneUUID;
    if ( uuid ) activeSceneUUID = uuid;
    else if ( game.user.isGM ) {
        activeSceneUUID = ssfc.ActiveScene;
    } else {
        const myTokens = canvas.tokens.placeables.filter(t => t.observer === true);
        if ( !myTokens.length ) {
            ui.notifications.info("You do not have any tokens in this scene.");
            return;
        }
        // Get the active sub-scene from the first controllable token (random)
        activesSceneUUID = ssfc.getActiveSubSceneFromToken(myTokens[0].id);
    }

    // Cache the active sub-scene
    await cacheSubScene(activeSceneUUID, {parent: true});

    // Cache the children sub-scenes
    for (const data of ssfc.ActiveChildren) {
        await cacheSubScene(data[ssfc.subSceneChildrenFlags[0]]);
    }

    // Resize the scene to fit the active scene and it's children sub-scenes.
    localResizeScene(ssfc.ActiveBounds);

    // Add sub-scene tiles to the canvas and to canvas.background
    populateScene(activeSceneUUID);

    // Add placeables to all sub-scenes in the viewport
    await populatePlaceables(activeSceneUUID);
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

    onReady({uuid: sourceUUID});
}