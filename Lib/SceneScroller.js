 import { ModuleName } from "../ss-initialize.js";
import { ScrollerInitiateScene, ScrollerViewSubSceneSelector } from "./Forms.js";
import { socketWrapper, msgDict } from "./Socket.js";
import { createTilerTile, isVisiblePlaceables, log, moveTokensLocal, resetMainScene, tilerTilePlaceables } from "./Functions.js";

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
        ActiveScene: ""
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

    /** The Control Token application */
    static controlToken = null;

    /**
     * A Method to identify if the main Foundry scene is being used as a Scene Scroller Scene (the viewport).
     * It does this by looking for a flag that is set when Scene Scroller is activated.
     * @static
     * @param {Scene}       scn         - The scene to query
     * @return {Boolean}                - True if it is a Scene Scroller scene
     * @memberof SceneScroller 
     */
    static isScrollerScene(scn) {
        //log(false, "Executing 'isScrollerScene' method.");
        if (scn?.data?.flags?.hasOwnProperty(ModuleName)) return true;
        return false;
    }

    /** A method activated by a 'ready' hook.  See ss-initialize.js
     *  This method will:
     *    - change the visibility of all placeables in the scene to false.
     *    - create alpha maps for every sub-scene (Scene-Tiler tile).
     *    - launch a token selector bar for any user that can select tokens to control
     *    - display the sub-scene that is stored in the canvas viewport flags.
     *  @return {void}
    */
   static async onReady() {

        log(false, "Executing 'onReady' method.");

        if( !SceneScroller.isScrollerScene(canvas.scene) ) return;

        const subScenes = canvas.scene.getFlag(ModuleName, "SceneTilerTileIDsArray");
        for (const tileId of subScenes) {
            const tile = canvas.background.get(tileId);
            tile._createAlphaMap({keepPixels: true});
        }

        if ( game.user.isGM ) {
            SceneScroller.controlToken = new ScrollerViewSubSceneSelector({}, {left: ui.sidebar._element[0].offsetLeft - 205, top: 3}).render(true);
        } else {
            // Look for for all tokens with at least permission level 'viewable'
            // Then check for array length.  If length 1 or greater, launch sub-scene selector window.
        }

        const activeSceneID = canvas.scene.getFlag(ModuleName, "ActiveScene");
        // Display the main sub-scene
        await SceneScroller.displaySubScenes(activeSceneID, true, true);
   }

    /**
     * A method activated by the GM via a UI button to establish (a hopefully empty scene) as a Scene Scroller Scene.
     *  - The method will add sceneScrollerSceneFlags to the scene flags, and
     *  - The method will launch a form application to prompt the GM to choose an origin scene from a scene compendium
     *    See ScrollerInitiateScene in Forms.js
     * 
     * @return {void}
     */
    static async initialize() {

        log(false, "Executing 'initialize' method.")
        // Just in case...
        if (!game.user.isGM) return;

        // Open a form application to prompt the GM to select an origin scene from a compendium
        const source = await new Promise((resolve) => {
            new ScrollerInitiateScene(resolve).render(true);
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

        // Set the flag in the canvas viewport identifying this sub-scene as the active one.
        await canvas.scene.setFlag(ModuleName, "ActiveScene", myTile.id)

        // TO-DO:  spawn all the linked tiles of this active sub-scene.
        //const linkedSceneIDs = myTile.getFlag(ModuleName, "LinkedTiles");
        //for (const sceneID of linkedSceneIDs) {
        //    await this.spawnLinkedTile(sceneID.SceneUUID)
        //}

        SceneScroller.onReady()
    }

    /**
     * This method should be invoked by a trigger (button, condition, etc...) to spawn a new tile that a
     * token will soon be able to see with token vision.  The trigger can originate from a user and will
     * have to be passed to the GM via socket to execute.
     * @param {String}      sceneUUID      - a UUID identifying a scene in a compendium.
     * @return {void}
     */
    static async spawnLinkedTile(sceneUUID) {

        log(false, "Executing 'spawnLinkedTile' method.");

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
     * @param {Object[]|Object} data                - data object (or array of data objects)
     *                                              - data.placeables = {
     *                                                  drawings: [],
     *                                                  lights: [],
     *                                                  notes: [],
     *                                                  sounds: [],
     *                                                  templates: [],
     *                                                  tiles: [],
     *                                                  tokens: [],
     *                                                  walls: []
     *                                               }
     *                                              - data.vector = {x: <Number>, y: <Number>}
     *                                              - data.placeablesIds = Object of arrays of strings from Scene-Tiler entities flag.
     * @param {Object}          options             - Options which modify how the clients manipulate the data.
     * @param {boolean}         options.visible     - (Optional), Default, true.  If false, placeables will not be visible.
     * @param {boolean}         options.save        - (Optional), Default, false.  If true, will save translation to database.  Automatically propagated to all clients.
     * @param {boolean}         options.wallHome    - (Optional), Default, false.  If true, the PIXI.Containers will have their position reset to {0,0}.
     */
    static async offsetPlaceables(data, {visible = true, save = false, wallHome = false}={}) {

        log(false, "Executing 'offsetPlaceables' method.");

        data = data instanceof Array ? data : [data];

        tilerTilePlaceables(data);

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

        for (const subData of data) {

            const vector = subData.vector;
            const placeables = subData.placeables;

            for (const placeableKey in placeables) {
                switch(placeableKey) {
                    case "walls":
                        for (const placeable of placeables[placeableKey]) {
                            const currPosition = placeable.center;
                            const position = wallHome ? {x: 0, y: 0} : {x: currPosition.x + vector.x, y: currPosition.y + vector.y};
                            placeable.position.set(position.x, position.y);
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
                        break;
                    default:
                        for (const placeable of placeables[placeableKey]) {
                            placeable.position.set(placeable.data._source.x + vector.x, placeable.data._source.y + vector.y);
                            placeable.data.x = placeable.data._source.x = placeable.data._source.x + vector.x;
                            placeable.data.y = placeable.data._source.y = placeable.data._source.y + vector.y;
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
        }

        isVisiblePlaceables(data, visible);

        if ( save ) {
            // To keep the visuals smooth, prevent a canvas.draw()
            socketWrapper(msgDict.preventCanvasDrawTrue);
            await canvas.scene.update(updates);
        }
    }

    /** This function will determine on what sub-scene (Scene-Tiler tile) the token belongs and update the
     *  token flags with appropriate info.  The token will be saved just inside the padding at the top left corner,
     *  also known as 'home position'.
     *  A follow up 'tokenCreate' hook will refresh the viewport and position the token where it belongs for each client.
     *  @param {Array}             ...args              - The data passed by the 'preCreateToken' hook.
     *  @return {Boolean}                               - Returning false prevents the token creation from proceeding.
     */
    static tokenCreate(...args) {

        const [doc, data, options, userId] = args;
        // This workflow is only for scene-scroller scenes.
        if ( !SceneScroller.isScrollerScene(canvas.scene) ) return true;

        log(false, "Executing 'tokenCreate' methods.");

        const d = canvas.dimensions;
        const tw = doc.data.width * d.size / 2; // Half of Token Width
        const th = doc.data.height * d.size / 2;  // Half of Token Height
        const tc = {  // Token center
            x: data.x + tw,
            y: data.y + th
        }

        const subSceneIDs = canvas.scene.getFlag(ModuleName, "SceneTilerTileIDsArray");
        let subSceneArray = [];
        let subScene = {};
        for (const subSceneID of subSceneIDs) {
            subScene = canvas.background.get(subSceneID)
            // Normalize to subScene (Tile) coordinates
            const x = tc.x - subScene.position._x;
            const y = tc.y - subScene.position._y;

            // First test against bounding box
            if ( (x < subScene._alphaMap.minX) || (x > subScene._alphaMap.maxX) ) continue;
            if ( (y < subScene._alphaMap.minY) || (y > subScene._alphaMap.maxY) ) continue;

            subSceneArray.push(subScene);
        }

        if ( !subSceneArray.length ) {
            log(false, "Aborting token creation.  Not dropped in area defined by a sub-scene (tile).");
            ui.notifications.warn("Token drop location is not contained in any sub-scene.  Token creation aborted.");
            return false;
        }

        let subSceneArrayByPX = [];
        if ( subSceneArray.length > 1 ) {
            // When more than one token occupies the drop location, figure out which sub-scene by testing the alphamap.
            // Test a specific pixel
            for (const sScene of subSceneArray) {
                const px = (Math.round(y) * Math.round(Math.abs(sScene.data.width))) + Math.round(x);
                const isInSubScene = sScene._alphaMap.pixels[px] === 1;
                if ( isInSubScene ) subSceneArrayByPX.push(subScene);
            }
            
        }

        if ( !subSceneArrayByPX.length && subSceneArray.length > 1 ) {
            log(false, "Aborting token creation.  Token dropped in area of sub-scene (tile) with zero alpha.");
            ui.notifications.warn("Token drop location is not in a valid part of any sub-scene.  Token creation aborted.");
            return false;
        }

        if ( subSceneArrayByPX.length > 1 ) {
            ui.notifications.warn("Error! Detecting valid drop location for two or more sub-scenes at the same time.  Token created on random sub-scene.");
        }

        const finalSubScene = subSceneArrayByPX[0] || subSceneArray[0];

        doc.data.update({
            "flags.scene-scroller.CurrentTile" : finalSubScene.id,
            "flags.scene-scroller.inTileLoc" : {x: data.x - finalSubScene.position._x, y: data.y - finalSubScene.position._y}
        });
        // update data to place the token at the home position
        data.x = d.paddingX;
        data.y = d.paddingY;
        return true;
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
     *  @param {Boolean}        onReady                 - Optional boolean parameter to indicate the foundry scene is being set up for the first time.
     *  @return {Boolean}                               - Return true on success.  Return false if the function fails.
     */
    static async displaySubScenes(tilerTileId, translatePlaceables = true, onReady = false) {

        if ( translatePlaceables ) {
            log(false, "Executing 'displaySubScenes' method.  Translate placeables.");
        } else {
            log(false, "Executing 'displaySubScenes' method.  Do not translate placeables.");
        }

        const viewportActiveScene = canvas.scene.getFlag(ModuleName, "ActiveScene");
        const visibleSubScenes = canvas.background.placeables
                    .filter(t => t?.data?.flags?.hasOwnProperty("scene-tiler"))
                    .filter(t => t.visible === true);

        if ( tilerTileId === viewportActiveScene && visibleSubScenes.length && !onReady) {
            log(false, "Aborting 'displaySubScenes' method because already displaying scene.");
            return;
        }

        // Reset every subscene and placeable to their home position
        resetMainScene();

        // This is the main sub-scene:
        const mainTile = canvas.background.get(tilerTileId);
        // Get all the linked sub-scenes by the array of ID's saved in main sub-scene flags.  This is an array of UUID's
        const linkedTileUuidArr = mainTile.document.getFlag(ModuleName, 'LinkedTiles').map(l => l.SceneUUID);
        // Get all the sub-scenes in the viewport from scene Flags.  This is an array of tile ID's
        const tilerTilesArr = canvas.scene.getFlag(ModuleName, "SceneTilerTileIDsArray");

        // Build an array for X and an array for Y containing the linked sub-scenes top left corners (TLC) after they are translated
        // by the stored vectors.  The default values are zero, in case the main sub-scene is the left and/or top most tile.
        const arrX = [0];
        const arrY = [0];

        // Iterate for all linkedTiles and add their translated TLC to the arrays.
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
        
        // The smallest X and smallest Y forms the vector the main sub-scene needs to be translated so that all of the
        // activated sub-scenes to fit in the viewport.  Translate mainTile...
        mainTile.position.set(mainTile.position._x - smallestX, mainTile.position._y - smallestY);
        mainTile.data.x = mainTile.data._source.x -= smallestX;
        mainTile.data.y = mainTile.data._source.y -= smallestY;
        mainTile.visible = true;
        
        // ... and position each linked sub-scene relative to the main sub-scene's new position, using the stored vectors.
        for (const tileUuid of linkedTileUuidArr) {
            // Get the tile document for this tileId
            const tile = canvas.background.placeables.filter(t => t.document.getFlag("scene-tiler", "scene") === tileUuid)[0] || false;
            if ( !tile ) continue;

            // Skip any tiles that aren't in the viewport's sub-scene array
            if ( !tilerTilesArr.includes(tile.id) ) continue;

            // Get the UUID for this tileId
            const Uuid = tile.document.getFlag("scene-tiler", "scene");

            // Get the vector associated with this linked tile
            const vector = mainTile.document.getFlag(ModuleName, 'LinkedTiles')
                                    .filter(id => id.SceneUUID === Uuid)[0]
                                    .Vector;
            
            tile.position.set(mainTile.data.x - vector.x, mainTile.data.y - vector.y);
            tile.data.x = tile.data._source.x = mainTile.data.x - vector.x;
            tile.data.y = tile.data._source.y = mainTile.data.y - vector.y;
            tile.visible = true;
        }

        // For each token associated with any particular active sub-scene, move the token to the position (relative to tile TLC) saved in the token flags.
        const allTokensArr = canvas.tokens.placeables;
        const tokenArr = [];
        for (const token of allTokensArr) {
            const tokenTileId = token.document.getFlag(ModuleName, "CurrentTile");
            const tile = canvas.background.get(tokenTileId);
            if ( tile.visible === true ) tokenArr.push(token);
        }

        moveTokensLocal(tokenArr);

        await canvas.scene.setFlag(ModuleName, "ActiveScene", tilerTileId);

        // If required, move all the placeable objects associated with this sub-scene (see Scene-Tiler flags) by the same translation.
        if ( !translatePlaceables ) return;
        const offsetPlaceablesObjArray = [];
        for (const tileId of tilerTilesArr) {
            const tile = canvas.background.get(tileId);
            if ( tile.visible === false ) continue; 
            const d = canvas.dimensions;
            const placeablesIds = tile.document.getFlag("scene-tiler", "entities");
            const offsetObj = {
                vector: {x: tile.position._x - d.paddingX, y: tile.position._y - d.paddingY},
                placeablesIds: placeablesIds,
                placeables: null
            }
            offsetPlaceablesObjArray.push(offsetObj);
        }

        SceneScroller.offsetPlaceables(offsetPlaceablesObjArray, {visible: true});


    }
}