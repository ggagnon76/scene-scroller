/* Define common module references as variables */
export const ModuleName = "scene-scroller";
export const ModuleTitle = "SCENE SCROLLER";
export const SocketModuleName = "module." + ModuleName;

/** Module Initialization */

import * as monkeypatch from "./Lib/Wrap.js"
import { message_handler } from "./Lib/Socket.js";
import { SCSC_Flags } from "./Lib/SceneScroller.js";

Hooks.once('init', () => {
    monkeypatch.scene_onupdate('WRAPPER');
    monkeypatch.myTestWallInclusion('WRAPPER');
    monkeypatch.updateToken('WRAPPER');
    monkeypatch.isDoorVisible('WRAPPER');
})

Hooks.once('ready', () => {
    game.socket.on(SocketModuleName, message_handler);
    game.modules.get(ModuleName).schema = SCSC_Flags;
})

// Ref: Foundryvtt-devMode module.
Hooks.once('devModeReady', ({ registerPackageDebugFlag }) => {
    log(false, "Hook content for 'devModeReady' executing.");
    registerPackageDebugFlag(ModuleName);
});