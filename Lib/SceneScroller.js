import { ModuleName } from "../ss-initialize.js";

/**
 * A class that will be publicly available containing default values for
 * viewport, tile and token flags.
 */
export class SCSC_Flag_Schema {
    /* Default keys and flag values */
    static viewportFlags = {
        SubSceneUUIDs: [],
        ActiveSceneUUID: ""
    }

    static compendiumSceneFlags = {
        ChildSceneUUID: "",
        ChildVector: {}
    }

    static tokenFlags = {
        CurrentSubScene: "",
        inSubSceneLoc: {},
    }
}

/**
 * A class that caches various flag data and handles CRUD operations.
 */
export class SceneScroller_Flags {
    constructor() {
        this.viewportFlags = Object.keys(SCSC_Flag_Schema.viewportFlags);
        this.compendiumSceneFlags = Object.keys(SCSC_Flag_Schema.compendiumSceneFlags);
        this.tokenFlags = Object.keys(SCSC_Flag_Schema.tokenFlags);
        this.viewport = {};
        this.subScene = new Map();  // Scenes in a compendium, or Scene-Tiler tiles in the viewport
        this.tokens = new Map();

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

    get getViewportFlags() {
        return Object.keys(this.viewport).length ? this.viewport :  SCSC_Flag_Schema.viewportFlags;
    }

    getSubSceneFlags(scnID) {
        return this.subScene.get(scnID) ?? SCSC_Flag_Schema.compendiumSceneFlags;
    }

    getTokenFlags(tknID) {
        return this.tokens.get(tknID) ?? SCSC_Flag_Schema.tokenFlags;
    }

    getVector(tileID, childTileID) {
        const subScene = this.subScene.get(tileID);
        const childUUID = this.subScene.get(childTileID).UUID;
        return subScene.LinkedTiles.filter(s => s.SceneUUID === childUUID)[0].Vector;
    }

    getLinkedTilesFromSubScene(subScene) {
        return this.subScene.get(subScene).LinkedTiles
    }

    async setActiveScene(tileUUID) {
        this.viewport[this.viewportFlags[1]] = tileUUID;
        await canvas.scene.setFlag(ModuleName, this.viewportFlags[1], tileUUID);
    }

    getActiveScene() {
        return this.viewport[this.viewportFlags[1]]
    }

    async addSubSceneInViewport(tileUUID) {
        if ( !SceneScroller_Flags.isScrollerScene ) {
            ui.notifications.warn("Current scene has not been initialized as a Scene Scroller Viewport.");
            return;
        }
        const currSet = new Set(this.viewport[this.viewportFlags[0]]);
        currSet.add(tileUUID);  // Using a set makes it easy to avoid duplicates.
        this.viewport[this.viewportFlags[0]] = [...currSet];
        await canvas.scene.setFlag(ModuleName, this.viewportFlags[0], [...currSet]);
    }

    async deleteSubSceneInViewport(tileUUID) {
        if ( !SceneScroller_Flags.isScrollerScene ) {
            ui.notifications.warn("Current scene has not been initialized as a Scene Scroller Viewport.");
            return;
        }
        const currSet = new Set(this.viewport[this.viewportFlags[0]]);
        currSet.delete(tileUUID);
        this.viewport[this.viewportFlags[0]] = [...currSet];
        await canvas.scene.setFlag(ModuleName, this.viewportFlags[0], [...currSet]);
    }

    async setActiveSubSceneInToken(tokenDoc, tileUUID) {
        const tokenFlags = SCSC_Flag_Schema.tokenFlags;
        tokenFlags[this.tokenFlags[0]] = tileUUID;
        await tokenDoc.setFlag(ModuleName, this.tokenFlags[0], tileUUID);
    }

    getActiveSubSceneFromToken(tokID) {

    }

    async setInTileLocInToken(tokenDoc, data) {
        const tokenFlags = SCSC_Flag_Schema.tokenFlags;
        tokenFlags[this.tokenFlags[1]] = data;
        await tokenDoc.setFlag(ModuleName, this.tokenFlags[1], data)
    }

    deriveOffset(links) {
        let offset = {
            x: -Infinity,
            y: -Infinity
        }
        for (const link of links) {
            // link.Vector is the distance and direction to go from the child sub-scene top left corner
            // to the parent sub-scene top left corner.
            offset.x = link.Vector.x > offset.x ? link.Vector.x : offset.x;
            offset.y = link.Vector.y > offset.y ? link.Vector.y : offset.y;
        }
        // In case parent sub-scene is the top left sub-scene
        offset.x = 0 > offset.x ? 0 : offset.x,
        offset.y = 0 > offset.y ? 0 : offset.y

        const d = canvas.dimensions;
        return {x: offset.x + d.paddingX, y: offset.y + d.paddingY};
    }

    async initialize() {
        const viewportKeys = Object.keys(SCSC_Flag_Schema.viewportFlags);
        for (const k of viewportKeys) {
            this.viewport[k] = canvas.scene.getFlag(ModuleName, k)
        }

        const tokenKeys = Object.keys(SCSC_Flag_Schema.tokenFlags);
        for (const tok of canvas.tokens.placeables) {
            if ( !tok.document.data.flags?.hasOwnProperty(ModuleName) ) {
                for (const [k,v] of SCSC_Flag_Schema.tokenFlags) {
                    await tok.document.setFlag(ModuleName, k, v);
                }
            }
            this.tokens.set(tok.id, {
                CurrentTile: tok.document.getFlag(ModuleName, tokenKeys[0]), 
                inTileLoc: tok.document.getFlag(ModuleName, tokenKeys[1])
            })
        }
    }
}