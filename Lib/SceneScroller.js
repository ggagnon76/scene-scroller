import { ModuleName, ssfc } from "../ss-initialize.js";
import { isScrollerScene } from "./functions.js";

/**
 * A class that will be publicly available containing default values for
 * viewport, tile and token flags.
 */
export class SCSC_Flag_Schema {
    /* Default keys and flag values */
    static viewportFlags = {
        SubSceneUUIDs: [],
        ActiveSceneUUID: "",
    }

    static compendiumSceneFlags = {
        SubSceneChildren: [],
        Bounds: {},
        Coords: {}
    }

    static subSceneChildrenFlags = {
        ChildrenSceneUUIDs: [],
        ChildCoords: {},
        Tile: {},
        Bounds: {}
    }

    static tokenFlags = {
        CurrentSubScene: "",
        InSubSceneLoc: {},
    }
}

/**
 * A class that caches various flag data and handles CRUD operations.
 */
export class SceneScroller_Flags {
    constructor() {
        this.viewportFlags = Object.keys(SCSC_Flag_Schema.viewportFlags);
        this.subSceneChildrenFlags = Object.keys(SCSC_Flag_Schema.subSceneChildrenFlags);
        this.tokenFlags = Object.keys(SCSC_Flag_Schema.tokenFlags);
        this.compendiumFlags = Object.keys(SCSC_Flag_Schema.compendiumSceneFlags);
        this.viewport = {};
        this.subScenes = new Map();  // Scenes in a compendium, or Scene-Tiler tiles in the viewport
        this.tokens = new Map();

        this._initialize();
    }

    /*************************************************************************************/
    /* viewport CRUD operations */
    /*************************************************************************************/

    get getViewportFlags() {
        return Object.keys(this.viewport).length ? this.viewport :  SCSC_Flag_Schema.viewportFlags;
    }

    get ActiveScene() {
        return this.viewport[this.viewportFlags[1]]
    }

    async setActiveScene(tileUUID) {
        this.viewport[this.viewportFlags[1]] = tileUUID;
        await canvas.scene.setFlag(ModuleName, this.viewportFlags[1], tileUUID);
    }

    async addSubSceneInViewport(tileUUID) {
        const currSet = new Set(this.viewport[this.viewportFlags[0]]);
        currSet.add(tileUUID);  // Using a set makes it easy to avoid duplicates.
        this.viewport[this.viewportFlags[0]] = [...currSet];
    }

    async deleteSubSceneInViewport(tileUUID) {
        const currSet = new Set(this.viewport[this.viewportFlags[0]]);
        currSet.delete(tileUUID);
        this.viewport[this.viewportFlags[0]] = [...currSet];
    }

    /*************************************************************************************/
    /* subScenes CRUD operations */
    /*************************************************************************************/

    getSubSceneFlags(scnID) {
        return this.subScenes.get(scnID) ?? SCSC_Flag_Schema.subSceneChildrenFlags;
    }

    getSubSceneTile(id) {
        return this.subScenes.get(id).Tile;
    }

    setSubSceneCache(id, tile) {
        this.subScenes.set(id, tile);
    }

    get ActiveBounds() {
        return this.subScenes.get(this.ActiveScene)[ssfc.subSceneChildrenFlags[3]];
    }

    get ActiveChildren() {
        return this.subScenes.get(this.ActiveScene)[ssfc.subSceneChildrenFlags[0]];
    }
    
    /*************************************************************************************/
    /* tokens CRUD operations */
    /*************************************************************************************/

    getTokenFlags(tknID) {
        return this.tokens.get(tknID) ?? SCSC_Flag_Schema.tokenFlags;
    }

    async setActiveSubSceneInToken(tokenDoc, tileUUID) {
        const tokenFlags = SCSC_Flag_Schema.tokenFlags;
        tokenFlags[this.tokenFlags[0]] = tileUUID;
        await tokenDoc.setFlag(ModuleName, this.tokenFlags[0], tileUUID);
    }

    getActiveSubSceneFromToken(tokID) {
        return this.tokens.get(tokID)[this.tokenFlags[0]];
    }

    async setInTileLocInToken(tokenDoc, data) {
        const tokenFlags = SCSC_Flag_Schema.tokenFlags;
        tokenFlags[this.tokenFlags[1]] = data;
        await tokenDoc.setFlag(ModuleName, this.tokenFlags[1], data)
    }

    /*************************************************************************************/
    /* NON-CRUD Methods */
    /*************************************************************************************/

    async _initialize() {
        for (const k of this.viewportFlags) {
            this.viewport[k] = canvas.scene.getFlag(ModuleName, k)
        }

        for (const tok of canvas.tokens.placeables) {
            if ( !tok.document.data.flags?.hasOwnProperty(ModuleName) ) {
                for (const [k,v] of SCSC_Flag_Schema.tokenFlags) {
                    await tok.document.setFlag(ModuleName, k, v);
                }
            }
            this.tokens.set(tok.id, {
                [this.tokenFlags[0]]: tok.document.getFlag(ModuleName, this.tokenFlags[0]), 
                [this.tokenFlags[1]]: tok.document.getFlag(ModuleName, this.tokenFlags[1])
            })
        }
    }
}