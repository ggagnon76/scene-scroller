import { ModuleName } from "../ss-initialize.js";
import { deleteTilerTile, getSource, log, resizeScene, transferCompendiumSceneFlags } from "./Functions.js";
import { ScrollerSelectScene } from "./Forms.js";

/**
 * Manipulates the scene in several ways to stitch smaller scenes together to emulate a much bigger scene
 * 
 * Defined as a class for future plans to generate maps like a maze or labyrinth by randomly choosing smaller scenes populated with tags.
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
     * A schema of the flag data stored in each Scene Tiler tile.
     * @memberof SceneScroller
     */
    static sceneScrollerTilerFlags = {
        LinkedTiles: [], // An array of tileLinks objects
    }

    static SceneScrollerTokenFlags = {
        CurrentTile: "",  // The Scene Tiler tile ID of the tile the token is currently occupying
        Vector: {},  // ex: {x: 0, y: 0} An object with x & y coordinates in pixels, relative to the top left corner of CurrentTile
        ActiveTilerTileIDs: [], // A subset of the SceneTilerTileIDsArray from Scene Flags that represents tiles the token can see with vision.
    }

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

        const d = canvas.dimensions;

        // The scene tiler module will create a tile out of the selected compendium scene, centering it in our scene.
        const myTile = await SceneTiler.create(source, {x: d.sceneWidth/2, y: d.sceneHeight/2, populate: true, centered: true});
        if ( !myTile) {
            log(false, "Scene Scroller scene initialization failed because Scene Tiler failed to create a tile.")
            return;
        }

        // Transfer flags from compendium scene (source) and add them to myTile.
        const isTransfer = transferCompendiumSceneFlags(source, myTile);
        if ( !isTransfer) return;

        // Prepare the flag data for the scene
        const sceneFlagData = JSON.parse(JSON.stringify(this.sceneScrollerSceneFlags));
        sceneFlagData.SceneTilerTileIDsArray.push(myTile.id);

        // Resize the scene so that it fits around the new tile with 1 grid square of padding
        const isResize = resizeScene(canvas.scene, sceneFlagData.SceneTilerTileIDsArray);
        if (!isResize) {
            ui.notifications.error("Scene failed to resize to fit Scene-Tiler tile.");
            log(false, "Scene Scroller scene initialization failed because the resizeScene function failed.");
            deleteTilerTile(myTile);
            return;
        }

        // Save flags to the scene.
        canvas.scene.setFlag(ModuleName, "sceneFlags", sceneFlagData);

    }

    /**
     * This method should be invoked by a trigger (button, condition, etc...) to spawn a new tile that a
     * token will soon be able to see with token vision.  The trigger can originate from a user and will
     * have to be passed to the GM via socket to execute.
     * @param {String}      tileUUID      - a UUID pointing to a scene in a compendium.
     * @return {void}
     */
    static async spawnLinkedTile(tileUUID) {
        // Just in case...
        if (!game.user.isGM) return;

        const source = await fromUuid(tileUUID);
        if (source === null) {
            log(false, "Linked scene could not be found via the UUID.");
            log(false, tileUUID);
            return;
        }

        const d = canvas.dimensions;

        // The scene tiler module will create a tile out of the selected compendium scene, centering it in our scene.
        const myTile = await SceneTiler.create(source, {x: d.sceneWidth/2, y: d.sceneHeight/2, populate: true, centered: true});
        if ( !myTile) {
            log(false, "Linked scene spawn failed because Scene Tiler failed to create a tile.")
            return;
        }

        // Transfer flags from compendium scene (source) and add them to myTile.
        const isTransfer = transferCompendiumSceneFlags(source, myTile);
        if ( !isTransfer) return;

        // Prepare the flag data for the scene
        const sceneFlagData = JSON.parse(JSON.stringify(canvas.scene.getFlag(ModuleName, "sceneFlags")));
        sceneFlagData.SceneTilerTileIDsArray.push(myTile.id);

        // Resize the scene so that it fits around the new tile with 1 grid square of padding
        const isResize = resizeScene(canvas.scene, sceneFlagData.SceneTilerTileIDsArray);
        if (!isResize) {
            ui.notifications.error("Scene failed to resize to fit Scene-Tiler tile.");
            log(false, "Scene Scroller scene initialization failed because the resizeScene function failed.");
            deleteTilerTile(myTile);
            return;
        }

        // Save flags to the scene.
        canvas.scene.setFlag(ModuleName, "sceneFlags", sceneFlagData);

    }


}