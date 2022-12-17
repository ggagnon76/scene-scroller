import { ModuleName, SocketModuleName, ssc } from "../ss-initialize.js";
import { message_handler } from "./Socket.js";
import * as Forms from "./forms.js";
import * as SSCache from "./SceneScrollerClass.js";
import * as SSToken from "./TokenClass.js";
import { log } from "./functions.js";

/**
 * FUNCTIONS THAT QUERY OR MANIPULATE THE 'VIEWPORT', WHICH IS DEFINED AS THE LOCAL (PER CLIENT) MEMORY-ONLY MODIFICATIONS
 * PERFORMED TO THE FOUNDRY SCENE.
 */

/**
 * A convenience function to determine if the scene has been initialized as a Scene Scroller viewport.
 * @param {object} scene *Optional* A Foundry Scene.  Defaults to the current active scene.
 * @returns {boolean}   
 */
export function isScrollerScene(scene = canvas.scene) {
    if (scene?.flags?.hasOwnProperty(ModuleName) || ssc !== undefined) return true;
    return false;
}

/**
 * A function that is called by a UI (or macro) by a GM to initialize a foundry scene as
 * a scene scroller viewport.
 */
export async function initialize() {
    if ( !game.user.isGM ) return;

    game.socket.on(SocketModuleName, message_handler);
    game.modules.get(ModuleName).struct = SSCache.SCSC_Flag_Schema;

    const result = await new Promise(resolve => {
        new Dialog({
            title: game.i18n.localize("SceneScroller.ConfirmInitiateSceneUI.Title"),
            content:    `<p>${game.i18n.localize("SceneScroller.ConfirmInitiateSceneUI.Content1")}</p>
                        <p>${game.i18n.localize("SceneScroller.ConfirmInitiateSceneUI.Content2")}</p>`,
            buttons: {
                yes: {
                    icon: '<i class="fas fa-check"></i>',
                    label: "Yes",
                    callback: () => resolve(true)
                },
                no: {
                    icon: '<i class="fas fa-times"></i>',
                    label: "No",
                    callback: () => resolve(false)
                }
                }
            }).render(true);
    });
    if ( !result ) return;

    const sourceUUID = await new Promise((resolve) => {
        new Forms.ScrollerInitiateScene(resolve).render(true);
    })
    if ( sourceUUID === null ) {
        ui.notifications.error("No seed scene was selected.  Scene initialization failed.");
        log(false, "Scene Scroller Scene initialization failed because a seed scene was not selected.");
        return;
    }

    onReady(sourceUUID);
}

/**
 * Called by a 'canvasReady' hook to rebuild the scene from flag data, or from a supplied UUID.
 * @param {string} uuid *Optional* A compendium scene UUID
 */
export async function onReady(uuid = null) {

    if ( !isScrollerScene() && uuid === null ) return;
    log(false, "Executing 'onReady()' function.");

    if ( uuid !== null ) {
        ssc.cacheactiveSceneUUID(uuid);
    }

    const activeSceneUuid = uuid === null ? ssc.activeSceneUUID : uuid;

    // Scene is empty.  Cache the active sub-scene and child sub-scenes.
    const source = await fromUuid(activeSceneUuid);
    const childrenFlags = source.getFlag("scene-scroller-maker", ssc.compendiumFlags[0]);
    const childrenUUIDs = childrenFlags.map(s => {
        return s[ssc.subSceneChildrenFlags[0]];
    });
    const uuidsArr = [activeSceneUuid, ...childrenUUIDs];
    await SSCache.cacheSubScene(uuidsArr);

    // Add sub-scene tiles to the canvas
    await populateScene(ssc.activeSceneUUID, {isParent : true});

    // Add placeables to all sub-scenes in the viewport
    await populatePlaceables(uuidsArr);

    if ( ssc.getAllTokenDocs.length ) {
        // Pan to active token
        const activeTokenID = ssc.activeTokenID;
        const tokDoc = ssc.getToken(activeTokenID);
        const tok = canvas.tokens.placeables.filter(t => t.document === tokDoc).pop();
        canvas.animatePan({x: tok.center.x, y: tok.center.y, duration: 0})
    } else sceneCenterScaleToFit();

    if ( ssc.getAllTokenDocs.length ) {
        if ( ssc.selTokenApp === null ) ssc.selTokenApp = new Forms.ScrollerViewSubSceneSelector({}, {left: ui.sidebar._element[0].offsetLeft - 205, top: 3}).render(true);
        else this.selTokenApp.render(true);
    }

    // Cache the textures for all the grandchildren
    SSCache.debounceGrandChildCache(ssc.ActiveChildrenUUIDs);
}

