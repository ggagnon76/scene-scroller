import { ModuleName, ModuleTitle, ssfc } from "../ss-initialize.js";
import { ScrollerInitiateScene } from "./forms.js";

/* Functions that are used in multiple places. */

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

export function isScrollerScene(scene) {
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

/*************************************************************************************/
/* onReady() and supporting functions */
/*************************************************************************************/

function offsetSubScene(subScene, position, options = {}) {
    // This moves the PIXI container
    subScene.position.set(position.x, position.y)
    // This updates the underlying tile data
    subScene.data.x = subScene.data._source.x = position.x;
    subScene.data.y = subScene.data._source.y = position.y;
}

function translateSubScene(tileID, options = {}) {
    const subScene = canvas.background.get(tileID);
    const activeScene = canvas.background.get(ssfc.viewport.ActiveScene);
    const activeSceneOffset = ssfc.subScene.get(ssfc.viewport.ActiveScene).Offset;

    let viewportPos = {
        x: undefined,
        y: undefined
    };
    // Check to see if the sub-scene is already in position
    if ( subScene === activeScene ) {
        viewportPos = activeSceneOffset;
    } else {
        viewportPos = ssfc.getVector(ssfc.viewport.ActiveScene, tileID);
        viewportPos.x = activeSceneOffset.x - viewportPos.x;
        viewportPos.y = activeSceneOffset.y - viewportPos.y;
    }

    if ( subScene.data.x === viewportPos.x && subScene.data.y === viewportPos.y ) return;

    // Translate the sub-scene
    offsetSubScene(subScene, viewportPos, options);
}

function refreshVisibility() {
    const activeScene = canvas.background.get(ssfc.viewport.ActiveScene);
    const visibleScenes = [activeScene];
    for (const dataArr of ssfc.subScene.get(ssfc.viewport.ActiveScene).LinkedTiles) {
        const subScene = canvas.background.get(dataArr.TileID);
        visibleScenes.push(subScene);
    }
    for (const scene of visibleScenes) {
        scene.visible = true;
    }
}

export async function onReady() {

    if ( !isScrollerScene(canvas.scene) ) return;
    log(false, "Executing 'onReady()' function.");

    /*  Scene is empty.  Build the scene using flag data.  */

    // Active Scene can be different for players and GM.
    let activeSceneUUID;
    if ( game.user.isGM ) {
        activeSceneUUID = ssfc.getActiveScene();
    } else {
        const myTokens = canvas.tokens.placeables.filter(t => t.observer === true);
        if ( !myTokens.length ) {
            ui.notifications.info("You do not have any tokens in this scene.");
            return;
        }
        // Get the active sub-scene from the first controllable token (random)
        activesSceneUUID = ssfc.getActiveSubSceneFromToken(myTokens[0].id);
    }

    const source = await fromUuid(activeSceneUUID);

    /**
    // Generate alpha maps for all sub-scenes in the viewport and set them to not visible.
    for (const tileID of ssfc.viewport[ssfc.viewportFlags[0]]) {
        const tile = canvas.background.get(tileID);
        tile._createAlphaMap({keepPixels: true});
        tile.visible = false;
    }

    translateSubScene(ssfc.viewport.ActiveScene)
    for (const childSubSceneData of ssfc.getLinkedTilesFromSubScene(ssfc.viewport.ActiveScene)) {
        translateSubScene(childSubSceneData.TileID);
    }
    refreshVisibility();
    */
}

/*************************************************************************************/
/* initialize() and supporting functions */
/*************************************************************************************/

export async function initialize() {
    if ( !game.user.isGM ) return;
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

    await ssfc.setActiveScene(sourceUUID);
    onReady();
}