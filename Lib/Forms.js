import { ModuleName } from "../ss-initialize.js";
import { getSource, resetMainScene } from "./Functions.js";
import { SceneScroller } from "./SceneScroller.js";

/** Form application that will be invoked when the DM activates a scene to become
 *  a Scene-Scroller viewport.
 *  The form will request the DM choose a compendium and then a seed scene.
 */
export class ScrollerSelectScene extends FormApplication {
    constructor(resolve) {
      super();
      
      this.compendiumList = game.packs
                            .filter(p => p.documentName === "Scene")
                            .map(p => {return p.title});
      this.compendiumChoice = null;
      this.sceneList = [];
      this.callback = (result) => resolve(result);
  
      Handlebars.registerHelper('comp_equal', function(picked) {
        return this === picked;
      })
    }
  
    async close(options={}) {
      if ( !options.resolved ) this.callback(null)
      return super.close(options);
    }
  
    static get defaultOptions() {
      return mergeObject(super.defaultOptions, {
        width: 400,
        template: `./modules/${ModuleName}/templates/initialize.hbs`,
        id: "scene-scroller-selection-form",
        title: game.i18n.localize('SceneScroller.SelectSceneUI.Title'),
        submitOnChange: true,
        closeOnSubmit: false
      })
    }
  
    getData() {
      // Send compendium choice and list of scenes to the template
      if (this.compendiumChoice !== null) {
        // List of scenes in selected compendium for selection box
        this.sceneList = [];
        const compndm = game.packs.filter(p => p.title === this.compendiumChoice)[0];
        for (const scn of compndm.index.contents) {
          this.sceneList.push(scn.name);
        }
      }
  
      // Send list of scene compendiums to the template
      return {
        compSelectText: game.i18n.localize('SceneScroller.SelectSceneUI.Instructions.SelectCompendium'),
        defaultSelect: game.i18n.localize('SceneScroller.SelectSceneUI.SelectDefault'),
        sceneSelectText: game.i18n.localize('SceneScroller.SelectSceneUI.Instructions.SelectScene'),
        compendiumList: this.compendiumList,
        compendium: this.compendiumChoice,
        sceneList: this.sceneList
      }
    }
  
    activateListeners(html) {
      super.activateListeners(html);
    }
  
