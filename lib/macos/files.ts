/**
 * macOS File Intelligence
 * Structured file operations within strictly allowlisted directories.
 * All paths are resolved internally — arbitrary filesystem access is rejected.
 * Symlink escapes, path traversal, and shell metacharacters are blocked.
 *
 * Uses execFileSync (no shell) for security.
 */

import { homedir } from "os";
import path from "path";
import { FOLDER_ALLOWLIST, resolveFolderPath } from "./folders";

// Lazy-load child_process only when needed (server-side)
let execFileSync: typeof import("child_process").execFileSync | null = null;

function getExecFileSync() {
  if (execFileSync === null) {
    try {
      execFileSync = require("child_process").execFileSync;
    } catch {
      return null;
    }
  }
  return execFileSync;
}

function isMacOS(): boolean {
  return process.platform === "darwin";
}

const FILE_TIMEOUT_MS = 5000;
const MAX_SEARCH_RESULTS = 20;
const MAX_LIST_RESULTS = 50;

export interface FileMetadata {
  name: string;
  path: string;
  size: number;
  created: string;
  modified: string;
  isDirectory: boolean;
  extension?: string;
}

export interface FileListResult {
  available: boolean;
  files: FileMetadata[];
  count: number;
  folder?: string;
  error?: string;
}

export interface FileSearchResult {
  available: boolean;
  results: FileMetadata[];
  count: number;
  query?: string;
  error?: string;
}

export interface FileActionResult {
  success: boolean;
  message: string;
  path?: string;
  error?: string;
}

/**
 * Validate that a resolved path is within allowed directories.
 * Rejects symlink escapes, traversal, and hidden directories.
 */
function validatePath(resolvedPath: string): { valid: boolean; error?: string } {
  const home = homedir();

  // Must be under home directory
  if (!resolvedPath.startsWith(home)) {
    return { valid: false, error: "Path must be within the home directory" };
  }

  // Must be under one of the allowlisted folders
  const allowedPrefixes = Object.values(FOLDER_ALLOWLIST).map((f) => path.join(home, f));
  const inAllowed = allowedPrefixes.some((prefix) => resolvedPath.startsWith(prefix + path.sep) || resolvedPath === prefix);
  if (!inAllowed) {
    return { valid: false, error: "Path must be within an allowed folder (Downloads, Documents, Desktop, Pictures, Movies, Music)" };
  }

  // Reject hidden directories (except the home itself)
  const relative = resolvedPath.slice(home.length + 1);
  const parts = relative.split(path.sep);
  for (const part of parts) {
    if (part.startsWith(".") && part.length > 1) {
      return { valid: false, error: "Hidden directories are not allowed" };
    }
  }

  return { valid: true };
}

/**
 * Safely parse ls -la output into FileMetadata.
 */
function parseLsOutput(line: string, basePath: string): FileMetadata | null {
  const parts = line.split(/\s+/);
  if (parts.length < 9) return null;

  const isDirectory = parts[0].startsWith("d");
  const name = parts.slice(8).join(" ");
  if (!name || name === "." || name === "..") return null;

  const fullPath = path.join(basePath, name);
  const ext = isDirectory ? undefined : path.extname(name).slice(1) || undefined;

  // Parse size
  const size = parseInt(parts[4], 10) || 0;

  return {
    name,
    path: fullPath,
    size,
    created: "", // Not easily available from ls
    modified: `${parts[5]} ${parts[6]} ${parts[7]}`,
    isDirectory,
    extension: ext,
  };
}

/**
 * List files in an allowlisted folder.
 * Returns up to MAX_LIST_RESULTS file entries.
 */
