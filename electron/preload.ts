/**
 * JARVIS v1.0 — Electron Preload Script
 *
 * Exposes safe IPC methods to the renderer process.
 * No Node.js APIs are exposed directly to the renderer.
 */

import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("jarvis", {
  getStatus: () => ipcRenderer.invoke("jarvis:get-status"),
  restart: () => ipcRenderer.invoke("jarvis:restart"),
  openUI: () => ipcRenderer.invoke("jarvis:open-ui"),

  // Native voice control
  voiceStart: () => ipcRenderer.invoke("jarvis:voice-start"),
  voiceStop: () => ipcRenderer.invoke("jarvis:voice-stop"),
  voiceAvailable: () => ipcRenderer.invoke("jarvis:voice-available"),

  // Native voice events (main → renderer)
  onVoiceEvent: (callback: (event: unknown) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: unknown) => callback(data);
    ipcRenderer.on("jarvis:voice-event", handler);
    return () => {
      ipcRenderer.removeListener("jarvis:voice-event", handler);
    };
  },
});
