import { ModuleName } from "../ss-initialize.js";
import { SceneScroller } from "./SceneScroller.js";
import { socketWrapper, msgDict } from "./Socket.js";
import { log, resetMainScene } from "./Functions.js";

/** LibWrapper initialized on 'init' hook.  (can also work on 'ready' hook) See ss-initialize.js
 * 
 *  When Scene-Scroller moves placeables around in the scene, or changes the size of the scene,
 *  a draw() would occur which would tear down the whole scene and redraw it causing a noticeable
 *  'hiccup' in the visuals.  This wrapper avoids this redraw by removing the placeables info from 
 *  scene#_onUpdate, which would have triggered a canvas#draw().
 */
export function scene_onupdate() {
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
        }, 'WRAPPER');
}

export function myTestWallInclusion() {
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
        if ( !SceneScroller.isScrollerScene(canvas.scene) ) return wrapped(...args);
        return wrapped(...args) && testWall(args[0])
    }, 'WRAPPER');
}

export function updateToken() {
    libWrapper.register(ModuleName, 'Token.prototype.animateMovement', async function myAnimateMovement(wrapped, ...args) {
        if ( !SceneScroller.isScrollerScene(canvas.scene) ) return wrapped(...args);
        return wrapped(...args).then(() => {
            if ( SceneScroller.updateToken === null) return;
            log(false, "Token has transfered sub-scenes and viewport will update.")
            resetMainScene();
            SceneScroller.displaySubScenes(SceneScroller.updateToken);
            SceneScroller.updateToken = null;
        })
    }, 'WRAPPER')
}

export function isDoorVisible() {
    libWrapper.register(ModuleName, 'DoorControl.prototype.isVisible', function myDoorIsVisible(wrapped, ...args) {
        if ( !SceneScroller.isScrollerScene(canvas.scene) ) return wrapped(...args);
        const isVisible = wrapped(...args);
        const isVisibleTiles = canvas.background.placeables.filter(t => t.visible === true);
        if ( !isVisibleTiles.length ) return false;
        return isVisible
    }, 'WRAPPER')
}