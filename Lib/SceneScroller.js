 import { ModuleName } from "../ss-initialize.js";
import { ScrollerSelectScene, NewTokenTileSelectUI } from "./Forms.js";
import { socketWrapper, msgDict } from "./Socket.js";
import { createTilerTile, log, moveTokenLocal, tilerTilePlaceables } from "./Functions.js";

/**
 * Manipulates the scene in several ways to stitch smaller scenes together to simulate a much bigger scene
 * 
 * Defined as a class for future plans to generate maps like a maze or labyrinth by randomly choosing smaller scenes by filtering for tags.
 * The intent is to extend this class to override methods to achieve that.
 * 
 * This class is expected to manipulate the scene in several ways:
 *  - Change the size of the scene on the fly, to accomododate new sub-scenes (as tiles from Scene Tiler)
 *  - Move the contents (placeables) in the scene as new sub-scenes (tiles) are added and old ones removed
 * 
 * @class SceneScroller
 */
export class SceneScroller {

    /**
     * A schema of the flag data that is stored in the Scene Scroller scene.
     * @memberof SceneScroller
     */
    static sceneScrollerSceneFlags = {
        SceneTilerTileIDsArray: [], // an array of Scene Tiler tile ID's active in the scene
    }

    /**
     * A schema of the object to be stored in the tilerFlags array (see below)
     */
    static sceneScrollerTileLinks = {
        SceneUUID: "", // The UUID to the linked compendium scene
        Vector: {},  // ex: {x: 0, y: 0} An object with x & y coordinates in pixels, to the linked tile
        ButtonVector: {} // ex: {x: 0, y: 0} An object with x & y coordinates in pixels, to the desired location of the button
    }

    /**
     * A schema of the flag data stored in each compendium Scene, which gets transfered to each Scene Tiler tile.
     * @memberof SceneScroller
     */
    static sceneScrollerTilerFlags = {
        LinkedTiles: [], // An array of sceneScrollerTileLinks objects
    }

    static SceneScrollerTokenFlags = {
        CurrentTile: "",  // The Scene Tiler tile ID of the tile the token is currently occupying
        inTileLoc: {},  // ex: {x: 0, y: 0} An object with x & y coordinates in pixels, relative to the top left corner of CurrentTile
    }

    /** A variable to identify when to supress canvas#draw()
     *  Used in libwrapper
     *  @param {Boolean}
     */
    static PreventCanvasDraw = false;

    /**
     * A Method to identify if a scene is being used as a Scene Scroller Scene.
     * It does this by looking for a flag set when SceneTiler is activated.
     * @static
     * @param {Scene}       scn       - The scene to query
     * @return {Boolean}
     * @memberof SceneScroller 
     */
    static isScrollerScene(scn) {
        if (scn?.data?.flags?.hasOwnProperty(ModuleName)) return true;
        return false;
    }

    /**
     * A Method activated by the GM via a UI button to establish (a hopefully empty scene) as a Scene Scroller Scene.
     *  - The method will add scrollerFlags to the scene flags, and
     *  - The method will launch a form application to prompt the GM to choose an origin scene from a scene compendium
     * @param {Scene}       scn         -The scene that will become the main Scene Scroller Scene
     * @return {void}
     */
    static async initialize(scn) {
        // Just in case...
        if (!game.user.isGM) return;

        // Open a form application to prompt the GM to select an origin scene from a compendium
        const source = await new Promise((resolve) => {
            new ScrollerSelectScene(resolve).render(true);
        })

        if (source === null) {
            ui.notifications.error("No seed scene was selected.  Scene initialization failed.");
            log(false, "Scene Scroller Scene initialization failed because a seed scene was not selected.");
            return;
        }

        // Import the compendium scene as a tile
        const myTile = await createTilerTile(source);
        if ( !myTile ) {
            log(false, "Scene Scroller initialization failed.  Source object passed to createTilerTile():")
            log(false, source);
            ui.notifications.error("Scene Scroller scene initialization failed.")
            return;
        }

        log(true, "Scene [" + canvas.scene.id + "] initialized as a Scene Scroller scene.")
    }

    /**
     * This method should be invoked by a trigger (button, condition, etc...) to spawn a new tile that a
     * token will soon be able to see with token vision.  The trigger can originate from a user and will
     * have to be passed to the GM via socket to execute.
     * @param {String}      sceneUUID      - a UUID identifying a scene in a compendium.
     * @return {void}
     */
    static async spawnLinkedTile(sceneUUID) {
        // Just in case...
        if (!game.user.isGM) return;

        const source = await fromUuid(sceneUUID);
        if (source === null) {
            log(false, "Linked scene could not be found via the UUID.");
            log(false, sceneUUID);
            return;
        }

        // Import the compendium scene as a tile
        const myTile = createTilerTile(source);
        if ( !myTile ) {
            log(false, "Spawning linked tile failed.  Source object passed to createTilerTile():");
            log(false, source);
            ui.notifications.error("Spawning linked compendium scene failed.")
            return;
        }

        log(true, "Scene-Tiler tile [" + myTile.id + "] created in scene [" + canvas.scene.id + "].");
    }

