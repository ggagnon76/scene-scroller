import { ModuleName, ModuleTitle } from "../ss-initialize.js";
import { SceneScroller } from "./SceneScroller.js";
import { msgDict, socketWrapper } from "./Socket.js";

/** A wrapper function that works with the Foundryvtt-devMode module to output debugging info
 *  to the console.log, when a debugging boolean is activated in module settings.
 *  Or the code can pass TRUE to the force argument to output to console.log regardless of the debugging boolean.
 *  @param {Boolean}    force   - A manual bypass to force output regardless of the debugging boolean
 *  @param {}           args    - The content to be output to console.log
 *  @return {void}
 */
export function log(force, ...args) {
    const isDebugging = game.modules.get('_dev-mode')?.api?.getPackageDebugValue(ModuleName);

    if ( isDebugging ) {
        console.log(ModuleTitle,  "debugging | ", ...args);
    } else if ( force ) {
        console.log(ModuleTitle, " | ", ...args)
    }
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
 * A function that clears all the placeable objects referenced by the sub-scene (Scene Tiler tile), then deletes the tile.
 * @param {Tile}    tile        - The Scene Tiler tile to be deleted.
 * @return {void}
 */
export async function deleteTilerTile(tile) {

    if (!game.user.isGM) {
        log(false, "A non-GM user triggered the deleteTilerTile() function.");
        return false;
    }

    await SceneTiler.clearSceneTile(tile);
    await canvas.scene.deleteEmbeddedDocuments("Tile", [tile.id]);
}

/** Trigger a refresh of the canvas scene to update the background outline and other rects.
 *  Has to be executed on GM client and player clients via socket.
 *  @param {Object}         size        - the new scene size, format: {width: <Number>, height: <Number>}
 *  @return {void}
 */
export async function refreshSceneAfterResize(size) {

    const d = canvas.dimensions;
    const oldData = {
        paddingX: d.paddingX,
        paddingY: d.paddingY,
        width: d.width,
        height: d.height
    }

    canvas.dimensions = canvas.constructor.getDimensions({
        width: size.width + 2 * d.size,
        height: size.height + 2 * d.size,
        size: d.size,
        gridDistance: d.distance,
        padding: canvas.scene.data.padding,
        shiftX: d.shiftX,
        shiftY: d.shiftY,
        grid: canvas.scene.data.grid
    });

    const deltaPadding = {
        x: canvas.dimensions.paddingX - oldData.paddingX,
        y: canvas.dimensions.paddingY - oldData.paddingY
    }

    // Update the location of placeables to account for any delta in paddingX & paddingY
    const placeables = getAllPlaceables();
    SceneScroller.offsetPlaceables(placeables, deltaPadding, {save: true, wallHome: true})

    canvas.stage.hitArea = canvas.dimensions.rect;
    canvas.templates.hitArea = canvas.dimensions.rect;
    await canvas.lighting.tearDown();
    await canvas.lighting.draw();
    canvas.perception.initialize();
    canvas.sight.hitArea = canvas.dimensions.rect;
    canvas.tokens.hitArea = canvas.dimensions.rect;


    canvas.grid.draw();
    canvas.background.drawOutline(canvas.outline);
    canvas.msk.clear().beginFill(0xFFFFFF, 1.0).drawShape(canvas.dimensions.rect).endFill();
    canvas.primary.mask = canvas.msk;
    canvas.effects.mask = canvas.msk;
}

/** This function pans the scene by the same amount as the input vector
 *  It is a separate function because it will have to be called by the clients.
 *  @param {Object}         vector          - of the form {x: <Number>, y: <Number>}
 *  @return {void}
 */
export async function vectorPan(vector) {
    await canvas.pan( {
        x: canvas.stage.pivot.x + vector.x,
        y: canvas.stage.pivot.y + vector.y
    } )
}

/** A function that will resize the scene, and translate all placeables back to a determined coordinate.
 *  Core will propagate this scene size change to all clients.
 *  Core will NOT translate the placeables for every client!
 *  @param {Object}         size        - An object with form {width: <Number>, height: <Number>}
 *  @return {void}
 */
async function resizeScene(size) {

    if (!game.user.isGM) {
        log(false, "A non-GM user triggered the resizeScene() function.");
        return false;
    }

    const d = canvas.dimensions;

    // This update should not trigger a canvas.draw()
    socketWrapper("preventCanvasDrawTrue");

    await canvas.scene.update({width: size.width + 2 * d.size, height: size.height + 2 * d.size});

    // Update the underlying data since we're preventing a canvas#draw()
    socketWrapper("refreshAfterResize", size)
}

/**
 * A Function that will evaluate the largest required scene size and set the scene to that size.
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
        const uuidArray = tile.document.getFlag(ModuleName, "LinkedTiles").map(t => t.SceneUUID);
        // Now, get all the tiles in the background and map those that have Scene Tiler flags with scene UUID's in them
        const bgTileUuidArray = canvas.background.placeables.map(t => t.data?.flags["scene-tiler"]?.scene);
        // Now filter uuidArray to only include tiles present in bgTileUuidArray
        const filteredUuidArray = uuidArray.filter(u => bgTileUuidArray.includes(u));

        // The vectors in the scene-scroller flags for linked tiles represents the magnitude in X and Y to the coordinates to the top left corner of the linked tile.
        // Using our main tile as a starting point, build an array of x, y coordinates for all the linked tiles currently present in the scene.
        // Need the top left corner (TLC) as well as the top right corner and bottom left corner in the coordArrays.
        const coordArrayX = [tile.data.x, tile.data.x + tile.width];
        const coordArrayY = [tile.data.y, tile.data.y + tile.height];
        for (const linkedUuid of filteredUuidArray) {
            const linkedTile = canvas.background.placeables.filter(t => t.data.flags["scene-tiler"]?.scene === linkedUuid)[0];
            const vector = tile.data.flags["scene-scroller"].LinkedTiles.filter(l => l.SceneUUID === linkedUuid)[0].Vector;
            const derivedTLCCoords = {x: linkedTile.data.x - vector.x, y: tile.data.y - vector.y};
            coordArrayX.push(derivedTLCCoords.x);
            coordArrayY.push(derivedTLCCoords.y);
            // Do the same again, adding linkedTile width and height to the coordinates (top right corner, bottom left corner)
            const derivedWHCoords = {x: linkedTile.data.x - vector.x + linkedTile.data.width, y: linkedTile.data.y - vector.y + linkedTile.data.height}
            coordArrayX.push(derivedWHCoords.x);
            coordArrayY.push(derivedWHCoords.y);
        }

        // Now we need to find the largest x and y, the smallest x and y, and substract the smallest from the largest to get the new scene width and height.
        const newWidth = Math.max(...coordArrayX) - Math.min(...coordArrayX);
        const newHeight = Math.max(...coordArrayY) - Math.min(...coordArrayY);

        if (newWidth > sceneDimensions.width) sceneDimensions.width = newWidth;
        if (newHeight > sceneDimensions.height) sceneDimensions.height = newHeight;
    }

    // Make sure the sceneDimensions are multipls of grid.size
    sceneDimensions.width = Math.ceil(sceneDimensions.width / d.size) * d.size;
    sceneDimensions.height = Math.ceil(sceneDimensions.height / d.size) * d.size;

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

    for (const [k,v] of Object.entries(flags)) {
        await tile.setFlag(ModuleName, k, v);
    }

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
    const isTransfer = await transferCompendiumSceneFlags(source, myTile);
    if ( !isTransfer) return false;

    // Update main scene flags with the array of created Scene Tiler tiles.
    let mainSceneFlags = foundry.utils.deepClone(SceneScroller.sceneScrollerSceneFlags);
    const isFlags = canvas.scene.data.flags.hasOwnProperty(ModuleName);
    if ( isFlags ) {
        for (let [k,v] of Object.entries(mainSceneFlags)) {
            mainSceneFlags[k] = foundry.utils.deepClone(canvas.scene.getFlag(ModuleName, k));
        }
    }

    mainSceneFlags.SceneTilerTileIDsArray.push(myTile.id);
    for (const [k,v] of Object.entries(mainSceneFlags)) {
        await canvas.scene.setFlag(ModuleName, k, v);
    }

    // If necessary, resize the scene to fit the largest of: any tile plus all it's linked tiles.
    const isResize = await largestSceneSize(canvas.scene, mainSceneFlags.SceneTilerTileIDsArray);
    if (!isResize) {
        log(false, "Failed to resize the main Scene Scroller scene.");
        await deleteTilerTile(myTile);
        return false;
    }

    return myTile;
}

/** When the viewport is showing sub-scenes, this function will reset everything to their home positions
 *  @param {Boolean}        translatePlaceables         - Defaults to true.  (token creation sub-scene preview will not move placeables)
 *  @return {void}  
 */
export function resetMainScene(translatePlaceables = true) {
    // Get ID's for all sub-scenes (Scene Tiler tiles) in the viewport (main Foundry scene).
    const tilerTilesArr = canvas.scene.getFlag(ModuleName, "SceneTilerTileIDsArray");
    // Map tilerTilesArr to find only sub-scenes that are not at their home position
    const d = canvas.dimensions;
    const tilesToHomeArr = tilerTilesArr.map(t => {
        const tile = canvas.background.get(t);
        if ( tile.visible === true ) return tile
    }).filter(t => t !== undefined);

    // Gather arrays of placeable IDs, then move everything by a derived vector.
    for (const tile of tilesToHomeArr) {
        const placeablesIds = tile.document.getFlag("scene-tiler", "entities");
        const placeables = tilerTilePlaceables(placeablesIds);
        const vector = {
            x: (d.paddingX + d.size) - tile.position._x,
            y: (d.paddingY + d.size) - tile.position._y 
        }
        tile.position.set(d.paddingX + d.size, d.paddingY + d.size);
        tile.data.x = d.paddingX + d.size;
        tile.data.y = d.paddingY + d.size;
        tile.visible = false;
        if ( translatePlaceables ) {
            SceneScroller.offsetPlaceables(placeables, vector, {wallHome: true});
            isVisiblePlaceables(placeables, false);
        }
    }

    // All tokens should also be at their home position
    const tokensArr = canvas.tokens.placeables;
    for (const token of tokensArr) {
        token.position.set(d.paddingX, d.paddingY);
        token.data.x = d.paddingX;
        token.data.y = d.paddingY;
    }
}

/** This function will convert the array of placeable ID's obtained from the Scene Tiler flags
 *  into arrays of objects
 */
export function tilerTilePlaceables(placeablesId) {
    const placeables = {};
    for (const [k,v] of Object.entries(placeablesId)) {
        switch (k) {
            case "drawings":
                placeables[k] = v?.map(d => canvas.drawings.get(d));
                break;
            case "lights":
                placeables[k] = v?.map(l => canvas.lighting.get(l));
                break;
            case "notes":
                placeables[k] = v?.map(n => canvas.notes.get(n));
                break;
            case "sounds":
                placeables[k] = v?.map(s => canvas.sounds.get(s));
                break;
            case "templates":
                placeables[k] = v?.map(t => canvas.templates.get(t));
                break;
            case "tiles":
                placeables[k] = v?.map(t => canvas.background.get(t) || canvas.foreground.get(t));
                break;
            case "walls":
                placeables[k] = v?.map(w => canvas.walls.get(w));
                break;
        }
    }
    return placeables;
}

/** This function is called by a preUpdateToken hook.  See ss-initialize.js
 *  The purpose of this function is to populate the token flags with coordinates
 *  defining the relation of the token to the tile top left corner (TLC)
 *  @param {Object}             Token       - The token object passed by the hook
 *  @param {Object}             data        - An object containing the changes passed by the hook
 *  @param {Object}             options     - An ojbect of options passed by the hook
 *  @param {Object}             id          - The id of ?? passed by the hook
 *  @return {void}
 */
export async function preUpdateTokenFlags(token, data, options, id) {
    if ( !SceneScroller.isScrollerScene(canvas.scene) ) return;
    // Only interested in token movement.
    if ( !data.hasOwnProperty("x") && !data.hasOwnProperty("y")) return;
    // If the change is to update the token to the home position, allow this.
    const d = canvas.dimensions;
    if ( data.x === d.paddingX && data.y === d.paddingY) return;

    // There is a change representing token movement.
    // If the token will finish in a new sub-scene (scene-tiler tile), execute a different set of updates:
    const currLoc = token.getFlag(ModuleName, "inTileLoc");
    const dest = {
        x: data.hasOwnProperty("x") ? data.x : token.data.x,
        y: data.hasOwnProperty("y") ? data.y : token.data.y
    }
    const isNewEndTile = isEndNewTile(token, dest);
    if ( isNewEndTile ) {
        Hooks.once('preTokenAnimate', (token, data) => {
            data.ontick = (dt, anim) => {
                token._onMovementFrame(dt, anim, data.config);
                newTile_UpdateFlags(token, isNewEndTile);
            }
        })
    }

    // The token will end the movement in the same sub-scene.  Update the token flags with the new location.
    // Don't alter the changes in the hook, to maintain the proper direction for token animation.
    const destTile = canvas.background.get(token.getFlag(ModuleName, "CurrentTile"));
    const newLoc = {};
    newLoc.x = data.hasOwnProperty("x") ? data.x - destTile.position._x : currLoc.x;
    newLoc.y = data.hasOwnProperty("y") ? data.y - destTile.position._y : currLoc.y;
    await token.setFlag(ModuleName, "inTileLoc", {x: newLoc.x, y: newLoc.y});
}

/** This function is called when the token needs to be placed in the viewport relative to its parent sub-scene
 *  @param {Object}         token           - The token object to be translated.
 *  @return {void}
 */
export function moveTokenLocal(token) {
    const tile = canvas.background.get(token.data.flags[ModuleName].CurrentTile);
    const tileOffset = token.data.flags[ModuleName].inTileLoc;
    token.position.set(tile.position._x + tileOffset.x, tile.position._y + tileOffset.y);
    token.data.x = token.data._source.x = tile.position._x + tileOffset.x;
    token.data.y = token.data._source.y = tile.position._y + tileOffset.y;
    token.visible = true;
}

/** This function is called by the 'controlToken' hook.  See ss-initialize.js
 *  When a token selected (controlled) or released, this will automatically reset the home position of the token
 *  regardless of where it is in the viewport, as a precaution.
 *  If the token is being released, any animations will be terminated and the viewport will be reset
 *  If the token is being controlled, the viewport will be updated to show the relevant sub-scenes
 *  @param {Object}         token           - The token oject
 *  @param {Boolean}        isControlled    - A boolean indicating if the token is being controlled (true) or released (false)
 *  @return {void}
 */
export async function controlToken(token, isControlled) {
    // Reset ALL tokens to home position that aren't already there.
    const d = canvas.dimensions;
    const tokens = canvas.tokens.placeables.filter(t => t.data.x !== d.paddingX && t.data.y !== d.paddingY);
    for (const token of tokens) {
        // If the token was deleted, the database won't find it...
        try {
            await token.document.update({x: d.paddingX, y: d.paddingY}, {animate: false})
        }
        catch(err) {
            log(false, "Token position update error.  If the token wasn't deleted, enable debugging for error message.");
            log(false, err);
        }
    }

    // If the token is being released
    if ( !isControlled ) {
        canvas.tokens.concludeAnimation();
        return resetMainScene();
    }

    // If the token is being controlled.
    const destTile = token.data.flags[ModuleName].CurrentTile;
    SceneScroller.displaySubScenes(destTile);
}

export function getAllPlaceables() {
    return {
        drawings: canvas.drawings.placeables,
        lights: canvas.lighting.placeables,
        notes: canvas.notes.placeables,
        sounds: canvas.sounds.placeables,
        templates: canvas.templates.placeables,
        tiles: [...canvas.background.placeables, ...canvas.foreground.placeables],
        tokens: canvas.tokens.placeables,
        walls: canvas.walls.placeables
    };
}

export function isVisiblePlaceables(placeables, bool) {
    for (const [placeableName, placeablesArr] of Object.entries(placeables)) {
        for (const placeable of placeablesArr) {
            placeable.visible = bool;
            switch(placeableName) {
                case "lights" :
                    placeable.data.hidden = !bool;
                    placeable.updateSource({defer: true});
                    break;
                case "templates":
                    canvas.grid.highlightLayers[`Template.${placeable.id}`].visible = bool;
                    break;
            }
        }
    }
}

function isEndNewTile(token, destination) {

    const onTileId = token.getFlag(ModuleName, "CurrentTile");
    const onTile = canvas.background.get(onTileId);

    // Get the sub-scene (Scene Tiler tile) ID's from scene flags
    const subSceneIds = canvas.scene.getFlag(ModuleName, "SceneTilerTileIDsArray");
    // filter out all sub-scenes the token will not be occupying
    const subScenesContainToken = subSceneIds.map(id => {
                return canvas.background.get(id);
            })
            .filter(tile => tile.visible === true)      // remove tiles that are disabled (visible = false)
            .filter(tile =>                             // remove all tiles the token is not contained within
                destination.x >= tile.position._x &&
                destination.y >= tile.position._y &&
                tile.position._x + tile.data.width >= destination.x &&
                tile.position._y + tile.data.height >= destination.y 
            )
    if ( !subScenesContainToken.length ) return false;
    if ( subScenesContainToken.length === 1 && subScenesContainToken[0].id === onTile.id ) return false;  // The only tile in the array is the one already in token flags.  No need to proceed.

    // If there's one or more tiles in the array and it's not the one currently in token flags
    ui.notifications.info("New Tile!");
    return subScenesContainToken
}

const debounceTileFlagUpdate = foundry.utils.debounce(async (tile, token) => {
    await token.document.setFlag(ModuleName, "CurrentTile", tile.id);
    const newLoc = {
        x: token.data.x - tile.position._x,
        y: token.data.y - tile.position._y
    }
    await token.document.setFlag(ModuleName, "inTileLoc", newLoc)
    resetMainScene();
    SceneScroller.displaySubScenes(tile.id);
    ui.notifications.info("Debounce triggered.")
}, 1000);

function newTile_UpdateFlags(token, tiles) {
    const currTileId = token.document.getFlag(ModuleName, "CurrentTile");
    const currTile = canvas.background.get(currTileId);

    for (const tile of tiles) {
        if ( tile === currTile) continue;

        // Normalize to Tile coordinates
        let x = token.center.x - tile.position._x;
        let y = token.center.y - tile.position._y;

        // Account for tile rotation
        if ( tile.data.rotation !== 0 ) {
            const anchor = {x: tile.tile.anchor.x * tile.data.width, y: tile.tile.anchor.y * tile.data.height};
            let r = new Ray(anchor, {x, y});
            r = r.shiftAngle(-tile.tile.rotation);
            x = r.B.x;
            y = r.B.y;
        }

        // First test against the bounding box
        if ( (x < tile._alphaMap.minX) || (x > tile._alphaMap.maxX) ) continue;
        if ( (y < tile._alphaMap.minY) || (y > tile._alphaMap.maxY) ) continue;

        // Next test a specific pixel
        const px = (Math.round(y) * Math.round(Math.abs(tile.data.width))) + Math.round(x);
        const isNewTile =  tile._alphaMap.pixels[px] === 1;

        if ( isNewTile ) {
            debounceTileFlagUpdate(tile, token);
        }
    }
}