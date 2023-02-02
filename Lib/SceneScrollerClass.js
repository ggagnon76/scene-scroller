import { ModuleName, ssc } from "../ss-initialize.js";
import * as Viewport from "./ViewportClass.js";
import { ScrollerTokenDocument } from "./TokenClass.js";
import { getUUID, log } from "./functions.js";

/**
 * A class that will be publicly available containing a schema for
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
        Coords: {},
        Polygon : []
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
        this.selTokenApp = null;

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
        log(false, `Active sub-scene has been set in cache via: ${uuid}`);
    }

    /**
     * Sets the supplied token ID as active in the cache and in the canvas flags.
     * @param {string} tokenID The id of the token in the cache
     */
    async setActiveToken(tokenID) {
        this.viewport[this.viewportFlags[1]] = tokenID;
        await canvas.scene.setFlag(ModuleName, this.viewportFlags[1], tokenID);
        log(false, `Token ${tokenID} has been set as active in cache and scene flags.`)
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
     * Get a Tile Document from the cache
     * @param {string} id The tile.ss_id or the UUID
     * @returns {object}    A foundry Tile Document.
     */
    getSubSceneTileDoc(id) {
        return this.subScenes.get(id);
    }

    /**
     * Save a tile document to the cache
     * @param {string} ss_id the tile.ss_id
     * @param {object} tileDoc A foundry Tile Document
     */
    setSubSceneCache(ss_id, tileDoc) {
        this.subScenes.set(ss_id, tileDoc);
        log(false, `Sub-scene with ss_id ${ss_id} has been cached.`);
    }

    /** 
     * Check if the cache contains a tile document
     * @param {string}  id  The tile.ss_id or the UUID
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
     * A getter to return an array of child sub-scene UUID's of the current active sub-scene stored in the cache
     * @returns {array<string>}
     */
    get ActiveChildrenUUIDs() {
        const activeSubSceneUuid = this.subScenes.get(this.activeSceneUUID).compendiumSubSceneUUID;
        return ssc.childrenUuids(activeSubSceneUuid);
    }

    /**
     * A function that returns an array of children uuids for a specified sub-scene.
     * @param {string} uuid The UUID of the sub-scene from which we want the children uuids.
     * @returns {array<string>}     An array of UUID strings
     */
    childrenUuids(uuid) {
        const subSceneFlagsArr = ssc.childrenFlags(uuid);
        return subSceneFlagsArr.map(s => {
            return s[this.subSceneChildrenFlags[0]];
        })
    }

    /**
     * A getter that returns the flags data for the children of the active scene
     * @returns {object}
     */
    get ActiveChildrenFlags() {
        const activeSubSceneUuid = this.subScenes.get(this.activeSceneUUID).compendiumSubSceneUUID;
        return ssc.childrenFlags(activeSubSceneUuid); 
    }

    /**
     * A function that returns an object of flag data for a specific scene
     * @param {string} uuid The UUID of the sub-sche from which we want the children flag data
     * @returns {object} The object containing flag data    
     */
    childrenFlags(uuid) {
        const activeSubSceneSource = this.compendiumSources.get(uuid);
        return  activeSubSceneSource.getFlag("scene-scroller-maker", this.compendiumFlags[0]);
    }
    
    /*************************************************************************************/
    /* tokens CRUD operations */
    /*************************************************************************************/

    /**
     * Add a Token to the cache.  Must only be one entry per token.
     * If user is GM, then token is added to an array of Tokens present in the scene, as flags to the scene
     * If user is GM, then flag added to scene setting this Token as the active token.
     * @param {object} tokenDoc A Foundry Token Document
     */
    cacheToken(tokenDoc) {
        this.tokens.set(tokenDoc.ss_id, tokenDoc);
        log(false, `Token with ss_id ${tokenDoc.ss_id} has been added to cache.`);

        if ( game.user.isGM ) {
            const data = tokenDoc.toObject();
            data.ss_id = tokenDoc.ss_id;
            let currArrJSON = canvas.scene.getFlag(ModuleName, this.viewportFlags[0]) || [];
            let currArr = currArrJSON.map(j => JSON.parse(j));
            const currMap = new Map();
            for (const t of currArr) {
                currMap.set(t.ss_id, t);
            }
            currMap.set(data.ss_id, data);
            currArr = [...currMap.values()];
            currArrJSON = currArr.map(j => JSON.stringify(j));
            debounceCacheToken(currArrJSON, tokenDoc);
        }
    }

    /**
     * Gets a token Document from cache.
     * @param {string} id A Token Document ID
     * @returns {object}    A Foundry Token Document
     */
    getToken(id) {
        const tok = this.tokens.get(id);
        tok.parentUUID = [];
        return tok
    }

    /**
     * A getter to obtain an array of all Token Documents in the cache
     */
    get getAllTokenDocs() {
        return [...new Set(this.tokens.values())];
    }

    /**
     * Deletes a Token from cache
     * If user is GM, deletes Token from array stored in scene flags
     * If user is GM, sets a new active token, if necessary.
     * @param {object} token A Foundry Token Document
     */
    async deleteToken(tokenDoc) {
        this.tokens.delete(tokenDoc.ss_id);
        log(false, `Token with ss_id ${tokenDoc.ss_id} has been deleted from cache.`);
        if ( game.user.isGM ) {
            const currArr = canvas.scene.getFlag(ModuleName, this.viewportFlags[0]) || [];
            const newArr = currArr.filter(t => !t.includes(JSON.stringify(tokenDoc.id)));
            await canvas.scene.setFlag(ModuleName, this.viewportFlags[0], newArr);
            // If this happened to also be the active token, then pick the first from newArr to make it the active token
            const currTokID = canvas.scene.getFlag(ModuleName, this.viewportFlags[1]);
            if ( currTokID === tokenDoc.id ) {
                const newCurr = newArr[0]?.id || "";
                await canvas.scene.setFlag(ModuleName, this.viewportFlags[1], newCurr);
                log(false, `Token with ss_id ${tokenDoc.ss_id} has been deleted from scene flags.`);
            }
        }
    }

    /**
     * Updates the flags stored in Token Documents to make token movements persist.
     * @param {object} token A Foundry Token Document
     * @param {object} loc Coordinates of the token relative to a sub-scene top left corner.  {x: <number> y: <number>}
     * @param {string} uuid *optional* The compendium scene UUID of the sub-scene the token occupies.
     */
    async updateTokenFlags(tokenDoc, loc, uuid = null) {

        tokenDoc.updateSource({
            [`flags.${ModuleName}.${ssc.tokenFlags[1]}`] : {x: loc.x, y: loc.y}
        });

        if ( uuid !== null ) {
            tokenDoc.updateSource({
                [`flags.${ModuleName}.${ssc.tokenFlags[0]}`] : uuid
            });
        }
        await this.cacheToken(tokenDoc);
        log(false, `Token with ss_id ${tokenDoc.ss_id} has had its location updated and saved in cache.`)

    }

    /**
     * Returns a UUID defining what sub-scene the token occupies.
     * @param {object} tokenDoc A Foundry Token Document
     * @returns {string} The UUID of the compendium sub-scene occupied by the Token
     */
    tokenCurrentSubScene(tokenDoc) {
        return tokenDoc.getFlag(ModuleName, this.tokenFlags[0]);
    }

    /**
     * Returns an object defining the coordinates of the token relative to the sub-scene it occupies.
     * @param {object} token A Foundry Token Document
     * @returns {object} {x: <number>, y: <number>}  Coordinates relative to sub-scene top left corner.
     */
    tokenCurrentLoc(tokenDoc) {
        return tokenDoc.getFlag(ModuleName, this.tokenFlags[1]);
    }

    /*************************************************************************************/
    /* Placeables CRUD Methods */
    /*************************************************************************************/

    /**
     * Adds a wall Document to the cache
     * @param {object} wall A Foundry Wall Document
     */
    addWall(wallDoc) {
        if ( this.walls.has(wallDoc.id) ) {
            // Duplicate wall.  Update the wall to add parent ID and parent compendiumUUID.
            const existingWall = this.walls.get(wallDoc.id);
            const otherParentID = existingWall.parentSubScene[0];
            wallDoc.parentSubScene.push(otherParentID);
            const otherParentUUID = existingWall.parentUUID[0];
            wallDoc.parentUUID.push(otherParentUUID);
            this.walls.set(wallDoc.id, wallDoc);
        } else this.walls.set(wallDoc.id, wallDoc);
        log(false, `Wall with id ${wallDoc.id} has been added to cache.`);
    }

    /**
     * A function to remove a Wall Document from the cache
     * @param {object} wallDoc A Foundry Wall Document
     * @param {string} id   The ID of the Foundry Tile Document that is triggering the removal of the wall.
     */
    removeWall(wallDoc, id) {
        if ( wallDoc.parentSubScene.length > 1 ) {
            const filtered = wallDoc.parentSubScene.filter(w => w.parentSubScene !== id);
            wallDoc.parentSubScene = filtered;
        } else this.walls.delete(wallDoc.id);
        log(false, `Wall with id ${wallDoc.id} has been deleted from cache.`);
    }

    async updateDoorState(wallDoc, {doorState = undefined} ={}) {
        wallDoc.updateSource({ds: doorState})
        // Update the compendium source too.
        const sourceScene = ssc.compendiumSourceFromCache(wallDoc.parentUUID[0]);
        await sourceScene.updateEmbeddedDocuments(wallDoc.constructor.documentName, [{_id: wallDoc.id, ds: doorState}])
    }
    
    /**
     * Adds a Light Document to the cache
     * @param {object} lightDoc A Foundry Light Document
     */
    addLight(lightDoc) {
        this.lights.set(lightDoc.id, lightDoc);
        log(false, `Light with id ${lightDoc.id} has been added to cache.`);
    }

    /**
     * Removes a Light Document from the cache
     * @param {object} lightDoc A Foundry Light Document
     */
    removeLight(lightDoc) {
        this.lights.delete(lightDoc.id);
        log(false, `Light with id ${lightDoc.id} has been deleted from cache.`);
    }

    /**
     * Adds a Note Document to the cache
     * @param {object} noteDoc A Foundry Note Document
     */
    addNote(noteDoc) {
        this.notes.set(noteDoc.id, noteDoc);
        log(false, `Note with id ${noteDoc.id} has been added to cache.`);
    }

    /**
     * Removes a Note Document from the cache
     * @param {ojbect} noteDoc A Foundry Note Document
     */
    removeNote(noteDoc) {
        this.notes.delete(noteDoc.id);
        log(false, `Note with id ${noteDoc.id} has been deleted from cache.`);
    }

    /**
     * Adds a Sound Document to the cache
     * @param {object} soundDoc A Foundry Sound Document
     */
    addSound(soundDoc) {
        this.sounds.set(soundDoc.id, soundDoc);
        log(false, `Sound with id ${soundDoc.id} has been added to cache.`);
    }

    /**
     * Removes a Sound Document from the cache
     * @param {object} soundDoc A Foundry Sound Document
     */
    removeSound(soundDoc) {
        this.sounds.delete(soundDoc.id);
        log(false, `Sound with id ${soundDoc.id} has been deleted from cache.`);
    }

    /**
     * Adds a Template Document to the cache
     * @param {object} templateDoc A Foundry Template Document
     */
    addTemplate(templateDoc) {
        this.templates.set(templateDoc.id, templateDoc);
        log(false, `Template with id ${templateDoc.id} has been added to cache.`);
    }

    /**
     * Removes a Template Document from the cache
     * @param {object} templateDoc A Foundry Template Document
     */
    removeTemplate(templateDoc) {
        this.templates.delete(templateDoc.id);
        log(false, `Template with id ${templateDoc.id} has been removed from cache.`);
    }

    /**
     * Adds a Tile Document to the cache
     * @param {object} tileDoc A Foundry Tile Document
     */
    addTile(tileDoc) {
        this.tiles.set(tileDoc.id, tileDoc);
        log(false, `Tile with id ${tileDoc.id} has been added to cache.`);
    }

    /**
     * Removes a Tile Document from the cache
     * @param {object} tileDoc A Foundry Tile Document
     */
    removeTile(tileDoc) {
        this.tiles.delete(tileDoc.id);
        log(false, `Tile with id ${tileDoc.id} has been removed from cache.`);
    }

    /**
     * Adds a Drawing Document to the cache
     * @param {object} drawingDoc A Foundry Drawing Document
     */
    addDrawing(drawingDoc) {
        this.drawings.set(drawingDoc.id, drawingDoc);
        log(false, `Drawing with id ${drawingDoc.id} has been added to cache.`);
    }

    /**
     * Removes a Drawing Document from the cache
     * @param {object} drawingDoc A Foundry Drawing Document
     */
    removeDrawing(drawingDoc) {
        this.drawings.delete(drawingDoc.id);
        log(false, `Drawing with id ${drawingDoc.id} has been removed from cache.`);
    }

    /*************************************************************************************/
    /* Compendium Source CRUD Methods */
    /*************************************************************************************/

    /**
     * Adds a Scene object originating from a compendium to the cache
     * @param {string} uuid The UUID of the scene from the compendium
     * @param {object} source The scene object fetched from the compendium
     */
    cacheCompendiumSource(uuid, source) {
        this.compendiumSources.set(uuid, source);
        log(false, `Compendium source scene with uuid ${uuid} has been added to cache.`);
    }

    /**
     * Returns a Scene object from the cache
     * @param {string} uuid The UUID of the scene to fetch
     * @returns {object}    A Foundry Scene object
     */
    compendiumSourceFromCache(uuid) {
        return this.compendiumSources.get(uuid);
    }

    /**
     * Removes a Scene object from the cache
     * @param {string} uuid The UUID of the scene to delete
     */
    removeCompendiumSource(uuid) {
        this.compendiumSources.delete(uuid);
        log(false, `Compendium source scene with uuid ${uuid} has been removed from cache.`);

    }

    /*************************************************************************************/
    /* sprites (textures) CRUD Methods */
    /* Pre-loads the textures and caches them so they will be available without an await
    /*************************************************************************************/

    cacheSubSceneSprite(id, sprite) {
        this.sprites.set(id, sprite);
        log(false, `Texture with id ${id} has been added to cache.`);

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
        log(false, "Executing __ _initialize()__ function from cache class instantiation.");
        for (const k of this.viewportFlags) {
            this.viewport[k] = canvas.scene.getFlag(ModuleName, k)
        }

        // Create full tokens from stored tokenData.
        if ( !Viewport.isScrollerScene() ) return;
        const tokArray = canvas.scene.getFlag(ModuleName, this.viewportFlags[0]);
        if ( !tokArray ) return;
        for (const tok of tokArray) {
            const data = JSON.parse(tok);
            // Creating a new TokenDocument will mutate data and scrub out custom data
            const ssId = data.ss_id;
            const doc = new ScrollerTokenDocument(data, {parent: canvas.scene});
            doc.ss_id = ssId;
            this.tokens.set(doc.ss_id, doc);
        }

        // Cache the active token's active sub-scene
        const activeTokenID = canvas.scene.getFlag(ModuleName, this.viewportFlags[1]);
        const activeToken = this.tokens.get(activeTokenID);
        const activeTokenScene = activeToken.getFlag(ModuleName, this.tokenFlags[0]);
        if ( !activeTokenScene ) {
            log(false, "Token active scene wasn't properly saved in scene flags.  Clear Scene Scroller flags.");
            ui.notifications.warn("Token active scene wasn't properly saved in scene flags.  Clear Scene Scroller flags and re-initialize.");
            return;
        }
        this.cacheactiveSceneUUID(activeTokenScene);
    }
}