    /** A method that will offset selected placeables by a vector.
     *  Libwrapper will wrap Scene.prototype._onUpdate to prevent a canvas.draw() when this method is initiated.
     *  The placeables will be moved manually per client to ensure there is no visual disruption.
     *  In some instances, placeables will be moved per client and NOT saved.
     *  In other instances, the placeables will be moved and saved for all clients.
     * 
     * @param {Object}          placeables      -  {drawings: [],
     *                                              lights: [],
     *                                              notes: [],
     *                                              sounds: [],
     *                                              templates: [],
     *                                              tiles: [],
     *                                              tokens: [],
     *                                              walls: []
     *                                             }
     * @param {Object}          vector          -  {x: Number, y: Number}
     * @param {Boolean}         save            - (Optional), Default, false.  If true, will save translation to database.
     */
    static async offsetPlaceables(placeables, vector, save = false) {
        // To keep the visuals smooth, prevent a canvas.draw()
        socketWrapper(msgDict.preventCanvasDrawTrue);

        const updates = {
            drawings: [],
            lights: [],
            notes: [],
            sounds: [],
            templates: [],
            tiles: [],
            tokens: [],
            walls: []
        };

        for (const placeableKey in placeables) {
            switch(placeableKey) {
                case "walls":
                    for (const placeable of placeables[placeableKey]) {
                        placeable.data.c[0] += vector.x;
                        placeable.data.c[2] += vector.x;
                        placeable.data.c[1] += vector.y;
                        placeable.data.c[3] += vector.y;
                        updates[placeableKey].push({_id: placeable.id, c: [
                            placeable.data.c[0],
                            placeable.data.c[1],
                            placeable.data.c[2],
                            placeable.data.c[3]
                        ]});
                    }
                    break;
                default:
                    for (const placeable of placeables[placeableKey]) {
                        placeable.position.set(placeable.data.x + vector.x, placeable.data.y + vector.y);
                        placeable.data.x += vector.x;
                        placeable.data.y += vector.y;
                        updates[placeableKey].push({_id: placeable.id, x: placeable.data.x, y: placeable.data.y});
                        switch(placeableKey) {
                            case "lights":
                                placeable.updateSource({defer: true});
                                break;
                            case "templates":
                                placeable.draw();
                                break;
                        }
                    }
            }
        }

        // Reposition only door icons that belong to the Scene Tiler tile
        const doorIcons = canvas.walls.placeables.filter(w => w.doorControl !== undefined)
                                .filter(w => placeables?.walls?.includes(w));

        for (let door of doorIcons) {
        const dcPos = door.doorControl.position;
        door.doorControl.position.set(dcPos.x + vector.x, dcPos.y + vector.y);
        }

        if ( save ) await canvas.scene.update(updates);
    }

    /** This function will interrupt the core token creation workflow to present a formapplication requesting the user
     *  choose on what Scene-Tiler tile the token should be located.  Alternatively, can offer the option to create the token on 
     *  the same tile as existing tokens.
     *  This function will be triggered off a "preCreateToken" hook and must return false.  Upon completion of the formapplication
     *  selection, the data will submit a new token creation which will include Scene Scroller flags
     *  @param {Object}             data            - Token Data object
     *  @return {Boolean}
     */
    static tokenCreate(...args) {
        const [doc, data, options, userId] = args;
        // This workflow is only for scene-scroller scenes.
        if ( !SceneScroller.isScrollerScene(canvas.scene) ) return true;
        // If Scene-Scroller hasn't populated flags with needed information for token creation, the stop the workflow and launch UI.
        if ( !doc.data.flags.hasOwnProperty(ModuleName) ) {
            new NewTokenTileSelectUI(data, {left: ui.sidebar._element[0].offsetLeft - 300, top: 100}).render(true);
            return false;
        }

        if ( doc.data.flags[ModuleName].inTileLoc === null ) {
            const destTile = canvas.background.get(doc.data.flags[ModuleName].CurrentTile);
            doc.data.update({"flags.scene-scroller.inTileLoc" : {x: data.x - destTile.position._x, y: data.y - destTile.position._y}});
            // For tokens belonging to synthetic actors (unlinked tokens)
            if ( !data.actorLink ) {
                doc.data.actorData.flags = data.flags
            }
            // The flags we set on the actor in the dropCanvasData hook are no longer needed.
            // The update is synchronous... don't need to wait for the promise.
            const actor = game.actors.get(data.actorId);
            actor.data.token.update({"flags.-=scene-scroller" : null});

            // update data to place the token at the home position
            const d = canvas.dimensions;
            data.x = d.paddingX;
            data.y = d.paddingY;

            // Allow token creation to continue and finish.
            return true;
        }
        
    }

