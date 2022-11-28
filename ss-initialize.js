/* Define common module references as variables */
export const ModuleName = "scene-scroller";
export const ModuleTitle = "SCENE SCROLLER";
export const SocketModuleName = "module." + ModuleName;
export let ssc = undefined; // Scene Scroller Flags Cache

/** Module Initialization */

import * as monkeypatch from "./Lib/Wrap.js"
import { log, onReady, initialize, isScrollerScene, tokenCreate } from "./Lib/functions.js";
import { SceneScroller_Cache, SCSC_Flag_Schema } from "./Lib/SceneScroller.js";

Hooks.once('init', () => {
    // Wrappers here.
})

Hooks.once('ready', () => {
    game.modules.get(ModuleName).struct = SCSC_Flag_Schema;
    game.modules.get(ModuleName).initialize = () => {
        ssc = new SceneScroller_Cache;
        initialize();
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
    if ( isScrollerScene() ) {
        ssc = new SceneScroller_Cache;
        onReady();
    }
});

/** Token creation */
Hooks.on('preCreateToken', tokenCreate)
