import { ModuleName, ModuleTitle } from "../ss-initialize.js";
import { SceneScroller } from "./SceneScroller.js";

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
            console.log(ModuleTitle,  " debugging | ", ...args);
        } else if ( force ) {
            console.log(ModuleTitle, " | ", ...args)
        }
    } catch (e) {}
}

/** This function checks that all dependencies are installed and activated.
 *  If they are not, then an error will be displayed to the GM account(s)
 *  @param {Array}  args    - An array of module name strings that are dependencies
 *  @return {Boolean}
*/
export function hasDependencies(args) {
    const notInstalled = [];
    const notActivated = [];

    for (const dependency of args) {
        const status = game.modules.get(dependency)?.active;
        if ( status ) continue;
        if ( status === undefined ) notInstalled.push(dependency);s
        if ( status === false) notActivated.push(dependency);
    }

    for (const warning of notInstalled) {
        if (!game.user.isGM) continue
        ui.notifications.error(ModuleTitle + " | The " + warning + " module is not installed.  " + ModuleTitle + " execution aborted.");
    }

    for (const warning of notActivated) {
        if (!game.user.isGM) continue
        ui.notifications.error(ModuleTitle + " | The " + warning + " module is not activated.  " + ModuleTitle + " execution aborted.");
    }

    if (notInstalled.length || notActivated.length) return false;

    if (game.user.isGM) ui.notifications.info(ModuleTitle + " | All module dependencies are installed and activated!");
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
 * A function that clears all the placeable objects referenced by the Tiler Tile, then deletes the tile.
 * @param {Tile}    tile        - The Scene Tiler tile to be deleted.
 * @return {void}
 */
export async function deleteTilerTile(tile) {

    if (!game.user.isGM) {
        log(false, "A non-GM user triggered the largestSceneSize() function.");
        return false;
    }

    await SceneTiler.clearSceneTile(tile);
    await canvas.scene.deleteEmbeddedDocuments("Tile", [tile.id]);
}

/** A function that will resize the scene, and translate all placeables back to a determined coordinate.
 *  Core will propagate this scene change to all clients.
 *  @param {Object}         size        - An object with form {width: <Number>, height: <Number>}
 *  @return {void}
 */
async function resizeScene(size) {

    if (!game.user.isGM) {
        log(false, "A non-GM user triggered the resizeScene() function.");
        return false;
    }

    // Resize the scene to fit either width or height, then scale to fill screen.
    const d = canvas.dimensions;

    // Will need to know the size of the padding pre-update, to move all placeables post-update.
    const prePadding = {x: d.paddingX, y: d.paddingY};
    const padding = canvas.scene.data.padding;

    // This update should not trigger a canvas.draw()
    SceneScroller.PreventCanvasDraw = true;

    await canvas.scene.update({width: size.width + 2 * d.size, height: size.height + 2 * d.size});

    // Update the underlying data since we're preventing a canvas.draw()
    canvas.dimensions = canvas.constructor.getDimensions({
        width: size.width + 2 * d.size,
        height: size.height + 2 * d.size,
        size: d.size,
        gridDistance: d.distance,
        padding: padding,
        shiftX: d.shiftX,
        shiftY: d.shiftY,
        grid: canvas.scene.data.grid
    });
    canvas.stage.hitArea = new PIXI.Rectangle(0, 0, canvas.dimensions.width, canvas.dimensions.height);
    canvas.msk.clear().beginFill(0xFFFFFF, 1.0).drawShape(canvas.dimensions.rect).endFill();
    canvas.background.drawOutline(canvas.outline);

    // Now move all placeables by a to-be-determined vector
    const postPadding = {
        x: canvas.dimensions.paddingX,
        y: canvas.dimensions.paddingY
    }

    const vector = {
        x: postPadding.x - prePadding.x,
        y: postPadding.y - prePadding.y
    }

    await canvas.pan( {
        x: canvas.stage.pivot.x + vector.x,
        y: canvas.stage.pivot.y + vector.y
    } )

    const placeables = {
        drawings: canvas.drawings.placeables,
        lights: canvas.lighting.placeables,
        notes: canvas.notes.placeables,
        sounds: canvas.sounds.placeables,
        templates: canvas.templates.placeables,
        tiles: [...canvas.background.placeables, ...canvas.foreground.placeables],
        tokens: canvas.tokens.placeables,
        walls: canvas.walls.placeables
    };

    // Move all the placeables and save
    await SceneScroller.offsetPlaceables(placeables, vector, true);
}

/**
 * A Function that will evaluate the largest required scene size and set the scene to that size.
 * Foundry Core will automatically propagate that change to all clients
 * @param {Scene}   scn         - The main Scene Scroller Scene
 * @param {Array}   actvTiles   - The current (or anticipated) array of tiles ID's in the scene
 * @return {Boolean}            - If the function fails, it will return false
 */
async function largestSceneSize(scn, actvTiles) {

    if (!game.user.isGM) {
        log(false, "A non-GM user triggered the largestSceneSize() function.");
        return false;
    }

    if (!scn instanceof Scene) {
        log(false, "Scene argument passed to largestSceneSize function is not a scene object");
        log(false, scn)
        return false;
    }
    if (!actvTiles.length) {
        log(false, "Array of tiles passed to largestSceneSize function is empty.")
        return false;
    }

    const d = canvas.dimensions;

    // Logic to figure out the required scene size for the largest combination of tile + linked tiles already in scene.
    const sceneDimensions = {width: 0, height: 0}
    // First, iterate through each Scene Tiler tile
    for (const tileID of actvTiles) {
        // For this tile, get all the possible linked tiles by their UUID's
        const tile = canvas.background.get(tileID);
        const uuidArray = tile.document.getFlag(ModuleName, "sceneScrollerTilerFlags").LinkedTiles.map(t => t.SceneUUID);
        // Now, get all the tiles in the background and filter/map to those that have Scene Tiler flags with scene UUID's in them
        const bgTileUuidArray = canvas.background.placeables.map(t => t.data.flags["scene-tiler"].scene);
        // Now filter uuidArray to only include tiles in bgTileUuidArray
        const filteredUuidArray = uuidArray.filter(u => bgTileUuidArray.includes(u));

        // The vectors in the scene-scroller flags for linked tiles represents the magnitude in X and Y to the coordinates to the top left corner of the linked tile.
        // Using our main tile as a starting point, build an array of x, y coordinates for all the linked tiles currently present in the scene.
        // Need the top left corner (TLC) as well as the top right corner and bottom left corner.
        const coordArrayX = [tile.data.x, tile.data.x + tile.width];
        const coordArrayY = [tile.data.y, tile.data.y + tile.height];
        for (const linkedUuid of filteredUuidArray) {
            const linkedTile = canvas.background.placeables.filter(t => t.data.flags["scene-tiler"].scene === linkedUuid)[0];
            const vector = tile.data.flags["scene-scroller"].sceneScrollerTilerFlags.LinkedTiles.filter(l => l.SceneUUID === linkedUuid)[0].Vector;
            const derivedTLCCoords = {x: linkedTile.data.x + vector.x, y: linkedTile.data.y + vector.y};
            coordArrayX.push(derivedTLCCoords.x);
            coordArrayY.push(derivedTLCCoords.y);
            // Do the same again, adding linkedTile width and height to the coordinates (top right corner, bottom left corner)
            const derivedWHCoords = {x: linkedTile.data.x + vector.x + linkedTile.width, y: linkedTile.data.y + vector.y + linkedTile.height}
            coordArrayX.push(derivedWHCoords.x);
            coordArrayY.push(derivedWHCoords.y);
        }

        // Now we need to find the largest x and y, the smallest x and y, and substract the smallest from the largest to get the new scene width and height.
        const largestX = Math.max(...coordArrayX);
        const largestY = Math.max(...coordArrayY);
        const smallestX = Math.min(...coordArrayX);
        const smallestY = Math.min(...coordArrayY);

        const newWidth = largestX - smallestX;
        const newHeight = largestY - smallestY;

        if (newWidth > sceneDimensions.width) sceneDimensions.width = newWidth;
        if (newHeight > sceneDimensions.height) sceneDimensions.height = newHeight;
    }

    if (sceneDimensions.width !== d.sceneWidth || sceneDimensions.height !== d.sceneHeight) {
        await resizeScene(sceneDimensions);
    }

    // When all is successfully completed
    return true;
}

/**
 * This function will retrieve the flags from the compendium scene and transfer them to the tile.
 * @param {Scene}               source      - The scene from the compendium
 * @param {Tile}                tile        - The tile to add the flags to
 * @return {Boolean}                        - If the function fails, it will return false
 * 
 */
async function transferCompendiumSceneFlags(source, tile) {

    if (!game.user.isGM) {
        log(false, "A non-GM user triggered the transferCompendiumSceneFlags() function.");
        return false;
    }

    const flags = source.getFlag("scene-scroller-maker", "sceneScrollerTilerFlags");
    if ( !flags ) {
        log(false, "The compendium scene has no links in flags or the getFlag method failed.");
        log(false, source);
        await deleteTilerTile(tile); 
        return false;
    }

    await tile.setFlag(ModuleName, "sceneScrollerTilerFlags", flags);

    return true;
}

/**
 * Creates a tile from a compendium scene via Scene Tiler module.
 * Then transfer compendium scene flags to the tile.
 * @param {Scene}           source          - Compendium scene to be made into a tile.
 * @return {Tile|false}                     - The tile created by Scene Tiler
 */
export async function createTilerTile(source) {

    if (!game.user.isGM) {
        log(false, "A non-GM user triggered the createTilerTile() function.");
        return false;
    }

    const d = canvas.dimensions;

    // The scene tiler module will create a tile out of the selected compendium scene, placing the top left corner at grid 1 x grid 1.
    const myTile = await SceneTiler.create(source, {x: d.paddingX + d.size, y: d.paddingY + d.size, populate: true});
    if ( !myTile ) {
        log(false, "Scene Tiler failed to create a tile.")
        return false;
    }

    // Transfer flags from compendium scene (source) and add them to myTile.
    const isTransfer = transferCompendiumSceneFlags(source, myTile);
    if ( !isTransfer) return false;

    // Update main scene flags with the array of created Scene Tiler tiles.
    let mainSceneFlags;
    const isFlags = canvas.scene.data.flags.hasOwnProperty(ModuleName);
    if ( !isFlags ) {
        mainSceneFlags =  foundry.utils.deepClone(SceneScroller.sceneScrollerSceneFlags);
    } else mainSceneFlags = foundry.utils.deepClone(canvas.scene.getFlag(ModuleName, "sceneScrollerSceneFlags"));

    mainSceneFlags.SceneTilerTileIDsArray.push(myTile.id);
    await canvas.scene.setFlag(ModuleName, "sceneScrollerSceneFlags", mainSceneFlags);

    // If necessary, resize the scene to fit the largest of: any tile plus all it's linked tiles.
    const isResize = await largestSceneSize(canvas.scene, mainSceneFlags.SceneTilerTileIDsArray);
    if (!isResize) {
        log(false, "Failed to resize the main Scene Scroller scene.");
        await deleteTilerTile(myTile);
        return false;
    }

    return myTile;
}

export async function message_handler(request) {
    switch (request.action) {
      case '????':
        break;
    }
}