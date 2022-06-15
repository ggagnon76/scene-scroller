import { ModuleName } from "../ss-initialize.js";
import { log } from "./functions.js";

/** LibWrappers are initialized on 'init' hook.  (can also work on 'ready' hook) See ss-initialize.js */
  
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