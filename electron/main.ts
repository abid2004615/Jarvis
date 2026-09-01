/**
 * JARVIS v1.0 — Electron Main Process
 *
 * Thin native macOS wrapper around the existing Next.js application.
 * Manages: backend server, wake companion, browser window, tray, lifecycle.
 *
 * Zero changes to the existing JARVIS architecture.
 */

import {
  app,
  BrowserWindow,
  Menu,
  Tray,
  nativeImage,
  ipcMain,
  dialog,
  globalShortcut,
  screen,
} from "electron";
import * as path from "node:path";
import * as fs from "node:fs";
import * as os from "node:os";
import * as http from "node:http";
import { spawn, ChildProcess, execFile } from "node:child_process";

// ─── Constants ────────────────────────────────────────────────

const SERVER_PORT = 3000;
const HEALTH_CHECK_INTERVAL_MS = 5000;
const HEALTH_CHECK_TIMEOUT_MS = 5000;
const MAX_RESTART_ATTEMPTS = 3;
const RESTART_COOLDOWN_MS = 10000;
const GRACEFUL_SHUTDOWN_TIMEOUT_MS = 10000;

// ─── Floating HUD ─────────────────────────────────────────────

/** Spotlight-style quick command overlay. */
const HUD_SHORTCUT = "CommandOrControl+Shift+Space";
const HUD_WIDTH = 680;
/** Collapsed height: just the input row. The renderer grows it for answers. */
const HUD_MIN_HEIGHT = 88;
const HUD_MAX_HEIGHT = 460;
/** Fraction of the screen height the overlay sits at, matching Spotlight. */
const HUD_TOP_RATIO = 0.22;

// ─── Runtime Configuration ────────────────────────────────────

const JARVIS_CONFIG_DIR = path.join(os.homedir(), ".jarvis");
const JARVIS_ENV_FILE = path.join(JARVIS_CONFIG_DIR, ".env");

/**
 * Parse a simple .env file (KEY=VALUE, # comments, blank lines).
 * Never returns secret values in logs.
 */
function parseEnvFile(filePath: string): Record<string, string> {
  const result: Record<string, string> = {};
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    for (const raw of content.split("\n")) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const eqIdx = line.indexOf("=");
      if (eqIdx === -1) continue;
      const key = line.slice(0, eqIdx).trim();
      let value = line.slice(eqIdx + 1).trim();
      // Strip surrounding quotes
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (key) result[key] = value;
    }
  } catch {
    // File doesn't exist or can't be read — not an error at this stage
  }
  return result;
}

/**
 * Load runtime configuration from ~/.jarvis/.env into process.env.
 * Only sets vars that are not already set (env from shell takes precedence).
 * Never logs API key values.
 */
function loadRuntimeConfig(): void {
  const envVars = parseEnvFile(JARVIS_ENV_FILE);
  const keys = Object.keys(envVars);

  if (keys.length === 0) {
    log("info", "No external config found at ~/.jarvis/.env");
    return;
  }

  let loaded = 0;
  for (const [key, value] of Object.entries(envVars)) {
    if (!process.env[key]) {
      process.env[key] = value;
      loaded++;
    }
  }

  // Diagnostics: never log AI_API_KEY value
  const hasApiKey = Boolean(process.env.AI_API_KEY);
  const provider = process.env.AI_PROVIDER || "not set";
  const model = process.env.AI_MODEL || "not set";
  log("info", `Loaded external config: ${loaded} vars, provider=${provider}, model=${model}, apiKey=${hasApiKey ? "configured" : "missing"}`);
}

/**
 * One-time migration: if ~/.jarvis/.env doesn't exist but .env.local does
 * in the project root, copy the relevant vars across.
 * Never prints secret values.
 */
