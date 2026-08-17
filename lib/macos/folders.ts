/**
 * macOS Folder Opening
 * Strictly allowlisted user folders only. Arbitrary filesystem paths are
 * rejected: no `..`, no absolute paths, no system directories, no hidden
 * directories. Paths are always resolved internally from the user's home.
 *
 * Note: This module uses child_process which is Node.js-only.
 * It cannot be used in browser/client code.
 */

import { homedir } from "os";
import path from "path";

import type { FolderOpenResult } from "./types";

// Lazy-load child_process only when needed (server-side)
let execSync: typeof import("child_process").execSync | null = null;

function getExecSync() {
  if (execSync === null) {
    try {
      execSync = require("child_process").execSync;
    } catch (error) {
      return null;
    }
  }
  return execSync;
}

function isMacOS(): boolean {
  return process.platform === "darwin";
}

/**
 * Allowlist of user folders that JARVIS may open.
 * Key → fixed subdirectory under the user's home directory.
 */
export const FOLDER_ALLOWLIST: Record<string, string> = {
  downloads: "Downloads",
  documents: "Documents",
  desktop: "Desktop",
  pictures: "Pictures",
  movies: "Movies",
  music: "Music",
};

export type FolderResolution =
  | { valid: true; name: string; path: string }
  | { valid: false; error: string };

/**
 * Resolve a folder name to a safe absolute path.
 * Only allowlisted names are accepted; anything else (traversal, absolute
 * paths, system dirs, hidden dirs) is rejected.
 */
export function resolveFolderPath(folderName: string): FolderResolution {
  const key = folderName.trim().toLowerCase();
  const folder = FOLDER_ALLOWLIST[key];
  if (!folder) {
    return {
      valid: false,
      error: `Folder '${folderName}' is not in the approved allowlist`,
    };
  }
  return { valid: true, name: folder, path: path.join(/* turbopackIgnore: true */ homedir(), folder) };
}

/**
 * Open an allowlisted user folder in Finder.
 * The path is derived internally from the allowlist; the model can never
 * supply a filesystem path.
 */
export function openFolder(folderName: string): FolderOpenResult {
  const resolved = resolveFolderPath(folderName);
  if (!resolved.valid) {
    return { success: false, folder: folderName, message: resolved.error };
  }

  if (!isMacOS()) {
    return {
      success: false,
      folder: resolved.name,
      message: "Folder opening only available on macOS",
    };
  }

  try {
    const exec = getExecSync();
    if (!exec) {
      return {
        success: false,
        folder: resolved.name,
        message: "Unable to open folders: child_process not available",
      };
    }

    exec(`open "${resolved.path}"`, { timeout: 5000, stdio: ["pipe", "pipe", "pipe"] });
    return {
      success: true,
      folder: resolved.name,
      path: resolved.path,
      message: `Opened your ${resolved.name} folder`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { success: false, folder: resolved.name, message: `Failed to open folder: ${message}` };
  }
}