    /** This function will activate (make visible) the Scene-Tiler tile entered as a parameter.
     *  All adjacent (linked) Scene-Tiler tiles that are already in the scene will also be activated.
     *  All activated Scene-Tiler tiles will be sorted and placed in the main scene window in the correct position relative to each other.
     *  Optionally, all the placeable objects belonging to each activated Scene-Tiler tile can be activated and positioned in the main scene.
     *  Tokens that are associated with the activated Scene-Tiler tiles will be activated (visible) and be moved (locally) to their correct
     *    position relative to their associated Scene-Tiler tile.
     * 
     *  @param {String}         tilerTile               - The tile ID for the 'main' Scene-Tiler tile.
     *  @param {Boolean}        translatePlaceables     - Optional boolean parameter to indicate if transfering placeables is required.  Defaults to true.
     *  @return {Boolean}                               - Return true on success.  Return false if the function fails.
     */
    static displaySubScenes(tilerTile, translatePlaceables = true) {
        // TO-DO: If there's a controlled token, save it, then set it to not controlled.
        // This will trigger a scene update resetting the scene.

        // This is the main Scene Tiler tile:
        const mainTile = canvas.background.get(tilerTile);
        // Get all the linked tiles by the array of ID's saved in main tile flags.  This is an array of UUID's
        const linkedTileUuidArr = mainTile.document.getFlag('scene-scroller', 'sceneScrollerTilerFlags')
                                            .LinkedTiles.map(l => l.SceneUUID);
        // Get all the Scene-Tiler tiles in the scene from scene Flags.  This is an array of tile ID's
        const tilerTilesArr = canvas.scene.getFlag(ModuleName, "sceneScrollerSceneFlags").SceneTilerTileIDsArray;

        // Build a Map with the tileDocument as the Key and object {x: <number>, y: <number>, uuid: <string>} containing x and y coordinates.
        // When adding entries to the map, don't duplicate keys.  Each tileDocument should be unique in the map.
        // If a tileDocument is already in the map, compare the x and y values and keep the smallest.
        const tilerTileCoords = new Map();
        // Begin by entering the data for the mainTile, whose top left corner (TLC) will be the reference point for the vector for all other tiles.
        tilerTileCoords.set(mainTile, {
            x: mainTile.data.x, y: mainTile.data.y, uuid: null});
        // Now iterate for all linkedTiles and add/update the map
        for (const tileId of tilerTilesArr) {
            // Get the tile document for this tileId
            const tile = canvas.background.get(tileId);
            // Get the UUID for this tileId
            const Uuid = tile.document.getFlag("scene-tiler", "scene");
            // Skip any tiles that aren't in the mainTile's linked tile array
            if ( !linkedTileUuidArr.includes(Uuid) ) continue;
            // Get the vector associated with this linked tile
            const vector = mainTile.document.getFlag("scene-scroller", 'sceneScrollerTilerFlags')
                                    .LinkedTiles.filter(id => id.SceneUUID === Uuid)[0]
                                    .Vector;
            // Update the map with data, as appropriate
            tilerTileCoords.set(tile, {
                x: tile.data.x - (tile.data.x + vector.x), 
                y: tile.data.y - (tile.data.y + vector.y),
                uuid: Uuid
            })
        }

        // Find the smallest X and the smallest Y in the map
        const testX = Array.from(tilerTileCoords.values()).map(v => {return v.x});
        const testY = Array.from(tilerTileCoords.values()).map(v => {return v.y});
        const smallestX = Math.min(...testX);
        const smallestY = Math.min(...testY);
        
        // Using the smallestX & smallestY with tilertileCoords map, we can move (locally) all the tiles to the position they need to be in.
        // The smallest X and smallest Y will be set to position x = grid and y = grid.
        // If required, move all the tile placeables by the same translation.
        for (const [k,v] of tilerTileCoords.entries()) {
            const vector = mainTile.document.getFlag("scene-scroller", 'sceneScrollerTilerFlags')
                                    .LinkedTiles.filter(id => id.SceneUUID === v.uuid)[0]
                                    ?.Vector || {x: 0, y: 0};
            const derivedVector = {x: -vector.x - smallestX, y: -vector.y - smallestY}
            k.position.set(k.data.x + derivedVector.x, k.data.y + derivedVector.y);
            k.data.x += derivedVector.x;
            k.data.y += derivedVector.y;
        }

        // TO-DO: For each token associated with any particular active tile, move the token to the position (relative to tile TLC) saved in the token flags.
        const allTokensArr = canvas.tokens.placeables;
        for (const token of allTokensArr) {
            if ( tilerTilesArr.includes(token.data.flags[ModuleName].CurrentTile)) {
                moveTokenLocal(token);
            }
        }

        // If required, move all the placeable objects associated with this tile (see Scene-Tiler flags) by the same translation.
        if ( !translatePlaceables ) return;
        for (const tileId of tilerTilesArr) {
            const tile = canvas.background.get(tileId);
            const placeablesIds = tile.document.getFlag("scene-tiler", "entities");
            const placeables = tilerTilePlaceables(placeablesIds);
            const d = canvas.dimensions;
            this.offsetPlaceables(placeables, {x: tile.position._x - d.paddingX - d.size, y: tile.position._y - d.paddingY - d.size});
        }


        // TO-DO: If a controlled token was saved, re-enable control.  This will trigger displaySubScenes (again).
    }
}