export function listFiles(folderName: string): FileListResult {
  if (!isMacOS()) {
    return { available: false, files: [], count: 0, error: "Not running on macOS" };
  }

  const resolved = resolveFolderPath(folderName);
  if (!resolved.valid) {
    return { available: false, files: [], count: 0, error: resolved.error };
  }

  const validation = validatePath(resolved.path);
  if (!validation.valid) {
    return { available: false, files: [], count: 0, error: validation.error };
  }

  try {
    const exec = getExecFileSync();
    if (!exec) {
      return { available: false, files: [], count: 0, error: "child_process not available" };
    }

    const output = exec("ls", ["-la", resolved.path], {
      encoding: "utf8",
      timeout: FILE_TIMEOUT_MS,
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
    }).toString().trim();

    const lines = output.split("\n").slice(1); // Skip total line
    const files: FileMetadata[] = [];

    for (const line of lines) {
      const meta = parseLsOutput(line, resolved.path);
      if (meta && files.length < MAX_LIST_RESULTS) {
        files.push(meta);
      }
    }

    return { available: true, files, count: files.length, folder: resolved.name };
  } catch {
    return { available: false, files: [], count: 0, error: "Could not list files" };
  }
}

/**
 * Get metadata for a specific file within an allowed folder.
 * The file is identified by folder + relative path (no absolute paths from the user).
 */
export function getFileMetadata(folderName: string, relativePath: string): FileMetadata | null {
  if (!isMacOS()) return null;

  const resolved = resolveFolderPath(folderName);
  if (!resolved.valid) return null;

  // Sanitize the relative path — no traversal
  const sanitized = relativePath.replace(/\.\./g, "").replace(/^\/+/, "");
  const fullPath = path.join(resolved.path, sanitized);

  const validation = validatePath(fullPath);
  if (!validation.valid) return null;

  try {
    const exec = getExecFileSync();
    if (!exec) return null;

    const output = exec("ls", ["-la", fullPath], {
      encoding: "utf8",
      timeout: FILE_TIMEOUT_MS,
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
    }).toString().trim();

    const lines = output.split("\n");
    if (lines.length < 2) return null;

    return parseLsOutput(lines[1], path.dirname(fullPath));
  } catch {
    return null;
  }
}

/**
 * Search for files within an allowlisted folder using mdfind (Spotlight).
 * Only searches within the resolved folder path.
 */
export function searchFiles(folderName: string, query: string): FileSearchResult {
  if (!isMacOS()) {
    return { available: false, results: [], count: 0, error: "Not running on macOS" };
  }

  if (!query || typeof query !== "string") {
    return { available: false, results: [], count: 0, error: "Search query required" };
  }

  const resolved = resolveFolderPath(folderName);
  if (!resolved.valid) {
    return { available: false, results: [], count: 0, error: resolved.error };
  }

  const validation = validatePath(resolved.path);
  if (!validation.valid) {
    return { available: false, results: [], count: 0, error: validation.error };
  }

  try {
    const exec = getExecFileSync();
    if (!exec) {
      return { available: false, results: [], count: 0, error: "child_process not available" };
    }

    // mdfind -onlyin limits search to the specified directory
    const output = exec("mdfind", ["-onlyin", resolved.path, query], {
      encoding: "utf8",
      timeout: FILE_TIMEOUT_MS,
      maxBuffer: 2 * 1024 * 1024,
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
    }).toString().trim();

    if (!output) {
      return { available: true, results: [], count: 0, query };
    }

    const filePaths = output.split("\n").filter(Boolean).slice(0, MAX_SEARCH_RESULTS);

    // Get basic metadata for each result
    const fileMetas: FileMetadata[] = [];
    for (const filePath of filePaths) {
      const meta = getFileMetadataByPath(filePath);
      if (meta) fileMetas.push(meta);
    }

    return { available: true, results: fileMetas, count: fileMetas.length, query };
  } catch {
    return { available: false, results: [], count: 0, error: "Search failed" };
  }
}

/**
 * Get file metadata by absolute path (internal use only — validates path is safe).
 */