/**
 * Changes the size of the scene (local memory-only).  Does not affect db or trigger canvas.draw().
 * @param {object} area {width: <number>, height: <number>}
 */
export async function localResizeScene(area) {

    canvas.primary.removeChildren();

    const sceneWidth = area.width;
    const sceneHeight = area.height;
    const gridType = canvas.grid.type;
    const gridCls = BaseGrid.implementationFor(gridType);
    const gridPadding = gridCls.calculatePadding(gridType, sceneWidth, sceneHeight, canvas.grid.size, canvas.scene.padding, {
        legacy: canvas.scene.flags.core?.legacyHex
    });
    const sceneX = gridPadding.x - canvas.scene.background.offsetX;
    const sceneY = gridPadding.y - canvas.scene.background.offsetY;

    const data = {
        width: gridPadding.width,
        height: gridPadding.height,
        size: canvas.grid.size,
        rect: new PIXI.Rectangle(0,0, gridPadding.width, gridPadding.height),
        sceneX: sceneX,
        sceneY: sceneY,
        sceneWidth: sceneWidth,
        sceneHeight: sceneHeight,
        sceneRect: new PIXI.Rectangle(sceneX, sceneY, sceneWidth, sceneHeight),
        distance: canvas.dimensions.distance,
        ratio: sceneWidth/sceneHeight,
        maxR: Math.hypot(gridPadding.width, gridPadding.height)
    }

    foundry.utils.mergeObject(canvas.dimensions, data);
    canvas.scene.dimensions = canvas.dimensions;

    canvas.walls._draw();

    const updates = ["stage", "drawings", "environment", "grid", "hidden", "lighting", "notes", "rendered", "sounds", "templates", "tiles", "tokens", "walls", "weather"];

    for (const u of updates) {
        canvas[u].hitArea = canvas.dimensions.rect;
    }

    const outline = new PIXI.Graphics();
    const {scene, dimensions} = canvas;
    const displayCanvasBorder = scene.padding !== 0;
    const displaySceneOutline = !scene.background.src;
    if ( !(displayCanvasBorder || displaySceneOutline) ) return;
    if ( displayCanvasBorder ) outline.lineStyle({
      alignment: 1,
      alpha: 0.75,
      color: 0x000000,
      join: PIXI.LINE_JOIN.BEVEL,
      width: 4
    }).drawShape(dimensions.rect);
    if ( displaySceneOutline ) outline.lineStyle({
      alignment: 1,
      alpha: 0.25,
      color: 0x000000,
      join: PIXI.LINE_JOIN.BEVEL,
      width: 4
    }).beginFill(0xFFFFFF, 0.025).drawShape(dimensions.sceneRect).endFill();

    canvas.interface.removeChildAt(0);
    canvas.interface.addChildAt(outline, 0);
    canvas.grid.draw();
    // For every token, re-create their border containers
    for (const t of canvas.tokens.placeables) {
        await t._draw();
    }

    canvas.fog.configureResolution();

    const cr = canvas.dimensions.rect;
    canvas.masks.canvas.clear().beginFill(0xFFFFFF, 1.0).drawRect(cr.x, cr.y, cr.width, cr.height).endFill();
    canvas.primary.sprite.mask = canvas.primary.mask = canvas.perception.mask = canvas.effects.mask = canvas.interface.grid.mask = canvas.masks.canvas;

    //canvas.primary.draw();
    canvas.effects.illumination.draw();
    canvas.effects.visibility.draw();
}

