import { ModuleName, ModuleTitle, ssfc } from "../ss-initialize.js";

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

export function onReady() {

    if ( !isScrollerScene(canvas.scene) ) return;
    log(false, "Executing 'onReady()' function.");

    // Generate alpha maps for all sub-scenes in the viewport and set them to not visible.
    for (const tileID of ssfc.viewport.SceneTilerTileIDsArray) {
        const tile = canvas.background.get(tileID);
        tile._createAlphaMap({keepPixels: true});
        tile.visible = false;
    }

    translateSubScene(ssfc.viewport.ActiveScene)
    for (const childSubSceneData of ssfc.subScene.get(ssfc.viewport.ActiveScene).LinkedTiles) {
        translateSubScene(childSubSceneData.TileID);
    }
    refreshVisibility();
}