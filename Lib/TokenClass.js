import { ModuleName, ssc } from "../ss-initialize.js";
import * as Viewport from "./ViewportClass.js";
import * as Forms from "./forms.js";

// Override Token methods to replace ._id with .ss_id
export class ScrollerToken extends CONFIG.Token.objectClass {

    get id() {
        return this.document.ss_id;
    }
}

/**
 * A debounced function to update token data (location, occpied sub-scene). 
 * Debounced 1 second because the user could be making multiple movements in succession.
 * @param {object} tokenArr An array of Foundry Token instances
 */
const debounceTokenUpdate = foundry.utils.debounce( (tokenArr) => {
    for (const {token, loc, uuid} of tokenArr) {
        ssc.updateTokenFlags(token, loc, uuid);
    }
}, 1000);

/** A function containing core workflow for a token move by mouse
 * See Foundry.js, line 47395
 * @param {object} event HTML event
 * @returns {object}    array of updates
 */
function core_onDragLeftDrop(event) {
    const clones = event.data.clones || [];
    const {originalEvent, destination} = event.data;

    // Ensure the cursor destination is within bounds
    if ( !canvas.dimensions.rect.contains(destination.x, destination.y) ) return false;

    // Compute the final dropped positions
    const updates = clones.reduce((updates, c) => {

      // Get the snapped top-left coordinate
      let dest = {x: c.x, y: c.y};
      if ( !originalEvent.shiftKey && (canvas.grid.type !== CONST.GRID_TYPES.GRIDLESS) ) {
        const isTiny = (c.width < 1) && (c.height < 1);
        dest = canvas.grid.getSnappedPosition(dest.x, dest.y, isTiny ? 2 : 1);
      }

      // Test collision for each moved token vs the central point of it's destination space
      const target = c.getCenter(dest.x, dest.y);
      if ( !game.user.isGM ) {
        c._velocity = c._original._velocity;
        let collides = c.checkCollision(target);
        if ( collides ) {
          ui.notifications.error("ERROR.TokenCollide", {localize: true});
          return updates
        }
      }

      // Otherwise ensure the final token center is in-bounds
      else if ( !canvas.dimensions.rect.contains(target.x, target.y) ) return updates;

      // Perform updates where no collision occurs
      updates.push({_id: c._original.id, x: dest.x, y: dest.y});
      return updates;
    }, []);

    return updates;
}

/**
 * A replacement function for a token drag-drop event (token movement by mouse)
 * @param {object} event HTML event
 */
export async function tokenDragDrop(event) {
    
    const updates = core_onDragLeftDrop(event);
    Viewport.determineDestination(updates);
    const isUpdated = Viewport.parentSceneNeedsUpdate(updates);

    const updatedTokenArr = [];

    if ( !isUpdated ) {
        // Move tokens
        for (const update of updates) {
            const tok = ssc.getToken(update._id);
            tok.document.updateSource({
                x: update.x,
                y: update.y
            })
            // Animate token movement.  See Foundry.js, line 46650
            tok.animate(update);

            const currSubScene = ssc.getSubSceneTile(ssc.activeSceneUUID);
            updatedTokenArr.push({
                token: tok,
                loc: {x: update.x - currSubScene.x, y: update.y - currSubScene.y},
                uuid: currSubScene.compendiumSubSceneUUID
            })
        }
        // Debounce the update of token flags with new loc (and new sub-scene if necessary) for updatedTokenArr
        debounceTokenUpdate(updatedTokenArr);
        return;
    }

    /****************************** */
    /* The active scene changes.    */
    /****************************** */

    // What are the sub-scenes that will be added?
    const scenesToAdd = subScenesToAdd(updates[0].destinationSubScene.compendiumSubSceneUUID)
    // What are the sub-scenes that need to be removed?
    const scenesToRemove = subScenesToRemove(updates[0].destinationSubScene.compendiumSubSceneUUID);
    // Remove sub-scenes that are now grandchildren
    removeSubScenes(scenesToRemove, updates[0].destinationSubScene.compendiumSubSceneUUID);

    // Save the viewport location of the soon to be active sub-scene.  To be used to generate a vector
    const tile = ssc.getSubSceneTile(updates[0].destinationSubScene.compendiumSubSceneUUID);
    const oldLoc = {
        x: tile.x,
        y: tile.y
    }

    // Redraw the viewport with the new sub-scene as the active scene
    await populateScene(updates[0].destinationSubScene.compendiumSubSceneUUID, {isParent : true});

    const vector = {
        x: tile.x - oldLoc.x,
        y: tile.y - oldLoc.y
    }

    // Pan the scene by the vector to maintain viewport orientation relative to the new activeScene
    canvas.stage.pivot.set(canvas.stage.pivot.x + vector.x, canvas.stage.pivot.y + vector.y);

    // Update the location of all the remaining placeables in the scene by the vector!
    updatePlaceablesLoc(vector);

    // Add missing placeables
    await populatePlaceables(scenesToAdd);

    // Move tokens
    for (const update of updates) {
        const tok = ssc.getToken(update._id);
        await tok.setPosition(update.x + vector.x, update.y + vector.y);
        tok.x = tok.document.x = update.x + vector.x;
        tok.y = tok.document.y = update.y + vector.y;
        const currSubScene = ssc.getSubSceneTile(ssc.activeSceneUUID);
        updatedTokenArr.push({
            token: tok,
            loc: {x: update.x + vector.x - currSubScene.x, y: update.y + vector.y - currSubScene.y},
            uuid: currSubScene.compendiumSubSceneUUID
        })
    }
    // Debounce the update of token flags with new loc (and new sub-scene if necessary) for updatedTokenArr
    debounceTokenUpdate(updatedTokenArr);

    // Cache the textures for all the grandchildren
    debounceGrandChildCache(ssc.ActiveChildrenUUIDs);
}

