import { ModuleName } from "../ss-initialize";

/** A wrapper function that works with the Foundryvtt-devMode module to output debugging info
 *  to the console.log, when a debugging boolean is activated in module settings.
 *  Or the code can pass TRUE to the force argument to output to console.log regardless of the debugging boolean.
 *  @param {Boolean}    force   - A manual bypass to force output regardless of the debugging boolean
 *  @param {}           args    - The content to be output to console.log
 *  @return {void}
 */
function log(force, ...args) {
    try {
        const isDebugging = game.modules.get('_dev-mode')?.api?.getPackageDebugValue(ModuleName);

        if ( isDebugging ) {
            console.log(ModuleName,  " debugging | ", ...args);
        } else if ( force ) {
            console.log(ModuleName, " | ", ...args)
        }
    } catch (e) {}
}

/** This function checks that all dependencies are installed and activated.
 *  If they are not, then an error will be displayed to the GM account(s)
 *  @param {Array}  args    - An array of module name strings that are dependencies
 *  @return {Boolean}
*/
export function hasDependencies(...args) {
    const notInstalled = [];
    const notActivated = [];

    for (const dependency of args) {
        const status = game.modules.get(dependency)?.active;
        if ( status ) continue;
        if ( status === undefined ) notInstalled.push(dependency);
        if ( status === false) notActivated.push(dependency);
    }

    for (const warning of notInstalled) {
        if (!game.user.isGM) continue
        ui.notifications.error(ModuleName + " | The" + warning + " module is not installed.  " + ModuleName + " execution aborted.");
    }

    for (const warning of notActivated) {
        if (!game.user.isGM) continue
        ui.notifications.error(ModuleName + " | The" + warning + " module is not activated.  " + ModuleName + " execution aborted.");
    }

    if (notInstalled || notActivated) return false;

    if (game.user.isGM) ui.notifications.info("Scene Zoetrope | All module dependencies are installed and activated!");
    return true;
}