    async _updateObject(event, formData) {
      if (!formData.z_scene_sel || formData.z_scene_sel === "no_selection") {
        if (formData.z_comp_sel === "no_selection") return
        this.compendiumChoice = formData.z_comp_sel;
        this.render(true);
        return;
      }
      if (formData.z_scene_sel) {
        const source = await getSource(formData.z_comp_sel, formData.z_scene_sel);
        this.callback(source);
        this.close({resolved: true});
        Handlebars.unregisterHelper('comp_equal');
      }
    }
  }

  /* -------------------------------------------------------------------------------------------*/

  /** This is a window that will be invoked every time a user or DM tries to create a token,
   *  either programmatically (via preCreateToken Hook) or by dragging an actor from the actor
   *  folder onto the canvas (wrapped ActorDirectory#_onDragStart).
   * 
   *  The window will provide a list of sub-scenes (Scene Tiler tiles) to choose that are already in the 
   *  main scene (viewport) as well as a list of all tokens, such that the user can 
   *  select the sub-scene a token occupies by choosing the token.
   * 
   *  This is necessary because the location of the token is stored in token flags, and is relative
   *  to the top left corner of the tile it occupies.
   */
  export class NewTokenTileSelectUI extends Application { 
     constructor(data, options={}){
       super(options);
       this._dragDrop[0].permissions["dragstart"] = () => game.user.can("TOKEN_CREATE");
       this.draggedActor = data.actorId || data._id;
     } 
  
    /** @override */
      static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
          width: 300,
          height: "auto",
          id: "new_token_tile_select_ui",
          template: "./modules/scene-scroller/templates/token-create.hbs",
          title: game.i18n.localize('SceneScroller.NewTokenTileSelectUI.Title'),
          dragDrop: [{ dragSelector: ".ss-scene-list"}, { dragSelector: ".ss-actor-list"}]
        });
    }
  
    /** @override */
    async getData() {
  
      // This section gets all the compendium scenes currently active in the main scene.
      // Gather an array of all the Scene Tiler tiles in the scene
      const sceneTilerTilesIDs = canvas.scene.getFlag(ModuleName, "SceneTilerTileIDsArray");
      // For every Scene-Tiler tile, get the UUID as well as the tile ID.
      const sceneTilerTilesUUID = sceneTilerTilesIDs.map(t => {
        return  {  tileId: t,
                  compendiumSceneUUID: canvas.background.get(t).document.getFlag("scene-tiler", "scene")
                }
      })
      // For every sceneUUID, get the compendium scenes source.
      const compendiumScenes = await Promise.all(sceneTilerTilesUUID.map( async (u) => {
        return {  tileId: u.tileId, 
                  compendiumScene: await fromUuid(u.compendiumSceneUUID)
               }
      }));

      // This section gets all the actors with tokens currently in the main scene
      // Get an array of all tokens that are linked to actors
      const allTokens = canvas.tokens.placeables;
      // Filter allTokens to find only those that have 'scene-scroller' in their flags.
      allTokens.filter(t => t.data.flags.hasOwnProperty(ModuleName));
      // Map the allTokens array to create an array of objects containing actor documents and destination tile IDs.

      const allActors = allTokens.map(t => {
        const actor = game.actors.get(t.data.actorId);
        const destination = t.data.flags[ModuleName].CurrentTile ||
                            t.data; 
        return {actor: actor, tileId: destination};
      });

      // Return data to the sidebar
      return {
        generalNote: game.i18n.localize('SceneScroller.NewTokenTileSelectUI.Instructions.General'),
        scenesNote: game.i18n.localize('SceneScroller.NewTokenTileSelectUI.Instructions.Scenes'),
        tokensNote: game.i18n.localize('SceneScroller.NewTokenTileSelectUI.Instructions.Tokens'),
        optionOr: game.i18n.localize('SceneScroller.OptionOr'),
        optionEither: game.i18n.localize('SceneScroller.OptionEither'),
        actor: this.draggedActor,
        sceneArray: compendiumScenes,
        actorArray: allActors
      }
    }
  
    /* -------------------------------------------- */

    /** @override */
  _onDragStart(event) {

    Hooks.once('dropCanvasData', async (canvas, data) => {
      const actor = game.actors.get(data.id);
      
      await actor.data.token.update({"flags": {
        "scene-scroller": {
          "CurrentTile": data.destination,
          "inTileLoc": null
        }
      }})

      Hooks.once('createToken', () => {
        resetMainScene(false);
      })
    })


    const li =  event.currentTarget.closest(".ss-scene-list") ||
                event.currentTarget.closest(".ss-actor-list");
    const destTileId = li.dataset.documentId;

    let actor = null;
    if ( this.draggedActor ) {
      actor = game.actors.get(this.draggedActor);
      if ( !actor || !actor.visible ) return false;
    }

    // Create the drag preview for the Token
    if ( actor && canvas.ready ) {
      SceneScroller.displaySubScenes(destTileId, false);
      const img = {src: actor.thumbnail};
      const td = actor.data.token;
      const w = td.width * canvas.dimensions.size * td.scale * canvas.stage.scale.x;
      const h = td.height * canvas.dimensions.size * td.scale * canvas.stage.scale.y;
      const preview = DragDrop.createDragImage(img, w, h);
      event.dataTransfer.setDragImage(preview, w / 2, h / 2);
      event.dataTransfer.setData("text/plain", JSON.stringify({id: this.draggedActor, type: "Actor", destination: destTileId}));
      this.close();
    }
  }

}