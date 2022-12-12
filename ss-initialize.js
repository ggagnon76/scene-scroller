/* Define common module references as variables */
export const ModuleName = "scene-scroller";
export const ModuleTitle = "SCENE SCROLLER";
export const SocketModuleName = "module." + ModuleName;
export let ssc = undefined; // Scene Scroller Flags Cache

/** Module Initialization */

import * as Viewport from "./Lib/ViewportClass.js"
import * as SSToken from "./Lib/TokenClass.js"
import { log } from "./Lib/functions.js";
import { SceneScroller_Cache, SCSC_Flag_Schema } from "./lib/SceneScrollerClass.js";

Hooks.once('init', () => {
    // Wrappers here.
})

Hooks.once('ready', () => {
    game.modules.get(ModuleName).struct = SCSC_Flag_Schema;
    game.modules.get(ModuleName).initialize = () => {
        ssc = new SceneScroller_Cache;
        Viewport.initialize();
    }
})

// Ref: Foundryvtt-devMode module.
Hooks.once('devModeReady', ({ registerPackageDebugFlag }) => {
    log(false, "Registering 'devModeReady' flag.");
    registerPackageDebugFlag(ModuleName);
});

/** Module In-Use */
Hooks.on('updateScene', (scene, data, options, id) => {
    if ( data.hasOwnProperty("flags") ) return;
    ssc = undefined;
})

Hooks.on('canvasReady', () => {
    if ( Viewport.isScrollerScene() ) {
        ssc = new SceneScroller_Cache;
        Viewport.onReady();
    }
});

/** Token creation */
Hooks.on('preCreateToken', SSToken.tokenCreate)
