/* Define common module references as variables */
export const ModuleName = "scene-scroller";
export const ModuleTitle = "SCENE SCROLLER";
export const SocketModuleName = "module." + ModuleName;
export let ssfc; // Scene Scroller Flags Cache
export let preventCanvasDraw = false; // Boolean for scene_onupdate wrapper.

/** Module Initialization */

import * as monkeypatch from "./Lib/Wrap.js"
import { message_handler } from "./Lib/Socket.js";
import { SCSC_Flag_Schema, SceneScroller_Flags } from "./Lib/SceneScroller.js";
import { log, onReady, initialize } from "./Lib/functions.js";

Hooks.once('init', () => {
    monkeypatch.scene_onupdate('WRAPPER');
    monkeypatch.myTestWallInclusion('WRAPPER');
    monkeypatch.updateToken('WRAPPER');
    monkeypatch.isDoorVisible('WRAPPER');
})

Hooks.once('ready', () => {
    game.socket.on(SocketModuleName, message_handler);
    game.modules.get(ModuleName).schema = SCSC_Flag_Schema;
    game.modules.get(ModuleName).initialize = () => initialize();
    ssfc = new SceneScroller_Flags();
})

// Ref: Foundryvtt-devMode module.
Hooks.once('devModeReady', ({ registerPackageDebugFlag }) => {
    log(false, "Registering 'devModeReady' flag.");
    registerPackageDebugFlag(ModuleName);
});

/** Module In-Use */
Hooks.on('ready', onReady);
