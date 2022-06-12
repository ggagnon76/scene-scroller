/* Define common module references as variables */
export const ModuleName = "scene-scroller";
export const ModuleTitle = "SCENE SCROLLER";
export const SocketModuleName = "module." + ModuleName;
export let ssfc; // Scene Scroller Flags Cache
export let preventCanvasDraw = false; // Boolean for scene_onupdate wrapper.

/** Module Initialization */

import * as monkeypatch from "./Lib/Wrap.js"
import { log, onReady, initialize, isScrollerScene } from "./Lib/functions.js";
import { SceneScroller_Flags } from "./Lib/SceneScroller.js";

Hooks.once('init', () => {
    monkeypatch.scene_onupdate('WRAPPER');
    monkeypatch.myTestWallInclusion('WRAPPER');
    monkeypatch.updateToken('WRAPPER');
    monkeypatch.isDoorVisible('WRAPPER');
})

Hooks.once('ready', () => {
    game.modules.get(ModuleName).initialize = () => {
        ssfc = new SceneScroller_Flags;
        initialize();
    }
    if ( isScrollerScene() ) {
        ssfc = new SceneScroller_Flags;
    }
})

// Ref: Foundryvtt-devMode module.
Hooks.once('devModeReady', ({ registerPackageDebugFlag }) => {
    log(false, "Registering 'devModeReady' flag.");
    registerPackageDebugFlag(ModuleName);
});

/** Module In-Use */
Hooks.on('ready', onReady);