function migrateDevConfig(projectRoot: string): void {
  if (fs.existsSync(JARVIS_ENV_FILE)) return;

  const devEnvPath = path.join(projectRoot, ".env.local");
  if (!fs.existsSync(devEnvPath)) {
    log("info", "No .env.local found — skipping config migration");
    return;
  }

  const devVars = parseEnvFile(devEnvPath);
  const migrateKeys = ["AI_PROVIDER", "AI_API_KEY", "AI_MODEL", "AI_BASE_URL", "AI_TIMEOUT", "AI_MAX_RETRIES"];
  const lines: string[] = ["# JARVIS runtime configuration — migrated from .env.local", ""];

  for (const key of migrateKeys) {
    if (devVars[key]) {
      lines.push(`${key}=${devVars[key]}`);
    }
  }

  try {
    fs.mkdirSync(JARVIS_CONFIG_DIR, { recursive: true });
    fs.writeFileSync(JARVIS_ENV_FILE, lines.join("\n"), { mode: 0o600 });
    log("info", "Migrated config to ~/.jarvis/.env (API key transferred securely)");
  } catch (err) {
    log("warn", `Failed to migrate config: ${err}`);
  }
}

// ─── State ────────────────────────────────────────────────────

let mainWindow: BrowserWindow | null = null;
let hudWindow: BrowserWindow | null = null;
let hudShortcutRegistered = false;
let tray: Tray | null = null;
let backendProcess: ChildProcess | null = null;
let companionProcess: ChildProcess | null = null;
let voiceProcess: ChildProcess | null = null;
let healthCheckTimer: ReturnType<typeof setInterval> | null = null;
let restartAttempts = 0;
let lastRestartTime = 0;
let isQuitting = false;
let serverPort = SERVER_PORT;

// ─── Logging ──────────────────────────────────────────────────

const LOG_FILE = path.join(app.getPath("userData"), "jarvis.log");

function log(level: "info" | "warn" | "error", message: string): void {
  const timestamp = new Date().toISOString();
  const prefix = `[JARVIS ${level.toUpperCase()}]`;
  const line = `${timestamp} ${prefix} ${message}`;
  if (level === "error") {
    console.error(line);
  } else if (level === "warn") {
    console.warn(line);
  } else {
    console.log(line);
  }
  // Also write to file for packaged app diagnostics
  try {
    fs.appendFileSync(LOG_FILE, line + "\n");
  } catch {
    // cannot write log file — fail silently
  }
}

// ─── Port Management ──────────────────────────────────────────

function checkPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = http.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(port, "127.0.0.1");
  });
}

function checkExistingServer(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const url = `http://localhost:${port}/api/health`;
    const req = http.get(url, { timeout: HEALTH_CHECK_TIMEOUT_MS }, (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => {
        try {
          const data = JSON.parse(body);
          // Any JSON response means the server is running.
          // "unavailable" just means API key isn't configured — server still works.
          resolve(!!data.status);
        } catch {
          resolve(false);
        }
      });
    });
    req.on("error", () => resolve(false));
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function findAvailablePort(): Promise<number> {
  // First, check if JARVIS is already running
  if (await checkExistingServer(SERVER_PORT)) {
    log("info", `JARVIS backend already running on port ${SERVER_PORT}`);
    return SERVER_PORT;
  }

  // Check if port is free
  if (await checkPortAvailable(SERVER_PORT)) {
    return SERVER_PORT;
  }

  // Find next available port
  for (let port = SERVER_PORT + 1; port < SERVER_PORT + 100; port++) {
    if (await checkPortAvailable(port)) {
      log("info", `Port ${SERVER_PORT} busy, using port ${port}`);
      return port;
    }
  }

  throw new Error("No available port found");
}

// ─── Backend Process ───────────────────────────────────────────