/**
 * Called by a 'preCreateToken' hook.  Stops the standard Foundry token creation workflow
 * and implements this custom workflow.
 * @param {object} doc Foundry Token document.  Supplied by 'preCreateToken' hook.
 * @param {object} data Foundry Token creation data.  Supplied by 'preCreateToken' hook.
 * @param {object} options Foundry Token creation options.  Supplied by 'preCreateToken' hook.
 * @param {string} userId Foundry game user ID.  Supplied by 'preCreateToken' hook.
 * @returns {boolean}   Returning false stops the standard Foundry creation workflow for a token.
 */
export function tokenCreate(doc, data, options, userId) {
    // Don't alter normal token creation for non-scene-scroller scenes.
    if ( !Viewport.isScrollerScene() ) return true;

    const d = canvas.dimensions;
    const tw = doc.width * d.size / 2; // Half of Token Width
    const th = doc.height * d.size / 2;  // Half of Token Height
    const tc = {  // Token center
        x: data.x + tw,
        y: data.y + th
    }

    // Check to see if the token drop location is contained within the bounds of one or more sub-scenes.
    const subSceneArr = Viewport.locInSubScenes(tc);
    
    // If the token was dropped in the viewport but not in any sub-scene, don't create the token...
    if ( !subSceneArr.length ) {
        log(false, "Aborting token creation.  Not dropped in area defined by a sub-scene (tile).");
        ui.notifications.warn("Token drop location is not contained in any sub-scene.  Token creation aborted.");
        return false;
    }

    if ( subSceneArr.length > 1 ) {
        log(false, "Token is on overlapping pixels for two sub-scenes.  Choosing the first in the array (random).")
    }

    const finalSubScene = subSceneArr[0];

    // Update the token flags with the required data.
    doc.updateSource({
        _id : foundry.utils.randomID(16),
        [`flags.${ModuleName}.${ssc.tokenFlags[0]}`] : finalSubScene.compendiumSubSceneUUID,
        [`flags.${ModuleName}.${ssc.tokenFlags[1]}`] : {x: data.x - finalSubScene.x, y: data.y - finalSubScene.y}
    });

    // Assign our own ID to the token document
    doc.ss_id = foundry.utils.randomID(16);
    
    // Create token placeable
    const tok = new ScrollerToken(doc);
    doc._object = tok;
    // Cache the token
    ssc.cacheToken(tok);
    // Add the token to the scene
    canvas.tokens.objects.addChild(tok);

    // Draw token and update eventListeners
    Viewport.placeableDraw(tok);

    tok.visible = true;

    if ( ssc.selTokenApp === null ) ssc.selTokenApp = new Forms.ScrollerViewSubSceneSelector({}, {left: ui.sidebar._element[0].offsetLeft - 205, top: 3}).render(true);
    else ssc.selTokenApp.render(true);

    // Don't allow creation of token in db.
    return false;
}