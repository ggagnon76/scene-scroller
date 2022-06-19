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
    monkeypatch.updateToken('WRAPPER');
})

Hooks.once('ready', () => {
    game.modules.get(ModuleName).schema = SCSC_Flag_Schema;
    game.modules.get(ModuleName).initialize = () => {
        ssc = new SceneScroller_Cache;
        initialize();
    }
    if ( isScrollerScene() ) {
        ssc = new SceneScroller_Cache;
    }
})

// Ref: Foundryvtt-devMode module.
Hooks.once('devModeReady', ({ registerPackageDebugFlag }) => {
    log(false, "Registering 'devModeReady' flag.");
    registerPackageDebugFlag(ModuleName);
});

/** Module In-Use */
Hooks.on('ready', onReady);

/** Token creation */
Hooks.on('preCreateToken', tokenCreate)