function findNodeExecutable(): string {
  // In packaged app, node may not be in PATH.
  // Check common macOS install locations.
  const candidates = [
    "/opt/homebrew/bin/node",
    "/usr/local/bin/node",
    "/usr/bin/node",
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  // Fall back to PATH lookup
  return "node";
}

function startBackend(port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const isDev = !app.isPackaged;
    const projectRoot = isDev
      ? path.resolve(__dirname, "..")
      : path.resolve(process.resourcesPath, "..");

    log("info", `Starting backend on port ${port} (dev: ${isDev})`);

    const env = {
      ...process.env,
      PORT: String(port),
      NODE_ENV: (isDev ? "development" : "production") as "development" | "production",
    };

    let proc: ChildProcess;
    if (isDev) {
      // Development: run `npm run dev` with PORT override
      proc = spawn("npm", ["run", "dev", "--", "-p", String(port)], {
        cwd: projectRoot,
        env,
        stdio: ["ignore", "pipe", "pipe"],
        shell: true,
      });
    } else {
      // Production: run the standalone Next.js server
      // extraResources are placed at process.resourcesPath/<to>
      log("info", `Packaged mode. resourcesPath: ${process.resourcesPath}`);

      const serverDir = path.join(process.resourcesPath, "standalone");
      const serverJs = path.join(serverDir, "server.js");

      log("info", `Looking for server at: ${serverJs}`);
      log("info", `server.js exists: ${fs.existsSync(serverJs)}`);

      if (!fs.existsSync(serverJs)) {
        // List what IS in resourcesPath for debugging
        try {
          const entries = fs.readdirSync(process.resourcesPath);
          log("error", `Resources contents: ${entries.join(", ")}`);
        } catch { /* ignore */ }
        reject(new Error(`Standalone server not found at ${serverJs}. Run "npm run build && npm run package" first.`));
        return;
      }

      const nodeBin = findNodeExecutable();
      log("info", `Node.js binary: ${nodeBin}`);
      log("info", `Node.js exists: ${fs.existsSync(nodeBin)}`);

      proc = spawn(nodeBin, [serverJs], {
        cwd: serverDir,
        env,
        stdio: ["ignore", "pipe", "pipe"],
      });
    }

    backendProcess = proc;

    proc.stdout?.on("data", (data: Buffer) => {
      const msg = data.toString().trim();
      if (msg) log("info", `[backend] ${msg}`);
    });

    proc.stderr?.on("data", (data: Buffer) => {
      const msg = data.toString().trim();
      if (msg) log("warn", `[backend] ${msg}`);
    });

    proc.on("error", (err) => {
      log("error", `Backend process error: ${err.message}`);
      reject(err);
    });

    proc.on("exit", (code) => {
      log("warn", `Backend process exited with code ${code}`);
      backendProcess = null;
      if (!isQuitting) {
        handleBackendCrash(code);
      }
    });

    // Give the server a moment to start
    setTimeout(resolve, 1000);
  });
}

function stopBackend(): Promise<void> {
  return new Promise((resolve) => {
    if (!backendProcess || !backendProcess.pid) {
      resolve();
      return;
    }

    log("info", "Stopping backend...");

    const killTimeout = setTimeout(() => {
      log("warn", "Backend did not stop gracefully, force killing...");
      try {
        backendProcess?.kill("SIGKILL");
      } catch {
        // process already dead
      }
      resolve();
    }, GRACEFUL_SHUTDOWN_TIMEOUT_MS);

    backendProcess.once("exit", () => {
      clearTimeout(killTimeout);
      log("info", "Backend stopped");
      resolve();
    });

    try {
      backendProcess.kill("SIGTERM");
    } catch {
      clearTimeout(killTimeout);
      resolve();
    }
  });
}

// ─── Wake Companion Process ────────────────────────────────────

