import { ModuleName } from "../ss-initialize.js";
import { log, isScrollerScene } from "./functions.js";

/** LibWrappers are initialized on 'init' hook.  (can also work on 'ready' hook) See ss-initialize.js */
  
/** The Scene Scroller module will wait until a token animation finishes before updating the scene to represent the
 *  new sub-scene the token has landed on.
 */
