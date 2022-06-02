import { message_handler } from "./Lib/Socket.js";
import { SceneScroller } from "./Lib/SceneScroller.js";
import * as wrapper from "./Lib/Wrap.js"
import { log, controlToken, preUpdateTokenFlags, tokenCreated } from "./Lib/Functions.js"

// Boolean to be used for any entry function that will launch Scene Scroller methods or functions.
// If isReady is false (not ready), then the module should offer not functionality at all.
let isReady = false;

// Convenience variable to insert the module name where required
export const ModuleName = "scene-scroller";
// Convenience variable to insert the module title where required
export const ModuleTitle = "SCENE SCROLLER";
// Convenience variable when calling game.socket
export const SocketModuleName = "module." + ModuleName

/** Hook once on 'INI' to initialize the following:
 *   - libWrapper wrappers
 *   NOTE TO SELF: The timing matters for wrapping some functions.  -onDragStart gets cached and wrapping at "READY"
 *   is too late.  If a wrapper doesn't work it may need to be wrapped earlier (init is as early as it gets) or later.
 */
Hooks.once('init', () => {
    wrapper.scene_onupdate();
    wrapper.myTestWallInclusion();
    wrapper.updateToken();
    wrapper.isDoorVisible();
})

/** Hook once on 'READY' to initialize the following:
 *   - Initialize the socket
 *   - Make the SceneScroller class available as an api.  For debugging.  Review this before any kind of public release.
 */
Hooks.once('ready', () => {
    log(false, "Hook content for 'ready' executing.");
    game.socket.on(SocketModuleName, message_handler);
    game.modules.get(ModuleName).api = SceneScroller;
})

// This works with the Foundryvtt-devMode module to create debug settings that persist across refreshes.
// If used properly, debug logging (see log() function) will not be released to users.
Hooks.once('devModeReady', ({ registerPackageDebugFlag }) => {
    log(false, "Hook content for 'devModeReady' executing.");
    registerPackageDebugFlag(ModuleName);
});

// Prepare scene-scroller scene
Hooks.on('ready', SceneScroller.onReady);
// Token creation workflow
Hooks.on('preCreateToken', SceneScroller.tokenCreate);
// Viewport management workflow
Hooks.on('controlToken', controlToken);
// Token movement workflow
Hooks.on('preUpdateToken', preUpdateTokenFlags);
// Update the sub-scene selection window when a token is deleted.
Hooks.on('deleteToken', () => {
    if ( !SceneScroller.isScrollerScene(canvas.scene) ) return;
    log(false, "Hook content for 'deleteToken' executing.");
    SceneScroller.controlToken.render(true)
});
// Refresh the sub-scene when tokens are created.
Hooks.on('createToken', tokenCreated);
// Remove SS selection window when changing or deleting scenes
Hooks.on('deleteScene', () => {
    if (SceneScroller.controlToken !== null) {
        SceneScroller.controlToken.close();
        SceneScroller.controlToken = null;
    }
})