/**
     * Queries a scene in a compendium to copy all placeables into the cache.
     * All copied placeables reference the parent Tile/Scene
     * @param {object} scene An compendium scene
     * @param {object} tileDoc A Foundry Tile Document
     */
export function cacheInScenePlaceables(scene, tileDoc) {
    const placeables = ["drawings", "lights", "notes", "sounds", "templates", "tiles", "tokens", "walls"];
    const pDict = {
        drawings: {
            doc : (data) => new DrawingDocument(data, {parent: canvas.scene}),
            cache: (d) => ssc.addDrawing(d)
        },
        lights : {
            doc : (data) => new AmbientLightDocument(data, {parent: canvas.scene}),
            cache: (l) => ssc.addLight(l)
        },
        notes : {
            doc : (data) => new NoteDocument(data, {parent: canvas.scene}),
            cache: (n) => ssc.addNote(n)
        },
        sounds: {
            doc : (data) => new AmbientSoundDocument(data, {parent: canvas.scene}),
            cache: (s) => ssc.addSound(s)
        },
        templates: {
            doc : (data) => new MeasuredTemplateDocument(data, {parent: canvas.scene}),
            cache: (t) => ssc.addTemplate(t)
        },
        tiles: {
            doc: (data) => new TileDocument(data, {parent: canvas.scene}),
            cache: (t) => ssc.addTile(t)
        },
        tokens: {
            doc: (data) => new ScrollerTokenDocument(data, {parent: canvas.scene}),
            cache: (t) => ssc.cacheToken(t)
        },
        walls: {
            doc: (data) => new WallDocument(data, {parent: canvas.scene}),
            cache: (w) => ssc.addWall(w)
        }
    }

    for (const placeable of placeables) {
        scene[placeable].forEach(p=> {
            const data = p.toObject();
            const doc = pDict[placeable].doc(data);
            doc.parentSubScene = [tileDoc.ss_id];
            doc.parentUUID = [scene.compendiumUUID];
            pDict[placeable].cache(doc);
        })
    }
}

