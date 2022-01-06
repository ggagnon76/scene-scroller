import { message_handler } from "./lib/Functions.js";
import { SceneScroller } from "./lib/SceneScroller.js";

// Boolean to be used for any entry function that will launch Scene Scroller methods or functions.
// If isReady is false (not ready), then the module should offer not functionality at all.
let isReady = false;

// Convenience variable to insert the module name where required
export const ModuleName = "scene-scroller";
// Convenience variable to insert the module title where required
export const ModuleTitle = "Scene Scroller";
// Convenience variable when calling game.socket
export const SocketModuleName = "module." + ModuleName

/** Hook once on 'READY' to initialize the following:
 *   - All libWrapper wrappers
 *   - Initialize the socket
 *   - Make the SceneScroller class available as an api.
 */
Hooks.once('ready', () => {

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
        return wrapped(data, options, userId);
      })

    game.socket.on(SocketModuleName, message_handler);
    game.modules.get(ModuleName).api = SceneScroller;
})

// This works with the Foundryvtt-devMode module to create debug settings that persist across refreshes.
// If used properly, debug logging (see log() function) will not be released to users.
Hooks.once('devModeReady', ({ registerPackageDebugFlag }) => {
    registerPackageDebugFlag(ModuleName);
});

Hooks.on('preCreateToken', (...args) => {return SceneScroller.tokenCreate()});