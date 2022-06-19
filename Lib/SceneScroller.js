import { ModuleName, ssc } from "../ss-initialize.js";
import { isScrollerScene } from "./functions.js";

/**
 * A class that will be publicly available containing default values for
 * viewport, tile and token flags.
 */
export class SCSC_Flag_Schema {
    /* Default keys and flag values */
    static viewportFlags = {
        SubSceneTokenData: [],  // Stored as JSON strings
        ActiveTokenID: "",
        ActiveScene: ""
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
export class SceneScroller_Cache {
    constructor() {
        this.viewportFlags = Object.keys(SCSC_Flag_Schema.viewportFlags);
        this.subSceneChildrenFlags = Object.keys(SCSC_Flag_Schema.subSceneChildrenFlags);
        this.tokenFlags = Object.keys(SCSC_Flag_Schema.tokenFlags);
        this.compendiumFlags = Object.keys(SCSC_Flag_Schema.compendiumSceneFlags);
        this.viewport = {};
        this.subScenes = new Map();
        this.tokens = new Map();
        this.walls = new Map();
        this.drawings = new Map();
        this.lights = new Map();
        this.notes = new Map();
        this.sounds = new Map();
        this.templates = new Map();
        this.tiles = new Map();
        this.tokens = new Map();

        this._initialize();
    }

    /*************************************************************************************/
    /* viewport CRUD operations */
    /*************************************************************************************/

    get activeScene() {
        if ( this.viewport[this.viewportFlags[2]] !== undefined ) return this.viewport[this.viewportFlags[2]];
        // Active Scene can be different for players and GM.
        let activeSceneUUID;
        if ( game.user.isGM ) {
            const activeTokenID = canvas.scene.getFlag(ModuleName, this.viewportFlags[1]);
            // convert tokenID to sub-sceneUUID
        } else {
            // Look at all tokens in cache to see which ones the user has observer permissions

            // Get the active sub-scene from the first controllable token (random)
        }
        // NOT FINISHED!
    }

    cacheActiveScene(uuid) {
        this.viewport[this.viewportFlags[2]] = uuid;
    }

    async setActiveToken(tokenID) {
        this.viewport[this.viewportFlags[1]] = tokenID;
        await canvas.scene.setFlag(ModuleName, this.viewportFlags[1], tokenID);
    }

    async addTokenInViewport(tokenData) {
        const currSet = new Set(this.viewport[this.viewportFlags[0]]);
        currSet.add(JSON.stringify(tokenData));
        this.viewport[this.viewportFlags[0]] = [...currSet];
        await canvas.scene.setFlag(ModuleName, this.viewportFlags[0], [...currSet]);
    }

    async deleteTokenInViewport(tokenData) {  // Needs review.  Will TokenData change when changes are made to token?
        const currSet = new Set(this.viewport[this.viewportFlags[0]]);
        currSet.delete(JSON.stringify(tokenData));
        this.viewport[this.viewportFlags[0]] = [...currSet];
        await canvas.scene.setFlag(ModuleName, this.viewportFlags[0], [...currSet]);
    }

    /*************************************************************************************/
    /* subScenes CRUD operations */
    /*************************************************************************************/

    get allSubScenes() {
        return [...new Set(this.subScenes.values())];
    }

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
        return this.subScenes.get(this.activeScene)[ssc.subSceneChildrenFlags[3]];
    }

    get ActiveChildren() {
        return this.subScenes.get(this.activeScene)[ssc.subSceneChildrenFlags[0]];
    }
    
    /*************************************************************************************/
    /* tokens CRUD operations */
    /*************************************************************************************/

    async addToken(token) {
        this.tokens.set(token.id, token);
        const data = token.document.toObject();
        const currArr = canvas.scene.getFlag(ModuleName, this.viewportFlags[0]) || [];
        currArr.push(JSON.stringify(data));
        await canvas.scene.setFlag(ModuleName, this.viewportFlags[0], currArr);
        if ( game.user.isGM ) {
            await canvas.scene.setFlag(ModuleName, this.viewportFlags[1], token.parentSubScene);
        }
    }

    /*************************************************************************************/
    /* Placeables CRUD Methods */
    /*************************************************************************************/

    addWall(wall) {
        if ( this.walls.has(wall.id) ) {
            // Duplicate wall.  Update the wall to add parent ID existing wall.
            const existingWall = this.walls.get(wall.id);
            const otherParentID = existingWall.parentSubScene[0];
            wall.parentSubScene.push(otherParentID);
            this.walls.set(wall.id, wall);
        } else this.walls.set(wall.id, wall);
    }

    addLight(light) {
        this.lights.set(light.id, light);
    }

    addNote(note) {
        this.notes.set(note.id, note);
    }

    addSound(sound) {
        this.sounds.set(sound.id, sound);
    }

    addTemplate(template) {
        this.templates.set(template.id, template);
    }

    addTile(tile) {
        this.tiles.set(tile.id, tile);
    }

    addDrawing(drawing) {
        this.drawings.set(drawing.id, drawing);
    }

    /*************************************************************************************/
    /* NON-CRUD Methods */
    /*************************************************************************************/

    async _initialize() {
        for (const k of this.viewportFlags) {
            this.viewport[k] = canvas.scene.getFlag(ModuleName, k)
        }

        // Create full tokens from stored tokenData.
        if ( !isScrollerScene() ) return;
        const tokArray = canvas.scene.getFlag(ModuleName, this.viewportFlags[0]);
        for (const tok of tokArray) {
            const data = JSON.parse(tok);
            const doc = new tokenDocument(data, {parent: canvas.scene});
            const token = new Token(doc);

            // Need to assign more attributes, like parentSubScene, etc...

            this.tokens.set(token.id, token);
        }
    }
}