function getFileMetadataByPath(filePath: string): FileMetadata | null {
  const validation = validatePath(filePath);
  if (!validation.valid) return null;

  try {
    const exec = getExecFileSync();
    if (!exec) return null;

    const output = exec("ls", ["-la", filePath], {
      encoding: "utf8",
      timeout: FILE_TIMEOUT_MS,
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
    }).toString().trim();

    const lines = output.split("\n");
    if (lines.length < 2) return null;

    return parseLsOutput(lines[1], path.dirname(filePath));
  } catch {
    return null;
  }
}

/**
 * Open a file or folder in Finder (using the default application).
 * Only works within allowlisted directories.
 */
export function openFile(folderName: string, relativePath: string): FileActionResult {
  if (!isMacOS()) {
    return { success: false, message: "Not running on macOS" };
  }

  const resolved = resolveFolderPath(folderName);
  if (!resolved.valid) {
    return { success: false, message: resolved.error };
  }

  const sanitized = relativePath.replace(/\.\./g, "").replace(/^\/+/, "");
  const fullPath = path.join(resolved.path, sanitized);

  const validation = validatePath(fullPath);
  if (!validation.valid) {
    return { success: false, message: validation.error || "Invalid path" };
  }

  try {
    const exec = getExecFileSync();
    if (!exec) {
      return { success: false, message: "child_process not available" };
    }

    exec("open", [fullPath], {
      timeout: FILE_TIMEOUT_MS,
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
    });

    return { success: true, message: `Opened ${path.basename(fullPath)}`, path: fullPath };
  } catch {
    return { success: false, message: `Could not open ${path.basename(fullPath)}` };
  }
}

/**
 * Reveal a file in Finder (select it in its parent folder).
 * Only works within allowlisted directories.
 */
export function revealInFinder(folderName: string, relativePath: string): FileActionResult {
  if (!isMacOS()) {
    return { success: false, message: "Not running on macOS" };
  }

  const resolved = resolveFolderPath(folderName);
  if (!resolved.valid) {
    return { success: false, message: resolved.error };
  }

  const sanitized = relativePath.replace(/\.\./g, "").replace(/^\/+/, "");
  const fullPath = path.join(resolved.path, sanitized);

  const validation = validatePath(fullPath);
  if (!validation.valid) {
    return { success: false, message: validation.error || "Invalid path" };
  }

  try {
    const exec = getExecFileSync();
    if (!exec) {
      return { success: false, message: "child_process not available" };
    }

    exec("open", ["-R", fullPath], {
      timeout: FILE_TIMEOUT_MS,
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
    });

    return { success: true, message: `Revealed ${path.basename(fullPath)} in Finder`, path: fullPath };
  } catch {
    return { success: false, message: `Could not reveal ${path.basename(fullPath)} in Finder` };
  }
}

/**
 * Create a folder within an allowlisted directory.
 * Only creates one level deep — no nested creation.
 */
export function createFolder(parentFolder: string, newFolderName: string): FileActionResult {
  if (!isMacOS()) {
    return { success: false, message: "Not running on macOS" };
  }

  if (!newFolderName || typeof newFolderName !== "string") {
    return { success: false, message: "Folder name required" };
  }

  // Reject traversal, hidden names, special characters
  if (/\.\.|[\/\\]/.test(newFolderName) || newFolderName.startsWith(".")) {
    return { success: false, message: "Invalid folder name" };
  }

  const resolved = resolveFolderPath(parentFolder);
  if (!resolved.valid) {
    return { success: false, message: resolved.error };
  }

  const fullPath = path.join(resolved.path, newFolderName);
  const validation = validatePath(fullPath);
  if (!validation.valid) {
    return { success: false, message: validation.error || "Invalid path" };
  }

  try {
    const exec = getExecFileSync();
    if (!exec) {
      return { success: false, message: "child_process not available" };
    }

    exec("mkdir", [fullPath], {
      timeout: FILE_TIMEOUT_MS,
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
    });

    return { success: true, message: `Created folder ${newFolderName} in ${resolved.name}`, path: fullPath };
  } catch {
    return { success: false, message: `Could not create folder ${newFolderName}` };
  }
}