/** Given an array of compendium scene UUID's, create Foundry Tile Documents for each and cache them.
 * @param {string|array.<string>}   uuids   The array of uuid strings
 */
export async function cacheSubScene(uuids) {
    log(false, "Caching Sub-Scenes from uuid's");
    if ( !Array.isArray(uuids) ) uuids = [uuids];

    for (const uuid of uuids) {

        if ( !ssc.compendiumSourceFromCache(uuid) ) {
            // Save the tile compendium source in the cache referencing the uuid
            const source = await fromUuid(uuid);
            if ( source ) {
                source.compendiumUUID = uuid;
                ssc.cacheCompendiumSource(uuid, source);
            }
        }
        const source = ssc.compendiumSourceFromCache(uuid);
        if ( !source ) continue;

        if ( !ssc.spriteFromCache(uuid) ) {
            // Have Foundry load the texture
            await TextureLoader.loader.load([source.background.src])
            ssc.cacheSubSceneSprite(uuid, new PIXI.Sprite(await loadTexture(source.background.src)));
        }

        if ( !ssc.getSubSceneTileDoc(uuid) ) {
            // Create a local memory tile for this source.  (not saved to database)
            const data = {
                x: 0,
                y: 0,
                width: source.width,
                height: source.height,
                overhead: false,
                img: source.background.src,
                _id: foundry.utils.randomID(16)
            }
            const tileDoc = new TileDocument(data, {parent: canvas.scene});
            tileDoc.compendiumSubSceneUUID = uuid;
            tileDoc.ss_id = foundry.utils.randomID(16);
            const sourcePath = source.getFlag("scene-scroller-maker", ssc.compendiumFlags[3]);
            tileDoc.imagePath = PolygonMesher.getClipperPathFromPoints(sourcePath);

            // Save this tile in the cache referencing both tile.id and the scene uuid, for convenience
            ssc.setSubSceneCache(tileDoc.ss_id, tileDoc);
            ssc.setSubSceneCache(uuid, tileDoc);
        }

        // Cache the placeables for this sub-scene
        const tileDoc = ssc.getSubSceneTileDoc(uuid);
        cacheInScenePlaceables(source, tileDoc);
    }
}

