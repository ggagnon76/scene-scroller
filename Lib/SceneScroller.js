import { ModuleName } from "../ss-initialize.js";
import { createTilerTile, log } from "./Functions.js";
import { ScrollerSelectScene, NewTokenTileSelectUI } from "./Forms.js";
import { socketWrapper, msgDict } from "./Socket.js";
import { createTilerTile, log, socketWrapper, msgDict } from "./Functions.js";

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
        Vector: {},  // ex: {x: 0, y: 0} An object with x & y coordinates in pixels, relative to the top left corner of CurrentTile
        ActiveTilerTileIDs: [], // A subset of the SceneTilerTileIDsArray from Scene Flags that represents tiles the token can see with vision.
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
                case "tiles":
                    for (const placeable of placeables[placeableKey]) {
                        placeable.position.set(
                            placeable.data.x + vector.x,
                            placeable.data.y + vector.y
                        );
                        updates[placeableKey].push({_id: placeable.id, x: placeable.data.x, y: placeable.data.y});
                    }
                default:
                    for (const placeable of placeables[placeableKey]) {
                        placeable.data.x += vector.x;
                        placeable.data.y += vector.y;
                        updates[placeableKey].push({_id: placeable.id, x: placeable.data.x, y: placeable.data.y});
                    }
            }
        }

        // Reposition all door icons
        const doorIcons = canvas.walls.placeables.filter(w => w.doorControl !== undefined);

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
        // Many checks before stopping the token creation workflow!
        if ( !this.isScrollerScene(canvas.scene) ) return true;
        if ( doc.data.flags.hasOwnProperty("SceneScrollerTokenFlags") ) {
            const actor = game.actors.get(data.actorId);
            actor.data.token.update({"flags.-=SceneScrollerTokenFlags" : null});  // not awaited.  Can't anyway because it's called in a hook.
            return true;
        }
        
        // Launch a formApplication here.
        new NewTokenTileSelectUI(data).renderPopout();
        return false;
    }

    /** This function will activate (make visible) the Scene-Tiler tile entered as a parameter.
     *  All adjacent (linked) Scene-Tiler tiles that are already in the scene will also be activated.
     *  All activated Scene-Tiler tiles will be sorted and placed in the main scene window in the correct position relative to each other.
     *  All the placeable objects belonging to each activated Scene-Tiler tile will be activated and positioned in the main scene.
     *  Tokens that are associated with the activated Scene-Tiler tiles will be activated (visible) and be moved (locally) to their correct
     *    position relative to their associated Scene-Tiler tile.
     * 
     *  @param {String}         tilerTile       - The tile ID for the 'main' Scene-Tiler tile.
     *  @return {Boolean}                       - Return true on success.  Return false if the function fails.
     */
    static displaySubScenes(tilerTile) {
        // This is the main Scene Tiler tile:
        const mainTile = canvas.background.get(tilerTile);
        // Get all the linked tiles by the array of ID's saved in main tile flags.  This is an array of UUID's
        const linkedTileUuidArr = mainTile.getFlag('scene-tiler-maker', 'sceneScrollerTilerFlags')
                                            .LinkedTiles.map(l => l.SceneUUID);
        // Get all the Scene-Tiler tiles in the scene from scene Flags.  This is an array of tile ID's
        const tilerTilesArr = canvas.scene.getFlag(ModuleName, "sceneScrollerSceneFlags").SceneTilerTileIDsArray;

        // Build two arrays of objects, one for X, one for Y.  Each object will contain coordinates and the associated linked tile.
        // The X array will contain the left side of each tile, as placed by the mainTile vectors for each respective linked tile.  Use mainTile left side as a starting point.
        // The Y array will contain the top side of each tile, as placed by the maintile vectors for each respective linked tile.  Use maintile top side as a starting point.
        const activeTilesArrX = [{
            left: mainTile.data.x,
            tile: mainTile
        }];
        const activeTilesArrY = [{
            top: mainTile.data.y,
            tile: mainTile
        }];
        for (const tileId of tilerTilesArr) {
            // Get the tile documentn for this tileId
            const tile = canvas.background.get(tileId);
            // Get the UUID for this tileId
            const Uuid = tile.getFlag("scene-tiler", "scene");
            if ( !linkedTileUuidArr.includes(Uuid) ) continue;
            // Get the vector associated with this linked tile
            const vector = mainTile.getFlag("scene-scroller-maker", 'sceneScrollerTilerFlags')
                                    .LinkedTiles.filter(id => id.SceneUUID === Uuid)[0]
                                    .Vector;
            // Push the coordinates to the corresponding arrays
            activeTilesArrX.push({
                left: mainTile.data.x + vector.x,
                tile: tile
            })
            activeTilesArrY.push({
                top: mainTile.data.y + vector.y,
                tile: tile
            })
        }

        // With those two arrays, sort for X and then Y to establish final coordinates for each tile.  Filter (reduce) so tile is unique.
        // For example, using the X array:  The smallest coordinate will be the left most tile and will be placed at x-dir grid 1.
        // The next smallest tile will be the second left most tile and will be placed relative to the left most tile, by the vector distance for x.
        // And so on until all tiles have an X coordinate.
        const sortX = activeTilesArrX.sort((a,b) => (a.left > b.left) ? 1 : ((b.left > a.left) ? -1 : 0))
                        .reduce((a,d) => {
                            if (!a.includes(d[tile])) a.push(d);
                            return a;
                        });
        const sortY = activeTilesArrY.sort((a,b) => (a.top > b.top) ? 1 : ((b.top > a.top) ? -1 : 0))
                        .reduce((a,d) => {
                            if (!a.includes(d[tile])) a.push(d);
                            return a;
                        });
        
        // Using the above X and Y arrays, generate an array of vectors to the required x and y coordinates for each tile from their current position.
        debugger;
        // Use the vector array to locally place each activated tile in their respective positions in the main scene and make the tiles visible.  NOTE:  Their positions are not saved!!

        // For each tile, move all the placeable objects associated with the tiles (see Scene-Tiler flags) and move those by the same vector used to move the respective tiles.

        // For each token associated with any particular active tile, move the token to the position (relative to tile TLC) saved in the token flags.
    }
}