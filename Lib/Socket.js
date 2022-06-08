import * as utils from "./functions.js"
import { SocketModuleName, preventCanvasDraw } from "../ss-initialize.js"

/** A dictionary of actions.  Avoids typos and VS Code autocompletes, making it much easier to code. */
export const msgDict = {
    preventCanvasDrawTrue: "preventCanvasDrawTrue",
    preventCanvasDrawFalse: "preventCanvasDrawFalse",
    refreshAfterResize: "refreshAfterResize",
    vectorPanScene: "vectorPanScene",
    translatePlaceables: "translatePlaceables"
}

/** A wrapper function that will execute code on the GM client and then request the same code be executed by all clients.
 *  
 * @param {String}          requestID   - A string that will map to an object key to execute a function.
 * @param {any}             data        - Data to be passed to the function as arguments.
 * @return {void}
 */
export async function socketWrapper(requestID, data) {
    switch(requestID) {
        case msgDict.preventCanvasDrawTrue:
            preventCanvasDraw = true;
            game.socket.emit(SocketModuleName, {action: msgDict.preventCanvasDrawTrue});
            break;
        case msgDict.preventCanvasDrawFalse:
            preventCanvasDraw = false;
            game.socket.emit(SocketModuleName, {action: msgDict.preventCanvasDrawFalse});
            break;
        case msgDict.refreshAfterResize:
            utils.refreshSceneAfterResize(data);
            game.socket.emit(SocketModuleName, {action: msgDict.refreshAfterResize, data: data});
            break;
        case msgDict.vectorPanScene:
            utils.vectorPan(data);
            game.socket.emit(SocketModuleName, {action: msgDict.vectorPanScene, data: data});
            break;
        case msgDict.translatePlaceables:
            const {placeables, vector, save} = data;
            await SceneScroller.offsetPlaceables(placeables, vector, save);
            // code below causes errors.  Something about the data being recursive.  May need to rebuild the data on the client side.
            //game.socket.emit(SocketModuleName, {action: msgDict.translatePlaceables, data: data})
    }
}

/** When the socketWrapper function emits an action, the client(s) will process as defined below */
export async function message_handler(request) {
    switch (request.action) {
        case msgDict.preventCanvasDrawTrue:
            preventCanvasDraw = true;
            break;
        case msgDict.preventCanvasDrawFalse:
            preventCanvasDraw = false;
            break;
        case msgDict.refreshAfterResize: 
            utils.refreshSceneAfterResize(request.data);
            break;
        case msgDict.vectorPanScene:
            utils.vectorPan(request.data);
            break;
        case msgDict.translatePlaceables:
            const [placeables, vector, save] = request.data;
            await SceneScroller.offsetPlaceables(placeables, vector, save);
            break;
        default:
            utils.log(false, "Did not find action in message_handler() function.")
            utils.log(false, "Requested action: " + request.action) 
    }
}