function startCompanion(port: number): Promise<void> {
  return new Promise((resolve) => {
    const isDev = !app.isPackaged;
    const projectRoot = isDev
      ? path.resolve(__dirname, "..")
      : path.resolve(process.resourcesPath, "..");

    // In packaged app, companion is in Resources/companion/
    // In dev, it's in project root/companion/
    const companionDir = isDev
      ? path.join(projectRoot, "companion")
      : path.join(process.resourcesPath, "companion");
    const companionScript = path.join(companionDir, "jarvis-wake.py");
    const modelPath = path.join(companionDir, "vosk-model-small-en-us-0.15");

    // Check if python3 and companion script exist
    if (!fs.existsSync(companionScript)) {
      log("warn", "Wake companion script not found, skipping");
      resolve();
      return;
    }

    log("info", "Starting wake companion...");

    companionProcess = spawn("python3", [
      companionScript,
      "--port", String(port),
      "--model-path", modelPath,
    ], {
      cwd: companionDir,
      stdio: ["ignore", "pipe", "pipe"],
    });

    companionProcess.stdout?.on("data", (data: Buffer) => {
      const msg = data.toString().trim();
      if (msg) log("info", `[companion] ${msg}`);
    });

    companionProcess.stderr?.on("data", (data: Buffer) => {
      const msg = data.toString().trim();
      if (msg) log("warn", `[companion] ${msg}`);
    });

    companionProcess.on("error", (err) => {
      log("warn", `Companion process error: ${err.message}`);
    });

    companionProcess.on("exit", (code) => {
      log("warn", `Companion process exited with code ${code}`);
      companionProcess = null;
      if (!isQuitting) {
        log("warn", "Wake companion stopped — voice commands still available");
        updateTrayMenu();
      }
    });

    // Give companion a moment to start
    setTimeout(resolve, 1500);
  });
}

function stopCompanion(): Promise<void> {
  return new Promise((resolve) => {
    if (!companionProcess || !companionProcess.pid) {
      resolve();
      return;
    }

    log("info", "Stopping wake companion...");

    const killTimeout = setTimeout(() => {
      try {
        companionProcess?.kill("SIGKILL");
      } catch {
        // already dead
      }
      resolve();
    }, 5000);

    companionProcess.once("exit", () => {
      clearTimeout(killTimeout);
      log("info", "Wake companion stopped");
      resolve();
    });

    try {
      companionProcess.kill("SIGTERM");
    } catch {
      clearTimeout(killTimeout);
      resolve();
    }
  });
}

// ─── Native Voice Process ──────────────────────────────────────

const VOICE_MAX_RESTART_ATTEMPTS = 3;
let voiceRestartAttempts = 0;
let voiceListening = false;

function startVoice(port: number): Promise<void> {
  return new Promise((resolve) => {
    const isDev = !app.isPackaged;
    const projectRoot = isDev
      ? path.resolve(__dirname, "..")
      : path.resolve(process.resourcesPath, "..");

    const companionDir = isDev
      ? path.join(projectRoot, "companion")
      : path.join(process.resourcesPath, "companion");
    const voiceScript = path.join(companionDir, "jarvis-voice.py");
    const modelPath = path.join(companionDir, "vosk-model-small-en-us-0.15");

    if (!fs.existsSync(voiceScript)) {
      log("info", "Voice companion script not found, native voice unavailable");
      resolve();
      return;
    }

    log("info", "Starting native voice companion...");

    const proc = spawn("python3", [
      voiceScript,
      "--port", String(port),
      "--model-path", modelPath,
    ], {
      cwd: companionDir,
      stdio: ["pipe", "pipe", "pipe"],
    });

    voiceProcess = proc;
    voiceRestartAttempts = 0;

    // Parse JSON messages from stdout (one per line)
    let stdoutBuffer = "";
    proc.stdout?.on("data", (data: Buffer) => {
      stdoutBuffer += data.toString();
      const lines = stdoutBuffer.split("\n");
      stdoutBuffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const msg = JSON.parse(trimmed);
          handleVoiceMessage(msg);
        } catch {
          log("warn", `[voice] non-JSON: ${trimmed}`);
        }
      }
    });

    proc.stderr?.on("data", (data: Buffer) => {
      const msg = data.toString().trim();
      if (msg) log("info", `[voice] ${msg}`);
    });

    proc.on("error", (err) => {
      log("warn", `Voice process error: ${err.message}`);
      voiceProcess = null;
    });

    proc.on("exit", (code) => {
      log("warn", `Voice process exited with code ${code}`);
      voiceProcess = null;
      voiceListening = false;
      if (!isQuitting && voiceRestartAttempts < VOICE_MAX_RESTART_ATTEMPTS) {
        voiceRestartAttempts++;
        log("info", `Restarting voice process (${voiceRestartAttempts}/${VOICE_MAX_RESTART_ATTEMPTS})...`);
        setTimeout(() => {
          if (!isQuitting) {
            startVoice(port).catch(() => {});
          }
        }, 2000);
      }
      sendVoiceToRenderer({ type: "state", state: "idle" });
      updateTrayMenu();
    });

    setTimeout(resolve, 1500);
  });
}

