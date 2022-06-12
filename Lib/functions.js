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

    canvas.stage.hitArea = canvas.dimensions.rect;
    canvas.templates.hitArea = canvas.dimensions.rect;

    canvas.sight.width = canvas.dimensions.width;
    canvas.sight.height = canvas.dimensions.height;
    canvas.sight.hitArea = canvas.dimensions.rect;
    canvas.sight.draw();

    canvas.tokens.hitArea = canvas.dimensions.rect;

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