import * as utils from "./Functions.js"
import { SceneScroller } from "./SceneScroller.js"
import { SocketModuleName } from "../ss-initialize.js"

export async function message_handler(request) {
    switch (request.action) {
        case msgDict.preventCanvasDrawTrue:
            SceneScroller.PreventCanvasDraw = true;
            break;
        case msgDict.preventCanvasDrawFalse:
            SceneScroller.PreventCanvasDraw = false;
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
            log(false, "Did not find action in message_handler() function.")
            log(false, "Requested action: " + request.action) 
    }
}

/** A dictionary of actions.  Avoids typos and is easier to reference when coding. */
export const msgDict = {
    preventCanvasDrawTrue: "preventCanvasDrawTrue",
    preventCanvasDrawFalse: "preventCanvasDrawFalse",
    refreshAfterResize: "refreshAfterResize",
    vectorPanScene: "vectorPanScene",
    translatePlaceables: "translatePlaceables"
}

/** A companion dictionary for socketWrapper() function.
 *  The selected function will execute for the GM client and then by the player clients via sockets.
 */
const socketDict = {
    [msgDict.preventCanvasDrawTrue]: () => {
        SceneScroller.PreventCanvasDraw = true;
        game.socket.emit(SocketModuleName, {action: msgDict.preventCanvasDrawTrue})
    },
    [msgDict.preventCanvasDrawFalse]: () => {
        SceneScroller.PreventCanvasDraw = false;
        game.socket.emit(SocketModuleName, {action: msgDict.preventCanvasDrawFalse})
    },
    [msgDict.refreshAfterResize]: (data) => {
        utils.refreshSceneAfterResize(data);
        game.socket.emit(SocketModuleName, {action: msgDict.refreshAfterResize, data: data})
    },
    [msgDict.vectorPanScene]: (data) => {
        utils.vectorPan(data);
        game.socket.emit(SocketModuleName, {action: msgDict.vectorPanScene, data: data})
    },
    [msgDict.translatePlaceables]: async (data) => {
        const {placeables, vector, save} = data;
        await SceneScroller.offsetPlaceables(placeables, vector, save);
        //game.socket.emit(SocketModuleName, {action: msgDict.translatePlaceables, data: data})
    }

}

/** A wrapper function that will execute code on the GM client and then request the same code be executed by all clients.
 *  
 * @param {String}          requestID   - A string that will map to an object key to execute a function.
 * @param {any}             data        - Data to be passed to the function as arguments.
 * @return {void}
 */
export async function socketWrapper(requestID, data) {
    const fn = socketDict[requestID];
    fn(data);
}