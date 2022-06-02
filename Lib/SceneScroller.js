import { ModuleName } from "../ss-initialize.js";

/**
 * A class that will be publicly available containing default values for
 * viewport, tile and token flags.
 */
export class SCSC_Flags {
    /* Default flag values */
    static viewportFlags = {
        SceneTilerTileIDsArray: [],
        ActiveScene: ""
    }

    static tileFlags = {
        SceneUUID: "",
        Vector: {}
    }

    static tokenFlags = {
        CurrentTile: "",
        inTileLoc: {},
    }
}

/**
 * A class that caches various flag data and handles CRUD operations.
 */
export class SceneScroller_Flags {
    constructor(data) {
        this.viewport = null;
        this.subScene = new Map();  // Scenes in a compendium, or Scene-Tiler tiles in the viewport
        this.token = new Map();

        this.initialize();
    }

    /**
     * Identify if the current Foundry scene is being used as a Scene Scroller viewport.
     * @return {boolean}                - True if it is a Scene Scroller scene
     */
    get isScrollerScene() {
        if (canvas.scene?.data?.flags?.hasOwnProperty(ModuleName)) return true;
        return false;
    }

    get viewportFlags() {
        return this.viewport ?? SCSC_Flags.viewportFlags;
    }

    get subSceneFlags(scnID) {
        return this.subScene.get(scnID) ?? SCSC_Flags.tileFlags;
    }

    get tokenFlags(tknID) {
        return this.token.get(scnID) ?? SCSC_Flags.tokenFlags;
    }

    async set setActiveScene(tileID) {
        if ( !SceneScroller_Flags.isScrollerScene ) {
            ui.notifications.warn("Current scene has not been initialized as a Scene Scroller Viewport.");
            return;
        }
        return await canvas.scene.setFlag(ModuleName, "ActiveScene", tileID);
    }

    async set addSubScene(tileID) {
        if ( !SceneScroller_Flags.isScrollerScene ) {
            ui.notifications.warn("Current scene has not been initialized as a Scene Scroller Viewport.");
            return;
        }
        const currSet = new Set(SceneScroller_Flags.viewportFlags.SceneTilerTileIDsArray);
        currArr.add(tileID);  // Using a set makes it easy to avoid duplicates.
        return await canvas.scene.setFlag(ModuleName, "SceneTilerTileIDsArray", [...currSet]);
    }

    async set deleteSubScene(tileID) {
        if ( !SceneScroller_Flags.isScrollerScene ) {
            ui.notifications.warn("Current scene has not been initialized as a Scene Scroller Viewport.");
            return;
        }
        const currSet = new Set(SceneScroller_Flags.viewportFlags.SceneTilerTileIDsArray);
        currSet.delete(tileID);
        return await canvas.scene.setFlag(ModuleName, "SceneTilerTileIDsArray", [...currSet]);
    }
}