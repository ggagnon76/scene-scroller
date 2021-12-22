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