function stopVoice(): Promise<void> {
  return new Promise((resolve) => {
    if (!voiceProcess || !voiceProcess.pid) {
      resolve();
      return;
    }

    log("info", "Stopping voice companion...");

    const killTimeout = setTimeout(() => {
      try {
        voiceProcess?.kill("SIGKILL");
      } catch { /* already dead */ }
      resolve();
    }, 5000);

    voiceProcess.once("exit", () => {
      clearTimeout(killTimeout);
      log("info", "Voice companion stopped");
      resolve();
    });

    try {
      // Send shutdown command first
      voiceProcess.stdin?.write(JSON.stringify({ command: "shutdown" }) + "\n");
      voiceProcess.kill("SIGTERM");
    } catch {
      clearTimeout(killTimeout);
      resolve();
    }
  });
}

function sendVoiceCommand(command: string): void {
  if (!voiceProcess || !voiceProcess.stdin) return;
  try {
    voiceProcess.stdin.write(JSON.stringify({ command }) + "\n");
  } catch {
    log("warn", "Failed to send voice command");
  }
}

function handleVoiceMessage(msg: Record<string, unknown>): void {
  const type = msg.type;
  if (type === "state") {
    const vState = msg.state as string;
    voiceListening = vState !== "idle";
    sendVoiceToRenderer({ type: "state", state: vState });
  } else if (type === "transcript") {
    const text = String(msg.text ?? "");
    const isFinal = Boolean(msg.isFinal);
    if (text) {
      sendVoiceToRenderer({ type: "transcript", text, isFinal });
    }
  } else if (type === "audio_level") {
    sendVoiceToRenderer({ type: "audio_level", level: msg.level ?? 0 });
  } else if (type === "error") {
    sendVoiceToRenderer({ type: "error", message: String(msg.message ?? "Voice error") });
  }
}

function sendVoiceToRenderer(msg: Record<string, unknown>): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("jarvis:voice-event", msg);
  }
}

// ─── Crash Recovery ────────────────────────────────────────────

function handleBackendCrash(code: number | null): void {
  if (isQuitting) return;

  const now = Date.now();
  if (now - lastRestartTime < RESTART_COOLDOWN_MS) {
    restartAttempts++;
  } else {
    restartAttempts = 1;
  }
  lastRestartTime = now;

  if (restartAttempts > MAX_RESTART_ATTEMPTS) {
    log("error", `Backend crashed ${restartAttempts} times. Stopping recovery.`);
    dialog.showErrorBox(
      "JARVIS Backend Crashed",
      `The JARVIS backend has crashed ${restartAttempts} times and cannot recover.\n\n` +
      `Please restart JARVIS manually.`,
    );
    updateTrayMenu();
    return;
  }

  log("info", `Backend crashed (code: ${code}). Restart attempt ${restartAttempts}/${MAX_RESTART_ATTEMPTS}...`);

  setTimeout(async () => {
    try {
      await startBackend(serverPort);
      log("info", "Backend recovered successfully");
    } catch (err) {
      log("error", `Backend recovery failed: ${err}`);
    }
    updateTrayMenu();
  }, RESTART_COOLDOWN_MS);
}

// ─── Health Check ──────────────────────────────────────────────

