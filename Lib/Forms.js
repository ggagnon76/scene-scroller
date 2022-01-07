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

  export class NewTokenTileSelectUI extends SidebarTab { 

    /** @override */
      static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
          id: "new_token_tile_select_ui",
        template: "./templates/token-creation.html",
        title: "This is what?"
      });
    }
  
      /* -------------------------------------------- */
  
    /** @override */
    getData(options) {
  
      // Filter packs for visibility
      let packs = game.packs.filter(p => game.user.isGM || !p.private);
  
      // Sort packs by Document type
      const packData = packs.sort((a,b) => a.documentName.localeCompare(b.documentName)).reduce((obj, pack) => {
        const documentName = pack.documentName;
        if ( !obj.hasOwnProperty(documentName) ) obj[documentName] = {
          label: documentName,
          packs: []
        };
        obj[documentName].packs.push(pack);
        return obj;
      }, {});
  
      // Sort packs within type
      for ( let p of Object.values(packData) ) {
        p.packs = p.packs.sort((a,b) => a.title.localeCompare(b.title));
      }
  
      // Return data to the sidebar
      return {
        user: game.user,
        packs: packData
      }
    }
  
    /* -------------------------------------------- */
  
    /** @override */
      activateListeners(html) {
  
        // Click to open
        html.find('.compendium-pack').click(ev => {
          const li = ev.currentTarget;
        const pack = game.packs.get(li.dataset.pack);
        if ( li.dataset.open === "1" ) pack.apps.forEach(app => app.close());
        else {
          this._toggleOpenState(li.dataset.pack);
          pack.render(true);
        }
      });
  
        // Options below are GM only
      if ( !game.user.isGM ) return;
  
        // Create Compendium
      html.find('.create-compendium').click(this._onCreateCompendium.bind(this));
  
      // Compendium context menu
      this._contextMenu(html);
    }
  
    /* -------------------------------------------- */
  
    /**
     * Compendium sidebar Context Menu creation
     * @param {jQuery} html     The HTML being rendered for the compendium directory
     * @protected
     */
    _contextMenu(html) {
      ContextMenu.create(this, html, ".compendium-pack", this._getEntryContextOptions());
    }
  
    /* -------------------------------------------- */
  
    /**
     * Get the sidebar directory entry context options
     * @return {Object}   The sidebar entry context options
     * @private
     */
    _getEntryContextOptions() {
      return [
        {
          name: "COMPENDIUM.ToggleVisibility",
          icon: '<i class="fas fa-eye"></i>',
          callback: li => {
            let pack = game.packs.get(li.data("pack"));
            return pack.configure({private: !pack.private});
          }
        },
        {
          name: "COMPENDIUM.ToggleLocked",
          icon: '<i class="fas fa-lock"></i>',
          callback: li => {
            let pack = game.packs.get(li.data("pack"));
            const isUnlock = pack.locked;
            if ( isUnlock && (pack.metadata.package !== "world")) {
              return Dialog.confirm({
                title: `${game.i18n.localize("COMPENDIUM.ToggleLocked")}: ${pack.title}`,
                content: `<p><strong>${game.i18n.localize("Warning")}:</strong> ${game.i18n.localize("COMPENDIUM.ToggleLockedWarning")}</p>`,
                yes: () => pack.configure({locked: !pack.locked}),
                options: {
                  top: Math.min(li[0].offsetTop, window.innerHeight - 350),
                  left: window.innerWidth - 720,
                  width: 400
                }
              });
            }
            else return pack.configure({locked: !pack.locked});
          }
        },
        {
          name: "COMPENDIUM.Duplicate",
          icon: '<i class="fas fa-copy"></i>',
          callback: li => {
            let pack = game.packs.get(li.data("pack"));
            const html = `<form>
              <div class="form-group">
                  <label>${game.i18n.localize("COMPENDIUM.DuplicateTitle")}</label>
                  <input type="text" name="label" value="${pack.title}"/>
                  <p class="notes">${game.i18n.localize("COMPENDIUM.DuplicateHint")}</p>
              </div>
            </form>`;
            return Dialog.confirm({
              title: `${game.i18n.localize("COMPENDIUM.ToggleLocked")}: ${pack.title}`,
              content: html,
              yes: html => {
                const label = html.querySelector('input[name="label"]').value;
                return pack.duplicateCompendium({label})
              },
              options: {
                top: Math.min(li[0].offsetTop, window.innerHeight - 350),
                left: window.innerWidth - 720,
                width: 400,
                jQuery: false
              }
            });
          }
        },
        {
          name: "COMPENDIUM.ImportAll",
          icon: '<i class="fas fa-download"></i>',
          callback: li => {
            let pack = game.packs.get(li.data("pack"));
            return pack.importDialog({
              top: Math.min(li[0].offsetTop, window.innerHeight - 350),
              left: window.innerWidth - 720,
              width: 400
            });
          }
        },
        {
          name: "COMPENDIUM.Delete",
          icon: '<i class="fas fa-trash"></i>',
          condition: li => {
            let pack = game.packs.get(li.data("pack"));
            return pack.metadata.package === "world";
          },
          callback: li => {
            let pack = game.packs.get(li.data("pack"));
            return this._onDeleteCompendium(pack);
          }
        }
      ];
    }
}