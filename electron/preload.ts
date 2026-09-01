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

  // Floating quick-command HUD
  hudHide: () => ipcRenderer.invoke("jarvis:hud-hide"),
  hudResize: (height: number) => ipcRenderer.invoke("jarvis:hud-resize", height),
  hudOpenMain: () => ipcRenderer.invoke("jarvis:hud-open-main"),
  hudInfo: () => ipcRenderer.invoke("jarvis:hud-info"),

  /** Fires each time the overlay is revealed, so it can reset and refocus. */
  onHudShown: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on("jarvis:hud-shown", handler);
    return () => {
      ipcRenderer.removeListener("jarvis:hud-shown", handler);
    };
  },

  /** Fires when the overlay is dismissed, so it can clear transient state. */
  onHudHidden: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on("jarvis:hud-hidden", handler);
    return () => {
      ipcRenderer.removeListener("jarvis:hud-hidden", handler);
    };
  },
});
