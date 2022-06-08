import { ModuleName } from "../ss-initialize.js";

/**
 * A class that will be publicly available containing default values for
 * viewport, tile and token flags.
 */
export class SCSC_Flag_Schema {
    /* Default flag values */
    static viewportFlags = {
        SceneTilerTileIDsArray: [], // Strings of tile ID's
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
    constructor() {
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

    get viewportFlags() {
        return this.viewport ?? SCSC_Flag_Schema.viewportFlags;
    }

    getSubSceneFlags(scnID) {
        return this.subScene.get(scnID) ?? SCSC_Flag_Schema.tileFlags;
    }

    getTokenFlags(tknID) {
        return this.tokens.get(tknID) ?? SCSC_Flag_Schema.tokenFlags;
    }

    getVector(tileID, childTileID) {
        const subScene = this.subScene.get(tileID);
        const childUUID = this.subScene.get(childTileID).UUID;
        return subScene.LinkedTiles.filter(s => s.SceneUUID === childUUID)[0].Vector;
    }

    async setActiveScene(tileID) {
        if ( !SceneScroller_Flags.isScrollerScene ) {
            ui.notifications.warn("Current scene has not been initialized as a Scene Scroller Viewport.");
            return;
        }
        this.viewport.ActiveScene = tileID;
        await canvas.scene.setFlag(ModuleName, "ActiveScene", tileID);
    }

    async addSubSceneInViewport(tileID) {
        if ( !SceneScroller_Flags.isScrollerScene ) {
            ui.notifications.warn("Current scene has not been initialized as a Scene Scroller Viewport.");
            return;
        }
        const currSet = new Set(this.viewport.SceneTilerTileIDsArray);
        currSet.add(tileID);  // Using a set makes it easy to avoid duplicates.
        this.viewport.SceneTilerTileIDsArray = [...currSet];
        await canvas.scene.setFlag(ModuleName, "SceneTilerTileIDsArray", [...currSet]);
    }

    async deleteSubSceneInViewport(tileID) {
        if ( !SceneScroller_Flags.isScrollerScene ) {
            ui.notifications.warn("Current scene has not been initialized as a Scene Scroller Viewport.");
            return;
        }
        const currSet = new Set(SceneScroller_Flags.viewportFlags.LinkedTiles);
        currSet.delete(tileID);
        this.viewport.LinkedTiles = [...currSet];
        await canvas.scene.setFlag(ModuleName, "LinkedTiles", [...currSet]);
    }

    async addSubSceneInTile(tileDoc, obj) {
        if ( !tileDoc.data.flags?.hasOwnProperty("scene-tiler") ) {
            // This is not a Scene Tiler tile.
            ui.notifications.warn("This tile is not a valid destination for Scene Scroller flags.");
            return;
        }
        const currFlags = this.subScene.get(tileDoc.id);
        const currMap = new Map();
        for (const [uuid, vector] of currFlags) {
            currMap.set(uuid, vector);
        }
        // Using Map to make sure no duplicate entries.
        currMap.set(obj.SceneUUID, obj.Vector);
        // Now refactor the map into an array of objects.
        const finalArr = [];
        for (const [uuid, vector] of currMap) {
            finalArr.push({SceneUUID: uuid, Vector: vector})
        }
        const subScene = SCSC_Flag_Schema.subSceneFlags(tileDoc.id)
        subScene.LinkedTiles.push(obj);
        await tileDoc.setFlag(ModuleName, "LinkedTiles", finalArr);
    }

    async deleteSubSceneInTile(tileDoc, uuid) {
        if ( !tileDoc.data.flags?.hasOwnProperty("scene-tiler") ) {
            // This is not a Scene Tiler tile.
            ui.notifications.warn("This tile does not contain any Scene Scroller flags.");
            return;
        }
        const currFlags = this.subScene.get(tileDoc.id);
        const newFlags = currFlags.filter(s => s.SceneUUID !== uuid)
        this.subScene.delete(tileDoc.id);
        this.subScene.set(tileDoc.id, newFlags);
        await tileDoc.setFlag(ModuleName, "LinkedTiles", newFlags);
    }

    async setCurrentTileInToken(tokenDoc, tileID) {
        const tokenFlags = SCSC_Flag_Schema.tokenFlags;
        tokenFlags.CurrentTile = tileID;
        await tokenDoc.setFlag(ModuleName, "CurrentTile", tileID);
    }

    async setInTileLocInToken(tokenDoc, data) {
        const tokenFlags = SCSC_Flag_Schema.tokenFlags;
        tokenFlags.inTileLoc = data;
        await tokenDoc.setFlag(ModuleName, "InTileLoc", data)
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

        for (const tileID of this.viewport[viewportKeys[0]]) {
            const tile = canvas.background.get(tileID);
            const linkedTiles = tile.document.getFlag(ModuleName, "LinkedTiles");
            for (const linkedTileData of linkedTiles) {
                const linkedTile = canvas.background.placeables.filter(t => t.document.getFlag('scene-tiler', "scene") === linkedTileData.SceneUUID)[0];
                if ( linkedTile ) linkedTileData.TileID = linkedTile.id;
            }
            const deriveOffset = this.deriveOffset(linkedTiles);
            const embedData = {
                LinkedTiles: linkedTiles,
                Offset: deriveOffset,
                UUID: tile.document.getFlag("scene-tiler", "scene")
            }
            this.subScene.set(tile.id, embedData);
        }

        for (const tok of canvas.tokens.placeables) {
            if ( !tok.document.data.flags?.hasOwnProperty(ModuleName) ) {
                for (const [k,v] of SCSC_Flag_Schema.tokenFlags) {
                    await tok.document.setFlag(ModuleName, k, v);
                }
            }
            this.tokens.set(tok.id, {
                CurrentTile: tok.document.getFlag(ModuleName, "CurrentTile"), 
                inTileLoc: tok.document.getFlag(ModuleName, "InTileLoc")
            })
        }
    }
}