import { ModuleName } from "../ss-initialize.js";
import { SceneScroller } from "./SceneScroller.js";
import { socketWrapper, msgDict } from "./Socket.js";

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