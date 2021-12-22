import { ModuleName } from "../ss-initialize";

/** A wrapper function that works with the Foundryvtt-devMode module to output debugging info
 *  to the console.log, when a debugging boolean is activated in module settings.
 *  Or the code can pass TRUE to the force argument to output to console.log regardless of the debugging boolean.
 *  @param {Boolean}    force   - A manual bypass to force output regardless of the debugging boolean
 *  @param {}           args    - The content to be output to console.log
 *  @return {void}
 */
export function log(force, ...args) {
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

/** Returns a compendium scene document when given a pack name and scene name
 * @param {string}  pack    - The name of the compendium pack
 * @param {string}  scene   - The name of the scene in the above compendium pack
 * @returns {object}        - SceneDocument?
 */
 export async function getSource(pack, scene) {
    const compndm = game.packs.filter(p => p.title === pack)[0];
    const clctn = compndm.collection;
    const scn_id = compndm.index.getName(scene)._id;
    const uuid = `Compendium.${clctn}.${scn_id}`;
    const source = await fromUuid(uuid);
    return source;
}

/**
 * A Function that will evaluate the largest required scene size and set the scene to that size.
 * Foundry Core will propagate that change to all clients
 * @param {Scene}   scn         - The main Scene Scroller Scene
 * @param {Array}   actvTiles   - The current (or anticipated) array of tiles in the scene
 * @return {Boolean}
 */
export function resizeScene(scn, actvTiles) {
    if (!scn instanceof Scene) {
        log(false, "Scene argument passed to resizeScene function is not a scene object");
        log(false, scn)
        return false;
    }
    if (!actvTiles.length) {
        log(false, "Array of tiles passed to resizeScene function is empty.")
        return false;
    }

    // Logic to figure out the required scene size...

    // When all is completed successfully
    return true;
}