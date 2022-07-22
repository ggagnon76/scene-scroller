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
 * A class that caches placeables and handles CRUD operations.
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
        this.compendiumSources = new Map();
        this.sprites = new Map();

        this._initialize();
    }

    /*************************************************************************************/
    /* viewport CRUD operations */
    /*************************************************************************************/

    /**
     * A getter to fetch the active sub-scene to display.  Displayed sub-scene can differ by user.
     */
    get activeSceneUUID() {
        if ( this.viewport[this.viewportFlags[2]] !== undefined ) return this.viewport[this.viewportFlags[2]];
    }

    /**
     * @param {string} uuid The UUID of the sub-scene to be cached.
     */
    cacheactiveSceneUUID(uuid) {
        this.viewport[this.viewportFlags[2]] = uuid;
    }

    /**
     * Sets the supplied token ID as active in the cache and in the canvas flags.
     * @param {string} tokenID The id of the token in the cache
     */
    async setActiveToken(tokenID) {
        this.viewport[this.viewportFlags[1]] = tokenID;
        await canvas.scene.setFlag(ModuleName, this.viewportFlags[1], tokenID);
    }

    /**
     * A getter to fetch the active token ID from the cache.
     */
    get activeTokenID() {
        return this.viewport[this.viewportFlags[1]];
    }

    /*************************************************************************************/
    /* subScenes CRUD operations */
    /*************************************************************************************/

    /** A getter to fetch an array of all the active sub-scenes from the cache. */
    get allSubScenes() {
        return [...new Set(this.subScenes.values())];
    }

    /**
     * Get a tile instance from the cache
     * @param {string} id The tile.ID
     * @returns {object}    A foundry Tile instance.
     */
    getSubSceneTile(id) {
        return this.subScenes.get(id);
    }

    /**
     * Save a tile instance to the cache
     * @param {string} id the tile.ID
     * @param {object} tile A foundry Tile instance
     */
    setSubSceneCache(id, tile) {
        this.subScenes.set(id, tile);
    }

    /** 
     * Check if the cache contains a tile instance
     * @param {string}  id  The tile.ID or the UUID
     * @returns {boolean}   True if it does, false otherwise
     */
    hasSubSceneInCache(id) {
        return this.subScenes.has(id);
    }

    /**
     * A getter to fetch a bounds object (data) of the current active sub-scene stored in the cache
     */
    get ActiveBounds() {
        return this.subScenes.get(this.activeSceneUUID)[this.subSceneChildrenFlags[3]];
    }

    /**
     * A getter to fetch an array of sub-scene UUID's for all the child sub-scenes of the
     * current active sub-scene stored in the cache
     */
    get ActiveChildrenUUIDs() {
        const activeSubSceneUuid = this.subScenes.get(this.activeSceneUUID).compendiumSubSceneUUID;
        const activeSubSceneSource = this.compendiumSources.get(activeSubSceneUuid);
        const subSceneFlagsArr =  activeSubSceneSource.getFlag("scene-scroller-maker", this.compendiumFlags[0]);
        return subSceneFlagsArr.map(s => {
            return s[this.subSceneChildrenFlags[0]];
        })
    }

    /**
     * A function that returns an array of children uuids for a given parent uuid (the parent sub-scene).
     * @param {string} uuid The UUID of the sub-scene from which we want the children uuids.
     * @returns {array<string>}
     */
    childrenUuids(uuid) {
        const activeSubSceneSource = this.compendiumSources.get(uuid);
        const subSceneFlagsArr =  activeSubSceneSource.getFlag("scene-scroller-maker", this.compendiumFlags[0]);
        return subSceneFlagsArr.map(s => {
            return s[this.subSceneChildrenFlags[0]];
        })
    }

    get ActiveChildrenFlags() {
        const activeSubSceneUuid = this.subScenes.get(this.activeSceneUUID).compendiumSubSceneUUID;
        const activeSubSceneSource = this.compendiumSources.get(activeSubSceneUuid);
        return activeSubSceneSource.getFlag("scene-scroller-maker", this.compendiumFlags[0]) 
    }
    
    /*************************************************************************************/
    /* tokens CRUD operations */
    /*************************************************************************************/

    /**
     * Add a Token to the cache.
     * If user is GM, then token is added to an array of Tokens present in the scene, as flags to the scene
     * If user is GM, then flag added to scene setting this Token as the active token.
     * @param {object} token A Foundry Token instance
     */
    async cacheToken(token) {
        this.tokens.set(token.id, token);
        if ( game.user.isGM ) {
            const data = token.document.toObject();
            data._id = token.data._id;
            const currArr = canvas.scene.getFlag(ModuleName, this.viewportFlags[0]) || [];
            currArr.push(JSON.stringify(data));
            await canvas.scene.setFlag(ModuleName, this.viewportFlags[0], currArr);
            await canvas.scene.setFlag(ModuleName, this.viewportFlags[1], token.id);
        }
    }

    /**
     * Gets a token from cache.
     * @param {string} id A Token instance ID
     * @returns {object}    A Foundry Token instance
     */
    getToken(id) {
        return this.tokens.get(id);
    }

    /**
     * A getter to obtain an array of all Token instances in the cache
     */
    get getAllTokens() {
        return [...new Set(this.tokens.values())];
    }

    /**
     * Deletes a Token from cache
     * If user is GM, deletes Token from array stored in scene flags
     * If user is GM, sets a new active token, if necessary.
     * @param {object} token A Foundry Token instance
     */
    async deleteToken(token) {
        this.tokens.delete(token.id);
        if ( game.user.isGM ) {
            const currArr = canvas.scene.getFlag(ModuleName, this.viewportFlags[0]) || [];
            const newArr = currArr.filter(t => !t.includes(JSON.stringify(token.id)));
            await canvas.scene.setFlag(ModuleName, this.viewportFlags[0], newArr);
            // If this happened to also be the active token, then pick the first from newArr to make it the active token
            const currTokID = canvas.scene.getFlag(ModuleName, this.viewportFlags[1]);
            if ( currTokID === token.id ) {
                const newCurr = newArr[0]?.id || "";
                await canvas.scene.setFlag(ModuleName, this.viewportFlags[1], newCurr);
            }
        }
    }

    /**
     * Updates the flags stored in Token instances.  To make token movements persist.
     * @param {object} token A Foundry Token instance
     * @param {object} loc Coordinates of the token relative to a sub-scene top left corner.  {x: <number> y: <number>}
     * @param {string} uuid *optional* The compendium scene UUID of the sub-scene the token occupies.
     */
    async updateTokenFlags(token, loc, uuid = null) {

        // Tokens are local memory only.  Not in db.  Can't use setFlag
        token.document.data.update({
            [`flags.${ModuleName}.${ssc.tokenFlags[1]}`] : {x: loc.x, y: loc.y}
        });

        if ( uuid !== null ) {
            token.document.data.update({
                [`flags.${ModuleName}.${ssc.tokenFlags[0]}`] : uuid
            });
        }

        await this.deleteToken(token);
        await this.cacheToken(token);
    }

    /**
     * Gets a UUID defining what sub-scene the token occupies.
     * @param {object} token A Foundry Token instance
     * @returns {string} The UUID of the compendium sub-scene occupied by the Token
     */
    tokenCurrentSubScene(token) {
        return token.document.getFlag(ModuleName, this.tokenFlags[0]);
    }

    /**
     * Gets an object defining the coordinates of the token relative to the sub-scene it occupies.
     * @param {object} token A Foundry Token instance
     * @returns {object} {x: <number>, y: <number>}  Coordinates relative to sub-scene top left corner.
     */
    tokenCurrentLoc(token) {
        return token.document.getFlag(ModuleName, this.tokenFlags[1]);
    }

    /*************************************************************************************/
    /* Placeables CRUD Methods */
    /*************************************************************************************/

    /**
     * Adds a wall placeable to the cache
     * @param {object} wall A Foundry Wall instance
     */
    addWall(wall) {
        if ( this.walls.has(wall.id) ) {
            // Duplicate wall.  Update the wall to add parent ID existing wall.
            const existingWall = this.walls.get(wall.id);
            const otherParentID = existingWall.parentSubScene[0];
            wall.parentSubScene.push(otherParentID);
            this.walls.set(wall.id, wall);
        } else this.walls.set(wall.id, wall);
    }

    /**
     * 
     * @param {object} wall A Foundry Wall instance
     * @param {string} id   The ID of the Foundry Tile instance that is triggering the removal of the wall.
     */
    removeWall(wall, id) {
        if ( wall.parentSubScene.length > 1 ) {
            const filtered = wall.parentSubScene.filter(w => w.parentSubScene !== id);
            wall.parentSubScene = filtered;
        } else this.walls.delete(wall.id);
    }

    /**
     * Adds a light placeable to the cache
     * @param {object} light A Foundry Light instance
     */
    addLight(light) {
        this.lights.set(light.id, light);
    }

    /**
     * 
     * @param {object} light A Foundry Light instance
     */
    removeLight(light) {
        this.lights.delete(light.id);
    }

    /**
     * Adds a note placeable to the cache
     * @param {object} note A Foundry Note instance
     */
    addNote(note) {
        this.notes.set(note.id, note);
    }

    /**
     * 
     * @param {ojbect} note A Foundry Note instance
     */
    removeNote(note) {
        this.notes.delete(note.id);
    }

    /**
     * Adds a sound placeable to the cache
     * @param {object} sound A Foundry Sound instance
     */
    addSound(sound) {
        this.sounds.set(sound.id, sound);
    }

    /**
     * 
     * @param {object} sound A Foundry Sound instance
     */
    removeSound(sound) {
        this.sounds.delete(sound.id);
    }

    /**
     * Adds a template placeable to the cache
     * @param {object} template A Foundry Template instance
     */
    addTemplate(template) {
        this.templates.set(template.id, template);
    }

    /**
     * 
     * @param {object} template A Foundry Template instance
     */
    removeTemplate(template) {
        this.templates.delete(template.id);
    }

    /**
     * Adds a tile placeable to the cache
     * @param {object} tile A Foundry Tile instance
     */
    addTile(tile) {
        this.tiles.set(tile.id, tile);
    }

    /**
     * 
     * @param {object} tile A Foundry Tile instance
     */
    removeTile(tile) {
        this.tiles.delete(tile.id);
    }

    /**
     * Adds a drawing placeable to the cache
     * @param {object} drawing A Foundry Drawing instance
     */
    addDrawing(drawing) {
        this.drawings.set(drawing.id, drawing);
    }

    /**
     * 
     * @param {object} drawing A Foundry Drawing instance
     */
    removeDrawing(drawing) {
        this.drawings.delete(drawing.id);
    }

    /*************************************************************************************/
    /* Compendium Source CRUD Methods */
    /*************************************************************************************/

    cacheCompendiumSource(id, source) {
        this.compendiumSources.set(id, source);
    }

    compendiumSourceFromCache(uuid) {
        return this.compendiumSources.get(uuid);
    }

    /*************************************************************************************/
    /* sprites CRUD Methods */
    /*************************************************************************************/

    cacheSubSceneSprite(id, sprite) {
        this.sprites.set(id, sprite);
    }

    spriteFromCache(uuid) {
        return this.sprites.get(uuid);
    }

    /*************************************************************************************/
    /* NON-CRUD Methods */
    /*************************************************************************************/

    /**
     * Populates a SceneScroller_Cache instance with data on creation.
     */
    async _initialize() {
        for (const k of this.viewportFlags) {
            this.viewport[k] = canvas.scene.getFlag(ModuleName, k)
        }

        // Create full tokens from stored tokenData.
        if ( !isScrollerScene() ) return;
        const tokArray = canvas.scene.getFlag(ModuleName, this.viewportFlags[0]);
        for (const tok of tokArray) {
            const data = JSON.parse(tok);
            const doc = new TokenDocument(data, {parent: canvas.scene});
            const token = new Token(doc);
            this.tokens.set(token.id, token);
        }

        // Cache the active token's active sub-scene
        const activeTokenID = canvas.scene.getFlag(ModuleName, this.viewportFlags[1]);
        const activeToken = this.tokens.get(activeTokenID);
        const activeTokenScene = activeToken.document.getFlag(ModuleName, this.tokenFlags[0]);
        this.cacheactiveSceneUUID(activeTokenScene);
    }
}