function startHealthCheck(): void {
  healthCheckTimer = setInterval(async () => {
    const healthy = await checkExistingServer(serverPort);
    if (!healthy && backendProcess && !isQuitting) {
      log("warn", "Health check failed — backend may be unhealthy");
    }
    updateTrayMenu();
  }, HEALTH_CHECK_INTERVAL_MS);
}

function stopHealthCheck(): void {
  if (healthCheckTimer) {
    clearInterval(healthCheckTimer);
    healthCheckTimer = null;
  }
}

// ─── Browser Window ────────────────────────────────────────────

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: "JARVIS",
    backgroundColor: "#000000",
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 16, y: 16 },
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
    show: false,
  });

  mainWindow.on("ready-to-show", () => {
    mainWindow?.show();
  });

  mainWindow.on("close", (e) => {
    if (!isQuitting) {
      e.preventDefault();
      mainWindow?.hide();
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function loadUI(): void {
  if (!mainWindow) return;

  const url = `http://localhost:${serverPort}`;
  log("info", `Loading UI from ${url}`);
  mainWindow.loadURL(url);
}

// ─── Floating HUD Window ───────────────────────────────────────

/**
 * Position the overlay horizontally centred and near the top of whichever
 * display currently holds the pointer, so it opens where the user is looking.
 */
function positionHud(win: BrowserWindow): void {
  const cursor = screen.getCursorScreenPoint();
  const { workArea } = screen.getDisplayNearestPoint(cursor);
  const [width, height] = win.getSize();

  win.setPosition(
    Math.round(workArea.x + (workArea.width - width) / 2),
    Math.round(workArea.y + workArea.height * HUD_TOP_RATIO),
    false,
  );
  void height;
}

/**
 * Create the frameless quick-command overlay. It is built once at startup and
 * then shown/hidden, so invoking the shortcut feels instant instead of paying
 * page load on every keypress.
 */
function createHudWindow(): void {
  hudWindow = new BrowserWindow({
    width: HUD_WIDTH,
    height: HUD_MIN_HEIGHT,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    // "panel" lets the overlay float above other apps, including fullscreen ones.
    type: "panel",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });

  hudWindow.setAlwaysOnTop(true, "screen-saver");
  hudWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  // Dismiss on focus loss, the same way Spotlight behaves. Skipped while
  // devtools are attached, otherwise the overlay closes as you inspect it.
  hudWindow.on("blur", () => {
    if (hudWindow?.webContents.isDevToolsOpened()) return;
    hideHud();
  });

  hudWindow.on("closed", () => {
    hudWindow = null;
  });

  const url = `http://localhost:${serverPort}/hud`;
  log("info", `Loading HUD from ${url}`);
  hudWindow.loadURL(url);
}

function showHud(): void {
  if (!hudWindow || hudWindow.isDestroyed()) return;

  // Collapse to the input-only height so each invocation starts clean.
  hudWindow.setBounds({ height: HUD_MIN_HEIGHT }, false);
  positionHud(hudWindow);
  hudWindow.show();
  hudWindow.focus();
  hudWindow.webContents.send("jarvis:hud-shown");
}

function hideHud(): void {
  if (!hudWindow || hudWindow.isDestroyed()) return;
  if (!hudWindow.isVisible()) return;
  hudWindow.hide();
  hudWindow.webContents.send("jarvis:hud-hidden");
}

function toggleHud(): void {
  if (!hudWindow || hudWindow.isDestroyed()) return;
  if (hudWindow.isVisible()) {
    hideHud();
  } else {
    showHud();
  }
}

/**
 * Bind the global shortcut. Registration fails when another app already owns
 * the combination; that is reported but never fatal, since the tray and main
 * window still provide access.
 */
function registerGlobalShortcuts(): void {
  try {
    hudShortcutRegistered = globalShortcut.register(HUD_SHORTCUT, toggleHud);
  } catch (err) {
    hudShortcutRegistered = false;
    log("warn", `Failed to register ${HUD_SHORTCUT}: ${err}`);
    return;
  }

  if (hudShortcutRegistered) {
    log("info", `Quick command shortcut registered: ${HUD_SHORTCUT}`);
  } else {
    log("warn", `${HUD_SHORTCUT} is already taken by another app — quick command unavailable`);
  }
}

// ─── System Tray ───────────────────────────────────────────────

/**
 * Load the menu bar icon. Marked as a macOS template image so the system
 * tints it for light, dark, and highlighted menu bars instead of us guessing.
 * Falls back to an empty image so a missing asset never blocks startup.
 */
function loadTrayIcon(): Electron.NativeImage {
  // getAppPath() resolves to the project root in dev and the app bundle when
  // packaged, so the same path works in both.
  const iconPath = path.join(app.getAppPath(), "assets", "trayTemplate.png");
  const icon = nativeImage.createFromPath(iconPath);

  if (icon.isEmpty()) {
    log("warn", `Tray icon missing or unreadable at ${iconPath}`);
    return icon;
  }

  icon.setTemplateImage(true);
  return icon;
}

function createTray(): void {
  tray = new Tray(loadTrayIcon());

  tray.setToolTip("JARVIS");
  tray.on("click", () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.focus();
      } else {
        mainWindow.show();
      }
    }
  });

  updateTrayMenu();
}

