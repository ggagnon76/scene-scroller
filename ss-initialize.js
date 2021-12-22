// Boolean to be used for any entry function that will launch Scene Scroller methods or functions.
// If isReady is false (not ready), then the module should offer not functionality at all.
let isReady = false;

// Convenience variable to insert the module name where required
export const ModuleName = "scene-scroller";

/** Hook once on 'READY' to initialize the following:
 *   - Check all dependencies are installed and activated.  Then set isReady to TRUE.
 *   - Initialize the socket
 */
Hooks.once('ready', () => {
    if ( !hasDependencies() ) return;
    isReady = true;

    game.socket.on("module." + ModuleName, message_handler);
})

// This works with the Foundryvtt-devMode module to create debug settings that persist across refreshes.
// If used properly, debug logging (see log() function) will not be released to users.
Hooks.once('devModeReady', ({ registerPackageDebugFlag }) => {
    registerPackageDebugFlag(ModuleName);
});