/**
 * Pans the canvas to center the view at the center of the current scene.
 * Only used when setting a new sub-scene which doesn't have tokens
 */
export function sceneCenterScaleToFit() {
    const pad = 75;
    const sidebarPad = $("#sidebar").width() + pad;
    const d = canvas.dimensions;

    const center = {
        x: d.width / 2,
        y: d.height / 2
    }

    const scale = {
        x: (window.innerWidth - sidebarPad - pad) / d.width,
        y: (window.innerHeight - 2 * pad) / d.height
    }

    const finalScale = scale.x < scale.y ? scale.x : scale.y;

    canvas.stage.pivot.set(center.x, center.y);
    canvas.stage.scale.set(finalScale, finalScale);
    canvas.updateBlur(finalScale)
}

/**
 * Determines if a location is within the bounds of any sub-scenes being displayed in the viewport.
 * @param {object} loc {x: <number>, y: <number>}
 * @returns 
 */
export function locInSubScenes(loc) {
    const subSceneArray = [];
    const viewportSubScenesUUIDs = [ssc.activeSceneUUID, ...ssc.ActiveChildrenUUIDs]
    for (const sceneUUID of viewportSubScenesUUIDs) {
        const sceneTile = ssc.getSubSceneTileDoc(sceneUUID);

        // Normalize token location to sub-scene coordinates
        const x = loc.x - sceneTile.x;
        const y = loc.y - sceneTile.y;

        // Test against the image polygon of the sub-scene
        const clipperPt = new ClipperLib.IntPoint(x, y);
        if ( !ClipperLib.Clipper.PointInPolygon(clipperPt, sceneTile.imagePath) ) continue;

        subSceneArray.push(sceneTile.object);
    }

    return subSceneArray;
}

function initializeTile(tileDoc) {

    const tile = new Tile(tileDoc);
    canvas.scene.collections.tiles.set(tileDoc.id, tileDoc)
    tile.draw();
}

/**
 * Given a compendium scene UUID, populates the viewport with the parent and children sub-scenes.
 * @param {string} uuid A compendium scene UUID
 */
export async function populateScene(uuid, {isParent = false}={}) {

    const subScene = ssc.getSubSceneTileDoc(uuid);
    const d = canvas.dimensions;

    // The cached subScene is unaware of the current scene size or padding
    // If we're updating the scene, the current location may be incorrect too.
    // TO INVESTIGATE:  Using subScene.updateSource() here doesn't work?
    if ( isParent ) {
        const activeSceneSource = ssc.compendiumSourceFromCache(uuid);
        const activeSceneLoc = activeSceneSource.getFlag("scene-scroller-maker", ssc.compendiumFlags[2]);
        // Cache this as the new activeScene
        ssc.cacheactiveSceneUUID(uuid);
        // Resize the scene to fit the active scene bounds data.
        const activeSceneBounds = activeSceneSource.getFlag("scene-scroller-maker", ssc.compendiumFlags[1]);
        await localResizeScene(activeSceneBounds);
        // Canvas dimensions have now changed.
        subScene.updateSource({
            x: activeSceneLoc.x + d.sceneX,
            y: activeSceneLoc.y + d.sceneY
        })
    } else {
        const childrenFlags = ssc.ActiveChildrenFlags;
        const childFlags = childrenFlags.filter(c => c[ssc.subSceneChildrenFlags[0]].includes(uuid)).pop();
        subScene.updateSource({
            x: childFlags.ChildCoords.x + d.sceneX,
            y: childFlags.ChildCoords.y + d.sceneY
        })
    }

    initializeTile(subScene);

    // populate child sub-scenes
    if ( isParent ) { 
        for (const childUUID of ssc.ActiveChildrenUUIDs) {
            await populateScene(childUUID);
        }
    }
}

/**
 * Adds all placeables that need to be added to the viewport.
 * @param {array<string>}   uuids   An array of UUID strings.  Only placeables belonging to those UUID's get populated.
 */
