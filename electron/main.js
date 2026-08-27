"use strict";
/**
 * JARVIS v1.0 — Electron Main Process
 *
 * Thin native macOS wrapper around the existing Next.js application.
 * Manages: backend server, wake companion, browser window, tray, lifecycle.
 *
 * Zero changes to the existing JARVIS architecture.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const path = __importStar(require("node:path"));
const fs = __importStar(require("node:fs"));
const http = __importStar(require("node:http"));
const node_child_process_1 = require("node:child_process");
// ─── Constants ────────────────────────────────────────────────
const SERVER_PORT = 3000;
const HEALTH_CHECK_URL = `http://localhost:${SERVER_PORT}/api/health`;
const HEALTH_CHECK_INTERVAL_MS = 5000;
const HEALTH_CHECK_TIMEOUT_MS = 5000;
const MAX_RESTART_ATTEMPTS = 3;
const RESTART_COOLDOWN_MS = 10000;
const GRACEFUL_SHUTDOWN_TIMEOUT_MS = 10000;
// ─── State ────────────────────────────────────────────────────
let mainWindow = null;
let tray = null;
let backendProcess = null;
let companionProcess = null;
let healthCheckTimer = null;
let restartAttempts = 0;
let lastRestartTime = 0;
let isQuitting = false;
let serverPort = SERVER_PORT;
// ─── Logging ──────────────────────────────────────────────────
function log(level, message) {
    const timestamp = new Date().toISOString();
    const prefix = `[JARVIS ${level.toUpperCase()}]`;
    const line = `${timestamp} ${prefix} ${message}`;
    if (level === "error") {
        console.error(line);
    }
    else if (level === "warn") {
        console.warn(line);
    }
    else {
        console.log(line);
    }
}
// ─── Port Management ──────────────────────────────────────────
function checkPortAvailable(port) {
    return new Promise((resolve) => {
        const server = http.createServer();
        server.once("error", () => resolve(false));
        server.once("listening", () => {
            server.close(() => resolve(true));
        });
        server.listen(port, "127.0.0.1");
    });
}
function checkExistingServer(port) {
    return new Promise((resolve) => {
        const req = http.get(HEALTH_CHECK_URL, { timeout: HEALTH_CHECK_TIMEOUT_MS }, (res) => {
            let body = "";
            res.on("data", (chunk) => (body += chunk));
            res.on("end", () => {
                try {
                    const data = JSON.parse(body);
                    resolve(data.status === "healthy" || data.status === "degraded");
                }
                catch {
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
async function findAvailablePort() {
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
function startBackend(port) {
    return new Promise((resolve, reject) => {
        const isDev = !electron_1.app.isPackaged;
        const projectRoot = isDev
            ? path.resolve(__dirname, "..")
            : path.resolve(process.resourcesPath, "..");
        log("info", `Starting backend on port ${port} (dev: ${isDev})`);
        const env = {
            ...process.env,
            PORT: String(port),
            NODE_ENV: isDev ? "development" : "production",
        };
        if (isDev) {
            // Development: run `npm run dev` with PORT override
            backendProcess = (0, node_child_process_1.spawn)("npm", ["run", "dev", "--", "-p", String(port)], {
                cwd: projectRoot,
                env,
                stdio: ["ignore", "pipe", "pipe"],
                shell: true,
            });
        }
        else {
            // Production: run `next start` with PORT override
            const nextBin = path.join(projectRoot, "node_modules", ".bin", "next");
            backendProcess = (0, node_child_process_1.spawn)(nextBin, ["start", "-p", String(port)], {
                cwd: projectRoot,
                env,
                stdio: ["ignore", "pipe", "pipe"],
            });
        }
        backendProcess.stdout?.on("data", (data) => {
            const msg = data.toString().trim();
            if (msg)
                log("info", `[backend] ${msg}`);
        });
        backendProcess.stderr?.on("data", (data) => {
            const msg = data.toString().trim();
            if (msg)
                log("warn", `[backend] ${msg}`);
        });
        backendProcess.on("error", (err) => {
            log("error", `Backend process error: ${err.message}`);
            reject(err);
        });
        backendProcess.on("exit", (code) => {
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
function stopBackend() {
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
            }
            catch {
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
        }
        catch {
            clearTimeout(killTimeout);
            resolve();
        }
    });
}
// ─── Wake Companion Process ────────────────────────────────────
function startCompanion(port) {
    return new Promise((resolve) => {
        const isDev = !electron_1.app.isPackaged;
        const projectRoot = isDev
            ? path.resolve(__dirname, "..")
            : path.resolve(process.resourcesPath, "..");
        const companionScript = path.join(projectRoot, "companion", "jarvis-wake.py");
        const modelPath = path.join(projectRoot, "companion", "vosk-model-small-en-us-0.15");
        // Check if python3 and companion script exist
        if (!fs.existsSync(companionScript)) {
            log("warn", "Wake companion script not found, skipping");
            resolve();
            return;
        }
        log("info", "Starting wake companion...");
        companionProcess = (0, node_child_process_1.spawn)("python3", [
            companionScript,
            "--port", String(port),
            "--model-path", modelPath,
        ], {
            cwd: projectRoot,
            stdio: ["ignore", "pipe", "pipe"],
        });
        companionProcess.stdout?.on("data", (data) => {
            const msg = data.toString().trim();
            if (msg)
                log("info", `[companion] ${msg}`);
        });
        companionProcess.stderr?.on("data", (data) => {
            const msg = data.toString().trim();
            if (msg)
                log("warn", `[companion] ${msg}`);
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
function stopCompanion() {
    return new Promise((resolve) => {
        if (!companionProcess || !companionProcess.pid) {
            resolve();
            return;
        }
        log("info", "Stopping wake companion...");
        const killTimeout = setTimeout(() => {
            try {
                companionProcess?.kill("SIGKILL");
            }
            catch {
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
        }
        catch {
            clearTimeout(killTimeout);
            resolve();
        }
    });
}
// ─── Crash Recovery ────────────────────────────────────────────
function handleBackendCrash(code) {
    if (isQuitting)
        return;
    const now = Date.now();
    if (now - lastRestartTime < RESTART_COOLDOWN_MS) {
        restartAttempts++;
    }
    else {
        restartAttempts = 1;
    }
    lastRestartTime = now;
    if (restartAttempts > MAX_RESTART_ATTEMPTS) {
        log("error", `Backend crashed ${restartAttempts} times. Stopping recovery.`);
        electron_1.dialog.showErrorBox("JARVIS Backend Crashed", `The JARVIS backend has crashed ${restartAttempts} times and cannot recover.\n\n` +
            `Please restart JARVIS manually.`);
        updateTrayMenu();
        return;
    }
    log("info", `Backend crashed (code: ${code}). Restart attempt ${restartAttempts}/${MAX_RESTART_ATTEMPTS}...`);
    setTimeout(async () => {
        try {
            await startBackend(serverPort);
            log("info", "Backend recovered successfully");
        }
        catch (err) {
            log("error", `Backend recovery failed: ${err}`);
        }
        updateTrayMenu();
    }, RESTART_COOLDOWN_MS);
}
// ─── Health Check ──────────────────────────────────────────────
function startHealthCheck() {
    healthCheckTimer = setInterval(async () => {
        const healthy = await checkExistingServer(serverPort);
        if (!healthy && backendProcess && !isQuitting) {
            log("warn", "Health check failed — backend may be unhealthy");
        }
        updateTrayMenu();
    }, HEALTH_CHECK_INTERVAL_MS);
}
function stopHealthCheck() {
    if (healthCheckTimer) {
        clearInterval(healthCheckTimer);
        healthCheckTimer = null;
    }
}
// ─── Browser Window ────────────────────────────────────────────
function createWindow() {
    mainWindow = new electron_1.BrowserWindow({
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
function loadUI() {
    if (!mainWindow)
        return;
    const url = `http://localhost:${serverPort}`;
    log("info", `Loading UI from ${url}`);
    mainWindow.loadURL(url);
}
// ─── System Tray ───────────────────────────────────────────────
function createTray() {
    // Create a simple tray icon (16x16 black circle)
    const icon = electron_1.nativeImage.createEmpty();
    tray = new electron_1.Tray(icon);
    tray.setToolTip("JARVIS");
    tray.on("click", () => {
        if (mainWindow) {
            if (mainWindow.isVisible()) {
                mainWindow.focus();
            }
            else {
                mainWindow.show();
            }
        }
    });
    updateTrayMenu();
}
function updateTrayMenu() {
    if (!tray)
        return;
    const backendStatus = backendProcess ? "Running" : "Stopped";
    const companionStatus = companionProcess ? "Running" : "Disconnected";
    const contextMenu = electron_1.Menu.buildFromTemplate([
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
            label: "Restart JARVIS",
            click: () => restartJARVIS(),
        },
        { type: "separator" },
        {
            label: "Quit JARVIS",
            click: () => {
                isQuitting = true;
                electron_1.app.quit();
            },
        },
    ]);
    tray.setContextMenu(contextMenu);
}
// ─── IPC Handlers ──────────────────────────────────────────────
function registerIPC() {
    electron_1.ipcMain.handle("jarvis:get-status", async () => {
        const healthy = await checkExistingServer(serverPort);
        return {
            backend: backendProcess ? "running" : "stopped",
            companion: companionProcess ? "running" : "stopped",
            healthy,
            port: serverPort,
        };
    });
    electron_1.ipcMain.handle("jarvis:restart", async () => {
        await restartJARVIS();
        return { ok: true };
    });
    electron_1.ipcMain.handle("jarvis:open-ui", () => {
        if (mainWindow) {
            mainWindow.show();
            mainWindow.focus();
        }
    });
}
// ─── Restart ───────────────────────────────────────────────────
async function restartJARVIS() {
    log("info", "Restarting JARVIS...");
    await stopCompanion();
    await stopBackend();
    await startBackend(serverPort);
    await startCompanion(serverPort);
    if (mainWindow) {
        loadUI();
    }
    updateTrayMenu();
}
// ─── Application Lifecycle ─────────────────────────────────────
async function initializeJARVIS() {
    log("info", "JARVIS v1.0 — Starting...");
    try {
        // Find available port
        serverPort = await findAvailablePort();
        log("info", `Using port ${serverPort}`);
        // Start backend
        await startBackend(serverPort);
        // Wait for backend to be healthy
        let healthy = false;
        for (let i = 0; i < 30; i++) {
            healthy = await checkExistingServer(serverPort);
            if (healthy)
                break;
            await new Promise((r) => setTimeout(r, 1000));
        }
        if (!healthy) {
            log("warn", "Backend did not become healthy within 30s, continuing anyway");
        }
        // Start companion
        await startCompanion(serverPort);
        // Create window and load UI
        createWindow();
        loadUI();
        // Create tray
        createTray();
        // Start health monitoring
        startHealthCheck();
        // Register IPC
        registerIPC();
        log("info", "JARVIS v1.0 ready");
    }
    catch (err) {
        log("error", `Failed to start JARVIS: ${err}`);
        electron_1.dialog.showErrorBox("JARVIS Startup Error", `Failed to start JARVIS:\n${err}\n\nCheck the console for details.`);
        electron_1.app.quit();
    }
}
// ─── App Events ────────────────────────────────────────────────
// Single instance lock
const gotTheLock = electron_1.app.requestSingleInstanceLock();
if (!gotTheLock) {
    log("warn", "Another JARVIS instance is already running. Quitting.");
    electron_1.app.quit();
}
else {
    electron_1.app.on("second-instance", () => {
        log("info", "Second instance attempted — showing existing window");
        if (mainWindow) {
            if (mainWindow.isMinimized())
                mainWindow.restore();
            mainWindow.show();
            mainWindow.focus();
        }
    });
    electron_1.app.whenReady().then(initializeJARVIS);
    electron_1.app.on("window-all-closed", () => {
        // On macOS, keep running in tray
        if (process.platform !== "darwin") {
            electron_1.app.quit();
        }
    });
    electron_1.app.on("activate", () => {
        // macOS dock click — show window
        if (mainWindow) {
            mainWindow.show();
        }
    });
    electron_1.app.on("before-quit", async () => {
        if (isQuitting)
            return;
        isQuitting = true;
        log("info", "JARVIS shutting down...");
        stopHealthCheck();
        await stopCompanion();
        await stopBackend();
        log("info", "JARVIS stopped");
    });
}
//# sourceMappingURL=main.js.map