export const debounceGrandChildCache = foundry.utils.debounce( async (uuidArr) => {
    log(false, "Caching grandchildren scenes.");
    const missingGrandChildren = new Set();
    for (const childUuid of uuidArr) {
        const childSource = await fromUuid(childUuid);
        const childFlags = childSource.getFlag("scene-scroller-maker", ssc.compendiumFlags[0]);
        const grandChildrenUUIDs = childFlags.map(s => {
            return s[ssc.subSceneChildrenFlags[0]];
        });
        grandChildrenUUIDs.forEach(u => {
            if ( !ssc.getSubSceneTileDoc(u) ) missingGrandChildren.add(u);
        })
    }
    cacheSubScene([...missingGrandChildren]);
}, 1000);

/**
 * A debounced function to update token data (location, occupied sub-scene). 
 * Debounced 1 second because the user could be making multiple movements in succession.
 * @param {object} tokenArr An array of Foundry Token instances
 */
const debounceCacheToken = foundry.utils.debounce( async (currArr, tokenDoc) => {
    log(false, `Saving location and occupied sub-scene of token with ss_id ${tokenDoc.ss_id} into Scene flags`);
    await canvas.scene.setFlag(ModuleName, ssc.viewportFlags[0], currArr);
    await canvas.scene.setFlag(ModuleName, ssc.viewportFlags[1], tokenDoc.ss_id);
}, 1000);