export async function populatePlaceables(uuids) {
    const placeables = ["walls", "drawings", "lights", "notes", "sounds", "templates", "tiles", "tokens"];

    // Filter function that finds placeables that belong to a parent compendium scene
    const fn = (puuids, uuids) => {
        for (const uuid of puuids) {
            if ( uuids.includes(uuid) ) return true;
        }
        return false
    }

    for (const placeable of placeables) {
        let placeableDocArr;
        if ( placeable === "tokens") {
            placeableDocArr = [...ssc[placeable].values()];
        } else {
            // Only want placeables that belong to compendium scenes defined by argument <uuids>
            placeableDocArr = [...ssc[placeable].values()].filter(p => fn(p.parentUUID, uuids));
        }
        for (const doc of placeableDocArr) {
            let canvasObj;
            let subScene;
            if ( placeable === "tokens" ) {
                const tokenParentUUID = doc.getFlag(ModuleName, ssc.tokenFlags[0]);
                subScene = ssc.getSubSceneTileDoc(tokenParentUUID);
                doc.parentSubScene = subScene.ss_id;
            } else if ( placeable === "walls" && doc.parentSubScene.length > 1 ) {
                // Walls can belong to two sub scenes.  Need to pick the correct one!
                subScene = ssc.getSubSceneTileDoc(doc.parentSubScene[0]);
                const subScene2 = ssc.getSubSceneTileDoc(doc.parentSubScene[1]);
                subScene = uuids.includes(subScene.compendiumSubSceneUUID) ? subScene : subScene2;
            } else subScene = ssc.getSubSceneTileDoc(doc.parentSubScene[0]);


            const subSceneSource = ssc.compendiumSourceFromCache(subScene.compendiumSubSceneUUID);
            const sourcePlaceable = subSceneSource[placeable].filter(w => w.id === doc.id).pop();


            switch(placeable) {
                case "walls":
                    // If the wall is already in the scene, don't display it again!
                    doc.updateSource({
                        c: [
                            sourcePlaceable.c[0] + subScene.x,
                            sourcePlaceable.c[1] + subScene.y,
                            sourcePlaceable.c[2] + subScene.x,
                            sourcePlaceable.c[3] + subScene.y
                        ]
                    })
                    if ( canvas.walls.placeables.filter(w => w.id === doc.id).length >= 1 ) continue;
                    canvasObj = new Wall(doc);
                    break;
                case "drawings":
                    doc.updateSource({
                        x: sourcePlaceable.x + subScene.x,
                        y: sourcePlaceable.y + subScene.y
                    })
                    canvasObj = new Drawing(doc);
                    break;
                case "lights":
                    doc.updateSource({
                        config: {
                            dim: sourcePlaceable.config.dim,
                            bright: sourcePlaceable.config.bright 
                        },
                        x: sourcePlaceable.x + subScene.x,
                        y: sourcePlaceable.y + subScene.y
                    })
                    canvasObj = new AmbientLight(doc);
                    break;
                case "notes":
                    doc.updateSource({
                        x: sourcePlaceable.x + subScene.x,
                        y: sourcePlaceable.y + subScene.y
                    })
                    canvasObj = new Note(doc);
                    break;
                case "sounds":
                    doc.updateSource({
                        radius: sourcePlaceable.radius
                    })
                    canvasObj = new AmbientSound(doc);
                    break;
                case "templates":
                    doc.updateSource({
                        x: sourcePlaceable.x + subScene.x,
                        y: sourcePlaceable.y + subScene.y
                    })
                    canvasObj = new MeasuredTemplate(doc);
                    break;
                case "tiles":
                    canvasObj = new Tile(doc);

                    doc.updateSource({
                        x: sourcePlaceable.x + subScene.x,
                        y: sourcePlaceable.y + subScene.y
                    })
                    break;
                case "tokens" : 
                    const tokenLoc = doc.getFlag(ModuleName, ssc.tokenFlags[1]);
                    doc.updateSource({
                        x: tokenLoc.x + subScene.x,
                        y: tokenLoc.y + subScene.y
                    })
                    canvasObj = new SSToken.ScrollerToken(doc);
                    doc._object = canvasObj;
                    break;
            }

            canvas.scene.collections[doc.collectionName].set(doc.id, doc)
            canvas[canvasObj.layer.options.name].objects.addChild(canvasObj);
            if ( canvasObj.layer.quadtree ) canvasObj.layer.quadtree.insert({r: canvasObj.bounds, t: canvasObj});
            await placeableDraw(canvasObj);
        }
    }
    canvas.walls._deactivate();
    canvas.perception.update({refreshLighting: true, refreshVision: true}, true);
}

