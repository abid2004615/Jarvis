"use strict";
/**
 * JARVIS v1.0 — Electron Preload Script
 *
 * Exposes safe IPC methods to the renderer process.
 * No Node.js APIs are exposed directly to the renderer.
 */
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
electron_1.contextBridge.exposeInMainWorld("jarvis", {
    getStatus: () => electron_1.ipcRenderer.invoke("jarvis:get-status"),
    restart: () => electron_1.ipcRenderer.invoke("jarvis:restart"),
    openUI: () => electron_1.ipcRenderer.invoke("jarvis:open-ui"),
});
//# sourceMappingURL=preload.js.map