function updateTrayMenu(): void {
  if (!tray) return;

  const backendStatus = backendProcess ? "Running" : "Stopped";
  const companionStatus = companionProcess ? "Running" : "Disconnected";
  const voiceStatus = voiceProcess ? (voiceListening ? "Listening" : "Ready") : "Unavailable";

  const contextMenu = Menu.buildFromTemplate([
    { label: "JARVIS", enabled: false },
    { type: "separator" },
    {
      label: `Backend: ${backendStatus}`,
      enabled: false,
    },
    {
      label: `Wake: ${companionStatus}`,
      enabled: false,
    },
    {
      label: `Voice: ${voiceStatus}`,
      enabled: false,
    },
    { type: "separator" },
    {
      label: "Open JARVIS",
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      },
    },
    {
      label: "Quick Command",
      accelerator: hudShortcutRegistered ? HUD_SHORTCUT : undefined,
      click: () => showHud(),
    },
    {
      label: "Restart JARVIS",
      click: () => restartJARVIS(),
    },
    { type: "separator" },
    {
      label: "Quit JARVIS",
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);
}

// ─── IPC Handlers ──────────────────────────────────────────────

function registerIPC(): void {
  ipcMain.handle("jarvis:get-status", async () => {
    const healthy = await checkExistingServer(serverPort);
    return {
      backend: backendProcess ? "running" : "stopped",
      companion: companionProcess ? "running" : "stopped",
      voice: voiceProcess ? "running" : "stopped",
      healthy,
      port: serverPort,
    };
  });

  ipcMain.handle("jarvis:restart", async () => {
    await restartJARVIS();
    return { ok: true };
  });

  ipcMain.handle("jarvis:open-ui", () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  });

  // Voice IPC
  ipcMain.handle("jarvis:voice-start", () => {
    sendVoiceCommand("start");
    return { ok: true };
  });

  ipcMain.handle("jarvis:voice-stop", () => {
    sendVoiceCommand("stop");
    return { ok: true };
  });

  ipcMain.handle("jarvis:voice-available", () => {
    return { available: voiceProcess !== null };
  });

  // Floating HUD IPC
  ipcMain.handle("jarvis:hud-hide", () => {
    hideHud();
    return { ok: true };
  });

  /**
   * The renderer knows how tall its content is; the window has to be resized
   * from the main process. Clamped so a renderer bug cannot grow the overlay
   * to cover the screen.
   */
  ipcMain.handle("jarvis:hud-resize", (_event, rawHeight: unknown) => {
    if (!hudWindow || hudWindow.isDestroyed()) return { ok: false };

    const requested = typeof rawHeight === "number" && Number.isFinite(rawHeight) ? rawHeight : HUD_MIN_HEIGHT;
    const height = Math.round(Math.min(HUD_MAX_HEIGHT, Math.max(HUD_MIN_HEIGHT, requested)));

    const [, current] = hudWindow.getSize();
    if (current !== height) {
      hudWindow.setBounds({ height }, false);
    }
    return { ok: true, height };
  });

  /** Hand off from the overlay to the full window. */
  ipcMain.handle("jarvis:hud-open-main", () => {
    hideHud();
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
    return { ok: true };
  });

  ipcMain.handle("jarvis:hud-info", () => {
    return { shortcut: HUD_SHORTCUT, shortcutRegistered: hudShortcutRegistered };
  });
}

