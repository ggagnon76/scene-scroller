import { ModuleName } from "../ss-initialize.js";
import { SceneScroller } from "./SceneScroller.js";
import { socketWrapper, msgDict } from "./Socket.js";

/** LibWrapper initialized on 'init' hook.  (can also work on 'ready' hook) See ss-initialize.js
 * 
 *  When Scene-Scroller moves placeables around in the scene, or changes the size of the scene,
 *  a draw() would occur which would tear down the whole scene and redraw it causing a noticeable
 *  'hiccup' in the visuals.  This wrapper avoids this redraw by removing the placeables info from 
 *  scene#_onUpdate, which would have triggered a canvas#draw().
 */
export function scene_onupdate() {
        libWrapper.register(ModuleName, 'Scene.prototype._onUpdate', function (wrapped, ...args) {
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
        libWrapper.register(ModuleName, 'ActorDirectory.prototype._onDragStart', function(wrapped, ...args) {
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