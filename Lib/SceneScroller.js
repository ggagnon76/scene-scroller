 import { ModuleName } from "../ss-initialize.js";
import { ScrollerSelectScene, NewTokenTileSelectUI } from "./Forms.js";
import { socketWrapper, msgDict } from "./Socket.js";
import { createTilerTile, getAllPlaceables, isVisiblePlaceables, log, moveTokenLocal, tilerTilePlaceables } from "./Functions.js";

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
     * A schema of the flag data that is stored in the main Foundry scene (viewport).
     * @memberof SceneScroller
     * 
     * NOTE: sceneScrollerSceneFlags is a convenience variable name.  To access the resulting object
     * in the main scene (viewport) flags, use : .getFlag(ModuleName, "SceneTilerTileIDsArray") for example.
     */
    static sceneScrollerSceneFlags = {
        SceneTilerTileIDsArray: [], // an array of Scene Tiler tile ID's active in the scene
    }

    /**
     * A schema of the object to be stored in the LinkedTiles array (see sceneScrollerTilerFlags below)
     * @memberof SceneScroller
     * 
     * NOTE: sceneScrollerTileLinks is a convenience variable name.  To access the resulting object
     * in the main scene (viewport) flags, see 'sceneScrollerTilerFlags'.
     */
    static sceneScrollerTileLinks = {
        SceneUUID: "", // The UUID to the linked compendium scene
        Vector: {},  // ex: {x: 0, y: 0} An object with x & y coordinates in pixels, to the linked tile
        ButtonVector: {} // ex: {x: 0, y: 0} An object with x & y coordinates in pixels, to the desired location of the button
    }

    /**
     * A schema of the flag data stored in each compendium Scene, which gets transfered to each Scene Tiler tile.
     * @memberof SceneScroller
     * 
     * NOTE: sceneScrollerTilerFlags is a convenience variable name.  To access the resulting object
     * in the compendium scene or Scene Tiler tile flags, use : .getFlag(ModuleName, "LinkedTiles") for example.
     */
    static sceneScrollerTilerFlags = {
        LinkedTiles: [], // An array of sceneScrollerTileLinks objects
    }

      /**
     * A schema of the flag data stored in each token, which gets updated continuously as the token moves.
     * @memberof SceneScroller
     * 
     * NOTE: sceneScrollerTokenFlags is a convenience variable name.  To access the resulting object
     * in the token flags, use : .getFlag(ModuleName, "CurrentTile") for example.
     */
    static SceneScrollerTokenFlags = {
        CurrentTile: "",  // The Scene Tiler tile ID of the tile the token is currently occupying
        inTileLoc: {},  // ex: {x: 0, y: 0} An object with x & y coordinates in pixels, relative to the top left corner of CurrentTile
    }

    /** A variable to identify when to supress canvas#draw()
     *  See scene_onupdate() in Wrap.js
     *  @param {Boolean}
     */
    static PreventCanvasDraw = false;

    /** A variable to store a token object that needs to be updated after an animation
     *  See token_animate() in Wrap.js
     *  @param {Object|Null}    
     */
    static updateToken = null;

    /**
     * A Method to identify if the main Foundry scene is being used as a Scene Scroller Scene (the viewport).
     * It does this by looking for a flag that is set when Scene Scroller is activated.
     * @static
     * @param {Scene}       scn         - The scene to query
     * @return {Boolean}                - True if it is a Scene Scroller scene
     * @memberof SceneScroller 
     */
    static isScrollerScene(scn) {
        if (scn?.data?.flags?.hasOwnProperty(ModuleName)) return true;
        return false;
    }

    /** A method activated by a 'ready' hook.  See ss-initialize.js
     *  This method will:
     *    - change the visibility of all placeables in the scene to false.
     *    - create alpha maps for every sub-scene (Scene-Tiler tile).
     *    - TO-DO: launch a token selector bar for any user that can select tokens to control
     *  @return {void}
    */
   static onReady(...args) {

        if( !SceneScroller.isScrollerScene(canvas.scene) ) return;

        isVisiblePlaceables(getAllPlaceables(), false);

        const subScenes = canvas.scene.getFlag(ModuleName, "SceneTilerTileIDsArray");
        for (const tileId of subScenes) {
            const tile = canvas.background.get(tileId);
            tile._createAlphaMap({keepPixels: true});
        }
   }

    /**
     * A method activated by the GM via a UI button to establish (a hopefully empty scene) as a Scene Scroller Scene.
     *  - The method will add sceneScrollerSceneFlags to the scene flags, and
     *  - The method will launch a form application to prompt the GM to choose an origin scene from a scene compendium
     *    See ScrollerSelectScene in Forms.js
     * 
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
                        const position = placeable.center;
                        placeable.position.set(position.x + vector.x, position.y + vector.y);
                        placeable.data.c[0] += vector.x;
                        placeable.data.c[2] += vector.x;
                        placeable.data.c[1] += vector.y;
                        placeable.data.c[3] += vector.y;
                        placeable.data._source.c[0] += vector.x;
                        placeable.data._source.c[2] += vector.x;
                        placeable.data._source.c[1] += vector.y;
                        placeable.data._source.c[3] += vector.y;

                        placeable._onModifyWall(true);
                        
                        updates[placeableKey].push({_id: placeable.id, c: [
                            placeable.data.c[0],
                            placeable.data.c[1],
                            placeable.data.c[2],
                            placeable.data.c[3]
                        ]});
                    }

                    // Refresh door icons
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

        if ( save ) await canvas.scene.update(updates);
    }

    /** This function will interrupt the core token creation workflow to present a formapplication requesting the user
     *  choose on what sub-scene (Scene-Tiler tile) the token should be located.
     *  Alternatively, offer the option to create the token on the same tile as existing tokens.
     *  This function will be triggered off a "preCreateToken" hook and must return false to stope the core token creation workflow.
     *  Upon completion of the formapplication selection, the token creation will continue, but will include SceneScrollerTokenFlags flags.
     *  @param {Object}             data            - Token Data object
     *  @return {Boolean}
     */
    static tokenCreate(...args) {
        const [doc, data, options, userId] = args;
        // This workflow is only for scene-scroller scenes.
        if ( !SceneScroller.isScrollerScene(canvas.scene) ) return true;
        // If Scene-Scroller hasn't populated flags with needed information for token creation, then stop the workflow and launch UI.
        if ( !doc.data.flags.hasOwnProperty(ModuleName) ) {
            new NewTokenTileSelectUI(data, {left: ui.sidebar._element[0].offsetLeft - 300, top: 100}).render(true);
            return false;
        }

        // After the user has resumed token creation via the NewTokenTileSelectUI application, the destination tile is known...
        // But the relative location of the token to the tile top left corner also needs to be recorded.
        if ( doc.data.flags[ModuleName].inTileLoc === null ) {
            const destTile = canvas.background.get(doc.data.flags[ModuleName].CurrentTile);
            doc.data.update({"flags.scene-scroller.inTileLoc" : {x: data.x - destTile.position._x, y: data.y - destTile.position._y}});
            // For tokens belonging to synthetic actors (unlinked tokens)
            if ( !data.actorLink ) {
                doc.data.actorData.flags = data.flags
            }
            // The flags we set on the actor in the dropCanvasData hook are no longer needed.
            // Don't need to await the promise.
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

    /** -This function will activate (make visible) the sub-scene (Scene-Tiler tile) entered as a parameter.
     *  -All adjacent (linked) sub-scenes that are already in the viewport (main Foundry scene) will also be activated.
     *  -All activated sub-scenes will be sorted and placed in the viewport, in their correct positions relative to each other.
     *  -Optionally, all the placeable objects belonging to each activated sub-scene can be activated and positioned in the viewport.
     *  -Tokens that are associated with the activated sub-scene will be activated (visible) and be moved (locally) to their correct
     *   position relative to their associated sub-scene.
     * 
     *  @param {String}         tilerTileId             - The tile ID for the 'main' sub-scene.
     *  @param {Boolean}        translatePlaceables     - Optional boolean parameter to indicate if transfering placeables is required.  Defaults to true.
     *  @return {Boolean}                               - Return true on success.  Return false if the function fails.
     */
    static displaySubScenes(tilerTileId, translatePlaceables = true) {
        // TO-DO: If there's a controlled token, save it, then set it to not controlled.
        // This will trigger a viewport update resetting the viewport.

        // This is the main sub-scene:
        const mainTile = canvas.background.get(tilerTileId);
        // Get all the linked tiles by the array of ID's saved in main tile flags.  This is an array of UUID's
        const linkedTileUuidArr = mainTile.document.getFlag(ModuleName, 'LinkedTiles').map(l => l.SceneUUID);
        // Get all the Scene-Tiler tiles in the viewport from scene Flags.  This is an array of tile ID's
        const tilerTilesArr = canvas.scene.getFlag(ModuleName, "SceneTilerTileIDsArray");

        // Build an array for X and an array for Y containing the linked tiles top left corners (TLC) after they are translated
        // by the stored vectors.  The first values are zero, in case the main tile is the left and/or top most tile.
        const arrX = [0];
        const arrY = [0];

        // Now iterate for all linkedTiles and add their translated TLC to the arrays.
        for (const tileUuid of linkedTileUuidArr) {
            // Get the tile document for this tileId
            const tile = canvas.background.placeables.filter(t => t.document.getFlag("scene-tiler", "scene") === tileUuid)[0] || false;
            if ( !tile ) continue;
            // Get the UUID for this tileId
            const Uuid = tile.document.getFlag("scene-tiler", "scene");
            // Skip any tiles that aren't in the viewport's sub-scene array
            if ( !tilerTilesArr.includes(tile.id) ) continue;

            // Get the vector associated with this linked tile
            const vector = mainTile.document.getFlag(ModuleName, 'LinkedTiles')
                                    .filter(id => id.SceneUUID === Uuid)[0]
                                    .Vector;
            // Add linked tile to the map with derived coordinates and UUID (for later)
            arrX.push(-vector.x);
            arrY.push(-vector.y);
        }

        // Find the smallest X and the smallest Y
        const smallestX = Math.min(...arrX);
        const smallestY = Math.min(...arrY);
        
        // The smallest X and smallest Y forms the vector the main tile needs to be translated for all of the
        // activated tiles to fit in the viewport.  Translate mainTile...
        mainTile.position.set(mainTile.position._x - smallestX, mainTile.position._y - smallestY);
        mainTile.data.x -= smallestX;
        mainTile.data.y -= smallestY;
        mainTile.visible = true;
        
        // ... and position each linked tile relative to mainTile's new position, using the stored vectors.
        for (const tileUuid of linkedTileUuidArr) {
            // Get the tile document for this tileId
            const tile = canvas.background.placeables.filter(t => t.document.getFlag("scene-tiler", "scene") === tileUuid)[0] || false;
            if ( !tile ) continue;
            // Get the UUID for this tileId
            const Uuid = tile.document.getFlag("scene-tiler", "scene");
            // Skip any tiles that aren't in the viewport's sub-scene array
            if ( !tilerTilesArr.includes(tile.id) ) continue;

            // Get the vector associated with this linked tile
            const vector = mainTile.document.getFlag(ModuleName, 'LinkedTiles')
                                    .filter(id => id.SceneUUID === Uuid)[0]
                                    .Vector;
            
            tile.position.set(mainTile.data.x - vector.x, mainTile.data.y - vector.y);
            tile.data.x = mainTile.data.x + vector.x;
            tile.data.y = mainTile.data.y + vector.y;
            tile.visible = true;
        }

        // For each token associated with any particular active tile, move the token to the position (relative to tile TLC) saved in the token flags.
        const allTokensArr = canvas.tokens.placeables;
        for (const token of allTokensArr) {
            const tokenTileId = token.document.getFlag(ModuleName, "CurrentTile");
            const tile = canvas.background.get(tokenTileId);
            if ( tile.visible === true ) moveTokenLocal(token);
        }

        // If required, move all the placeable objects associated with this tile (see Scene-Tiler flags) by the same translation.
        if ( !translatePlaceables ) return;
        for (const tileId of tilerTilesArr) {
            const tile = canvas.background.get(tileId);
            if ( tile.visible === false ) continue; 
            const placeablesIds = tile.document.getFlag("scene-tiler", "entities");
            const placeables = tilerTilePlaceables(placeablesIds);
            const d = canvas.dimensions;
            this.offsetPlaceables(placeables, {x: tile.position._x - d.paddingX - d.size, y: tile.position._y - d.paddingY - d.size});
            isVisiblePlaceables(placeables, true);
        }


        // TO-DO: If a controlled token was saved, re-enable control.  This will trigger displaySubScenes (again).
    }
}