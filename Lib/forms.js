import { ModuleName, ssc } from "../ss-initialize.js";
import { getUUID } from "./functions.js";
import * as Viewport from "./ViewportClass.js";

/** Form application that will be invoked when the DM activates a scene to become
 *  a Scene-Scroller viewport.
 *  The form will request the DM choose a compendium and then a seed scene.
 */
export class ScrollerInitiateScene extends FormApplication {
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
  
    close(options={}) {
      if ( !options.resolved ) this.callback(null)
      return super.close(options);
    }
  
    static get defaultOptions() {
      return mergeObject(super.defaultOptions, {
        width: 400,
        template: `./modules/${ModuleName}/templates/initialize.hbs`,
        id: "scene-scroller-initiate-form",
        title: game.i18n.localize('SceneScroller.InitiateSceneUI.Title'),
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
        compSelectText: game.i18n.localize('SceneScroller.InitiateSceneUI.Instructions.SelectCompendium'),
        defaultSelect: game.i18n.localize('SceneScroller.InitiateSceneUI.SelectDefault'),
        sceneSelectText: game.i18n.localize('SceneScroller.InitiateSceneUI.Instructions.SelectScene'),
        compendiumList: this.compendiumList,
        compendium: this.compendiumChoice,
        sceneList: this.sceneList
      }
    }
  
    activateListeners(html) {
      super.activateListeners(html);
    }
  
    _updateObject(event, formData) {
      if (!formData.z_scene_sel || formData.z_scene_sel === "no_selection") {
        if (formData.z_comp_sel === "no_selection") return
        this.compendiumChoice = formData.z_comp_sel;
        this.render(true);
        return;
      }
      if (formData.z_scene_sel) {
        const sourceUUID = getUUID(formData.z_comp_sel, formData.z_scene_sel);
        this.callback(sourceUUID);
        this.close({resolved: true});
        Handlebars.unregisterHelper('comp_equal');
      }
    }
  }

/* --------------------------------------------------------------------------------------------------- */

/** Form application that will be invoked anytime a user can select a different token to manipulate.
 *  The DM will always be able to manipulate all tokens, so this will always be active for them.
 *  The DM will also have a tab to choose to activate a sub-scene without selecting a token.
 */
 export class ScrollerViewSubSceneSelector extends FormApplication {
  constructor(object={}, options={}) {
    super(object, options);
    this.tokens = options.tokens || true;
  }

  static get defaultOptions() {
    return mergeObject(super.defaultOptions, {
      width: 200,
      height: "auto",
      template: `./modules/${ModuleName}/templates/subsceneselector.hbs`,
      id: "scene-scroller-selection-form",
      title: game.i18n.localize('SceneScroller.SelectSceneUI.Title')
    })
  }

  async getData() {

    // This gets all the sub-scenes that are cached.  Returns the sub-scene UUID, thumbnail and name.
    const cachedSubScenesData = [];
    for (const subScene of ssc.allSubScenes) {
      const subSceneSource = ssc.compendiumSourceFromCache(subScene.compendiumSubSceneUUID); 
      const obj = {
        tileId : subScene.compendiumSubSceneUUID,
        thumb: subSceneSource.thumbnail,
        name: subSceneSource.name
      }
      cachedSubScenesData.push(obj);
    }
        

    let buttonText = game.i18n.localize('SceneScroller.SelectSceneUI.TileButtonText');
    if ( this.tokens ) buttonText = game.i18n.localize('SceneScroller.SelectSceneUI.TokenButtonText');

    // This gets all the tokens the user has permissions to at least view.
    // We also don't want tokens that are already being controlled in this list.
    const viewableTokenDocuments = ssc.getAllTokenDocs;
    const viewableTokens = canvas.tokens.placeables
                            .filter(t => viewableTokenDocuments.includes(t.document))
                            .filter(t => t.observer === true)
                            .filter(t => t.controlled === false);


    // Send list tokens to the template
    return {
      viewableTokens : viewableTokens,
      viewableScenes : cachedSubScenesData,
      isGM: game.user.isGM,
      ssButtonText : buttonText,
      isTokens : this.tokens
    }
  }

  activateListeners(html) {
    super.activateListeners(html);
    html.find('.ss-token-select-list').click(this.tokenDisplaySubScene.bind(this));
    html.find('.ss-scene-list').click(this.sceneDisplaySubScene.bind(this));
    html.find('.ss-swap-buttons').click(this.swapMode.bind(this));
  }

  async tokenDisplaySubScene(event) {
    const li =  event.currentTarget.closest(".ss-token-select-list");
    const tokenID = li.dataset.documentId;
    const token = ssc.getToken(tokenID);
    const subSceneUUID = ssc.tokenCurrentSubScene(token);
    await Viewport.updateViewport(subSceneUUID);
    this.render(true);
  }

  async sceneDisplaySubScene(event) {
    const li =  event.currentTarget.closest(".ss-scene-list");
    const sceneUUID = li.dataset.documentId;
    await Viewport.updateViewport(sceneUUID);
    this.render(true);
  }

  swapMode() {
    this.tokens = !this.tokens;
    this.render(true);
  }
}