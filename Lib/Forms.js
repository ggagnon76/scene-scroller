import { ModuleName } from "../ss-initialize.js";
import { getSource } from "./Functions.js";

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
        title: "Scene Scroller scene selection",
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

  export class TokenCreationSelect extends SidebarTab {  // Ref: CompendiumDirectory class in foundry.js
     constructor(data){
       super(data);
       this._dragDrop[0].permissions["dragstart"] = () => game.user.can("TOKEN_CREATE");
       this.draggedActor = data.actorId;
     } 

    /** @override */
      static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
          id: "token_create_select",
          template: "./modules/scene-scroller/templates/token-create.hbs",
          title: "SCENE SCROLLER: Select Scene",
          dragDrop: [{ dragSelector: ".directory-item"}],
        });
    }
  
      /* -------------------------------------------- */
  
    /** @override */
    async getData() {
  
      // This section gets all the compendium scenes currently active in the main scene.
      // Gather an array of all the Scene Tiler tiles in the scene
      const sceneTilerTilesIDs = canvas.scene.getFlag(ModuleName, "sceneScrollerSceneFlags").SceneTilerTileIDsArray;
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
      const linkedTokens = canvas.tokens.placeables.filter(t => t.data.actorLink === true);
      // Filter linkedTokens to find only those that have SceneScrollerTokenFlags in their flags.
      linkedTokens.filter(t => t.data.flags.hasOwnProperty("SceneScrollerTokenFlags"));
      // Get an array of unlinked actor documents.
      const unlinkedTokens = Array.from(game.actors.tokens);
      // Filter unlinkedTokens to find only those that have SceneScrollerTokenFlags in their flags.
      unlinkedTokens.filter(t => t.data.flags.hasOwnProperty("SceneScrollerTokenFlags"));

      const allTokens = [...linkedTokens, ...unlinkedTokens];
      // Map the allTokens array to create an array of objects containing actor documents and destination tile IDs.

      const allActors = allTokens.map(t => {
        const actor = game.actors.get(t.data.actorId);
        const destination = t.data.flags.SceneScrollerTokenFlags.CurrentTile; 
        return {actor: actor, tileId: destination};
      });

      // Return data to the sidebar
      return {
        actor: this.draggedActor,
        sceneArray: compendiumScenes,
        actorArray: allActors
      }
    }

    /** @override */
    createPopout() {
      const pop = super.createPopout();
      pop.draggedActor = this.draggedActor
      return pop;
    }
  
    /* -------------------------------------------- */

     /**
   * Activate event listeners triggered
   */
	activateListeners(html) {
	  super.activateListeners(html);
  }

    /** @override */
  _onDragStart(event) {

    Hooks.once('dropCanvasData', async (canvas, data) => {
      const actor = game.actors.get(data.id);
      await actor.data.token.update({flags: {
        SceneScrollerTokenFlags: {
          CurrentTile: data.destination
        }
      }})
    })

    const li = event.currentTarget.closest(".directory-item");
    let actor = null;
    if ( this.draggedActor ) {
      actor = game.actors.get(this.draggedActor);
      if ( !actor || !actor.visible ) return false;
    }

    // Create the drag preview for the Token
    if ( actor && canvas.ready ) {
      const img = {src: actor.thumbnail};
      const td = actor.data.token;
      const w = td.width * canvas.dimensions.size * td.scale * canvas.stage.scale.x;
      const h = td.height * canvas.dimensions.size * td.scale * canvas.stage.scale.y;
      const preview = DragDrop.createDragImage(img, w, h);
      const destTile = li.dataset.documentId;
      event.dataTransfer.setDragImage(preview, w / 2, h / 2);
      event.dataTransfer.setData("text/plain", JSON.stringify({id: this.draggedActor, type: "Actor", destination: destTile}));
      this.close();
    }
  }

}