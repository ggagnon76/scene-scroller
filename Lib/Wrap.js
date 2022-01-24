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

/** Libwrapper initialized on 'init' hook.  (does not work on 'ready' hook) See ss-initialize.js
 * 
 *  When a user or DM attempts to create a token by dragging an actor from the actor directory to the canvas,
 *  this wrapper will prevent the drag preview from occuring (event.preventDefault) and trigger the
 *  NewTokenTileSelectUI application.  See Forms.js for further details.
 */
export function actordirectory_ondragstart() {
        libWrapper.register(ModuleName, 'ActorDirectory.prototype._onDragStart', function myOnDragStart(wrapped, ...args) {
            if ( !SceneScroller.isScrollerScene(canvas.scene) ) return wrapped(...args);
            const event = args[0];
            event.preventDefault();
            const li = event.currentTarget.closest(".directory-item");
            let actor = null;
            if ( li.dataset.documentId ) {
                actor = game.actors.get(li.dataset.documentId);
                if ( !actor || !actor.visible ) return wrapped(...args);
            }
            SceneScroller.tokenCreate(actor, actor.data);
        }, 'MIXED');
    }

export function myTestWallInclusion(wall) {
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
        return wrapped(...args) && testWall(args[0])
    }, 'WRAPPER');
}

export function updateToken() {
    libWrapper.register(ModuleName, 'Token.prototype.animateMovement', function myAnimateMovement(wrapped, ...args) {
        return wrapped(...args).then(() => {
            if ( SceneScroller.updateToken === null) return;
            log(false, "Token has transfered sub-scenes and viewport will update.")
            resetMainScene();
            SceneScroller.displaySubScenes(SceneScroller.updateToken);
            SceneScroller.updateToken = null;
        })
    })
}