// ─── Restart ───────────────────────────────────────────────────

async function restartJARVIS(): Promise<void> {
  log("info", "Restarting JARVIS...");
  await stopVoice();
  await stopCompanion();
  await stopBackend();
  await startBackend(serverPort);
  await startCompanion(serverPort);
  await startVoice(serverPort);
  if (mainWindow) {
    loadUI();
  }
  if (hudWindow && !hudWindow.isDestroyed()) {
    hudWindow.reload();
  }
  updateTrayMenu();
}

// ─── Application Lifecycle ─────────────────────────────────────

async function initializeJARVIS(): Promise<void> {
  log("info", "JARVIS v1.0 — Starting...");

  try {
    // Load runtime configuration from ~/.jarvis/.env
    const isDev = !app.isPackaged;
    if (isDev) {
      // In dev mode, migrate .env.local → ~/.jarvis/.env if needed
      const projectRoot = path.resolve(__dirname, "..");
      migrateDevConfig(projectRoot);
    }
    loadRuntimeConfig();

    // Find available port
    serverPort = await findAvailablePort();
    log("info", `Using port ${serverPort}`);

    // Start backend
    await startBackend(serverPort);

    // Wait for backend to be healthy
    let healthy = false;
    for (let i = 0; i < 30; i++) {
      healthy = await checkExistingServer(serverPort);
      if (healthy) break;
      await new Promise((r) => setTimeout(r, 1000));
    }

    if (!healthy) {
      log("warn", "Backend did not become healthy within 30s, continuing anyway");
    }

    // Start companion
    await startCompanion(serverPort);

    // Start native voice
    await startVoice(serverPort);

    // Create window and load UI
    createWindow();
    loadUI();

    // Create the quick command overlay and bind its global shortcut
    createHudWindow();
    registerGlobalShortcuts();

    // Create tray
    createTray();

    // Start health monitoring
    startHealthCheck();

    // Register IPC
    registerIPC();

    log("info", "JARVIS v1.0 ready");
  } catch (err) {
    log("error", `Failed to start JARVIS: ${err}`);
    dialog.showErrorBox(
      "JARVIS Startup Error",
      `Failed to start JARVIS:\n${err}\n\nCheck the console for details.`,
    );
    app.quit();
  }
}

// ─── App Events ────────────────────────────────────────────────

// Single instance lock
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  log("warn", "Another JARVIS instance is already running. Quitting.");
  app.quit();
} else {
  app.on("second-instance", () => {
    log("info", "Second instance attempted — showing existing window");
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });

  app.whenReady().then(initializeJARVIS);

  app.on("window-all-closed", () => {
    // On macOS, keep running in tray
    if (process.platform !== "darwin") {
      app.quit();
    }
  });

  app.on("activate", () => {
    // macOS dock click — show window
    if (mainWindow) {
      mainWindow.show();
    }
  });

  app.on("before-quit", async () => {
    if (isQuitting) return;
    isQuitting = true;

    log("info", "JARVIS shutting down...");
    globalShortcut.unregisterAll();
    stopHealthCheck();
    await stopVoice();
    await stopCompanion();
    await stopBackend();
    log("info", "JARVIS stopped");
  });
}