/**
 * Redraws the placeable and replaces some eventListeners with custom functions.
 * @param {object} placeable A Foundry instance for any given placeable.
 */
export async function placeableDraw(placeable) {
    await placeable.draw();

    // Have to update the wall vertices.  Wall.#initializeVertices() is private.  So run Wall._onUpdate().
    if ( placeable instanceof Wall) {
        // Update the vertices
        const data = {
            c: placeable.document.c,
            _id: placeable.document._id
        }
        const options = [
            {
                diff: true,
            },
            game.user.id
        ]
        placeable._onUpdate(data, ...options);

        // Draw door controls
        if ( placeable.document.door === 1 ) {
            drawDoorControl(placeable);
        }
    }

    // Replace the listener for drag drop so Foundry doesn't try to save changes to database.  Update placeable coords instead.
    let placeableDragDrop;
    if ( placeable instanceof Token) {
        placeableDragDrop = (event) => SSToken.tokenDragDrop(event);
    } else {
        placeableDragDrop = _placeableDragDrop.bind(placeable);
    }

    placeable.mouseInteractionManager.callbacks.dragLeftDrop = placeableDragDrop;
}

/**
 * A replacement function for a placeables resize event.
 * @param {object} event HTML event
 */
function _handleDragDrop(event) {
    ui.notifications.info("Resizing not implemented yet.");
}

/**
 * A replacement function for a placeables drag-drop event.
 * @param {object} event HTML event
 */
function _placeableDragDrop(event) {

    if ( this._dragHandle ) {
        const handleDragDrop = _handleDragDrop.bind(this);
        return handleDragDrop(event);
    }

    const {clones, destination, originalEvent} = event.data;
    if ( !clones || !canvas.grid.hitArea.contains(destination.x, destination.y) ) return false;
    const updates = clones.map(c => {
        let dest = {x: c.x, y: c.y};
        if ( !originalEvent.shiftKey ) {
        dest = canvas.grid.getSnappedPosition(c.x, c.y, this.layer.gridPrecision);
        }
        c.x = c.document.x = dest.x;
        c.y = c.document.y = dest.y;
        c._id = c._original.id;
        return c
    });

    for (const update of updates) {
        const placeable = ssc[update.document.collectionName].get(update.id);
        const data = foundry.utils.deepClone(update.data);
        placeable.data = data;
        placeableDraw(placeable);
    }
}

/**
 * Redraws the door control icon and replaces some eventListeners with custom functions.
 * @param {object} p A Foundry Wall instance
 */
async function drawDoorControl(p) {
    if ( !p.doorControl ) p.doorControl = p.createDoorControl();
    p.doorControl.draw();

    const doorControlLeftClick = _doorControlLeftClick.bind(p);
    const doorControlRightClick = _doorControlRightClick.bind(p);
    p.doorControl.off("mousedown")
     .off("rightdown")
     .on("mousedown", doorControlLeftClick)
     .on("rightdown", doorControlRightClick);
}

/**
 * A replacement function for a left-click event on a door icon
 * @param {object} event HTML event
 */
