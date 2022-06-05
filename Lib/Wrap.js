import { ModuleName } from "../ss-initialize.js";
import { socketWrapper, msgDict } from "./Socket.js";
import { log, isScrollerScene } from "./functions.js";

/** LibWrappers are initialized on 'init' hook.  (can also work on 'ready' hook) See ss-initialize.js */
  
 /**  When Scene-Scroller moves placeables around in the scene, or changes the size of the scene,
 *    a draw() would occur which would tear down the whole scene and redraw it causing a noticeable
 *    'hiccup/flicker' in the visuals.  This wrapper avoids this redraw by removing the placeables info from 
 *    scene#_onUpdate, which is what triggers a canvas#draw().
 */
export function scene_onupdate(type) {
        libWrapper.register(ModuleName, 'Scene.prototype._onUpdate', function mySceneOnUpdate(wrapped, ...args) {
            const [data, options, userId] = args;
            if (!SceneScroller.PreventCanvasDraw) return wrapped(data, options, userId);
            delete data?.drawings;
            delete data?.lights;
            delete data?.sounds;
            delete data?.templates;
            delete data?.tiles;
            delete data?.tokens;
            delete data?.walls;
            delete data?.height;
            delete data?.width;

            socketWrapper(msgDict.preventCanvasDrawFalse)
            return wrapped(data, options, userId);
        }, type);
}

/** The ClockwiseSweepPolygon.testWallInclusion method checks to see what walls are visible and excludes those
 *  that are not.  This wrapper causes the walls that are part of a hidden sub-scene to also be excluded.
 */
export function myTestWallInclusion(type) {
    function testWall(wall) {
        const subSceneIds = canvas.scene.getFlag(ModuleName, "SceneTilerTileIDsArray");
        let wallArr = []
        for (const subSceneId of subSceneIds) {
            const tile = canvas.background.get(subSceneId);
            if ( tile.visible === false ) continue;
            const tilerEntities = tile.document.getFlag("scene-tiler", "entities");
            wallArr = wallArr.concat(tilerEntities.walls);
        }
        if ( wallArr.includes(wall.id) ) return true;
        return false;
    }

    libWrapper.register(ModuleName, 'ClockwiseSweepPolygon.testWallInclusion', function isWallFiltered(wrapped, ...args) {
        if ( !isScrollerScene(canvas.scene) ) return wrapped(...args);
        return wrapped(...args) && testWall(args[0])
    }, type);
}

/** The Scene Scroller module will wait until a token animation finishes before updating the scene to represent the
 *  new sub-scene the token has landed on.
 */
export function updateToken(type) {
    libWrapper.register(ModuleName, 'Token.prototype.animateMovement', async function myAnimateMovement(wrapped, ...args) {
        if ( !SceneScroller.isScrollerScene(canvas.scene) ) return wrapped(...args);
        return wrapped(...args).then(() => {
            if ( SceneScroller.updateToken === null) return;
            log(false, "Token has transfered sub-scenes and viewport will update.")
            resetMainScene();
            SceneScroller.displaySubScenes(SceneScroller.updateToken);
            SceneScroller.updateToken = null;
        })
    }, type)
}

/** Door Icons need to be hidden for sub-scenes that are not activated/visible. */
export function isDoorVisible(type) {
    libWrapper.register(ModuleName, 'DoorControl.prototype.isVisible', function myDoorIsVisible(wrapped, ...args) {
        if ( !isScrollerScene(canvas.scene) ) return wrapped(...args);
        const isVisible = wrapped(...args);
        const isVisibleTiles = canvas.background.placeables.filter(t => t.visible === true);
        if ( !isVisibleTiles.length ) return false;
        return isVisible
    }, type)
}