function _doorControlLeftClick(event) {
    /** Copied from DoorControls#_onMouseDown(), line 31545 */
    if ( event.data.originalEvent.button !== 0 ) return; // Only support standard left-click
    event.stopPropagation();
    const state = this.document.ds;
    const states = CONST.WALL_DOOR_STATES;

    // Determine whether the player can control the door at this time
    if ( !game.user.can("WALL_DOORS") ) return false;
    if ( game.paused && !game.user.isGM ) {
      ui.notifications.warn("GAME.PausedWarning", {localize: true});
      return false;
    }

    // Play an audio cue for locked doors
    if ( state === states.LOCKED ) {
      AudioHelper.play({src: CONFIG.sounds.lock});
      return false;
    }

    /** This portion changed to not attempt to save to db. */
    this.document.ds = state === states.CLOSED ? states.OPEN : states.CLOSED;
    drawDoorControl(this);

    // Doesn't make sense that this has to be done.... ???
    for (const token of canvas.tokens.placeables) {
        token.updateSource();
    }

    // Update the lighting and sight
    canvas.perception.update({
        refreshLighting: true,
        refreshVision: true
      }, true);
}

/**
 * A replacement function for a right-click event on a door icon.
 * @param {object} event HTML event
 * @returns 
 */
function _doorControlRightClick(event) {
    /** Copied from DoorControls#_onRightDown(), line 31575 */
    event.stopPropagation();
    if ( !game.user.isGM ) return;
    let state = this.document.ds,
        states = CONST.WALL_DOOR_STATES;
    if ( state === states.OPEN ) return;

    /** This portion changed to not attempt to save to db. */
    this.document.ds = state === states.LOCKED ? states.CLOSED : states.LOCKED;
    drawDoorControl(this);
}

/**
 * Define the destination sub-scene for every token being updated.  Mutates updates array.
 * @param {object}  updates Array of update objects generated by core_onDragLeftDrop()
 */
export function determineDestination(updates) {
    for (let update of updates) {

        // Determine if the token landed in a new sub-scene, then add update details to updatedTokenArr
        const inScenes = locInSubScenes({x: update.x, y: update.y})

        // If somehow the token is dragged in empty space, outside of any sub-scene...
        if ( !inScenes.length ) {
            update.destinationSubScene = null;
            continue;
        }

        if ( inScenes.length > 1 ) {
            log(false, "Token is on overlapping pixels for two sub-scenes.  Choosing the first in the array (random).")
        }

        update.destinationSubScene = inScenes[0];
    }
}

/** 
 * Determine if the viewport activeSubScene needs to be updated.
 * Do not update if at least one controllable token remains on the current active sub-scene.
 * @param {object}  updates The array of objects containing token update data.
 * @returns {boolean}   returns True if an update is required.
 */
export function parentSceneNeedsUpdate(updates) {
    const currSubSceneUuid = ssc.activeSceneUUID;
    for (const update of updates) {
        if ( update.destinationSubScene.document.compendiumSubSceneUUID === currSubSceneUuid ) return false
    }
    return true;
}

export function removeAllSubScenes() {
    canvas.primary.tiles.clear();
    canvas.scene.collections.tiles.clear();
    removeAllPlaceables();
}

function removeAllPlaceables() {

    const doors = canvas.walls.placeables.filter(w => {if (w.doorControl) return true;});
    for (const door of doors) {
        door.doorControl.destroy({children: true});
    }

    const placeables = ["walls", "drawings", "lighting", "notes", "sounds", "templates", "tiles", "tokens"];
    const collections = ["walls", "drawings", "lights", "notes", "sounds", "templates", "tiles", "tokens"];

    for (const collection of collections) {
        canvas.scene.collections[collection].clear();
    }

    for (const placeable of placeables) {
        canvas[placeable]._draw();
    }

    canvas.primary.tokens.clear();

}

export async function updateViewport(newUUID) {

    const toCache = subScenesToAdd(newUUID);
    for (const uuid of toCache) {
        if ( !ssc.hasSubSceneInCache(uuid) ) await SSCache.cacheSubScene(uuid); 
    }

    removeAllSubScenes();
    
    // Redraw the viewport with the new sub-scene as the active scene
    await populateScene(newUUID, {isParent : true});
    
    // Center the new viewport in the window
    sceneCenterScaleToFit();
    
    // Add all placeables
    const newUuidArr = [newUUID, ...ssc.childrenUuids(newUUID)];
    await populatePlaceables(newUuidArr);
}