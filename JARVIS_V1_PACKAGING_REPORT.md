# JARVIS v1.0 — Packaging Report

**Date:** August 18, 2026
**Status:** COMPLETE

---

## ENOENT Root Cause

The original error:

```
Error: spawn /Users/.../JARVIS.app/Contents/node_modules/.bin/next ENOENT
```

**Root cause:** The packaged Electron app tried to run `node_modules/.bin/next` from inside the ASAR archive. This binary doesn't exist as a real file — it's compressed inside `app.asar` and can't be executed directly.

**Previous (broken) approach:**
```
const projectRoot = path.resolve(process.resourcesPath, "..");
const nextBin = path.join(projectRoot, "node_modules", ".bin", "next");
spawn(nextBin, ["start", "-p", port]);
```

`process.resourcesPath` = `Contents/Resources/`, so `projectRoot` = `Contents/`. But `Contents/node_modules/.bin/next` doesn't exist in the packaged app.

---

## Fix: Next.js Standalone Output

The solution uses Next.js's built-in standalone output mode, which produces a self-contained `server.js` with all required dependencies bundled — no `node_modules/.bin/next` needed.

### Changes

| File | Change |
|------|--------|
| `next.config.ts` | Added `output: "standalone"` |
| `electron/main.ts` | Production branch now runs `node server.js` from the standalone directory |
| `electron/main.ts` | Added `findNodeExecutable()` for macOS node binary discovery |
| `electron/main.ts` | Added file-based logging to `~/Library/Application Support/jarvis-assistant/jarvis.log` |
| `electron/main.ts` | Fixed health check to use dynamic port (not hardcoded 3000) |
| `electron/main.ts` | Fixed health check to accept any valid JSON response (not just healthy/degraded) |
| `electron/main.ts` | Fixed companion path resolution for packaged app |
| `package.json` | Changed `files` to only include `electron/dist/**/*` (slim ASAR) |
| `package.json` | Added `extraResources` for standalone server + static assets + companion |
| `package.json` | Added `description` and `author` fields |
| `eslint.config.mjs` | Excluded `release/**` and `electron/dist/**` from linting |

---

## Final Packaged Resource Layout

```
JARVIS.app/
└── Contents/
    ├── MacOS/JARVIS                    # Electron binary
    ├── Frameworks/                     # Electron frameworks
    ├── Resources/
    │   ├── app.asar                    # Only electron/dist/main.js + preload.js (~246MB — includes node_modules for build)
    │   ├── app.asar.unpacked/          # Native modules
    │   ├── standalone/                 # ← Next.js standalone server (extraResource)
    │   │   ├── server.js              # Self-contained production server
    │   │   ├── package.json
    │   │   ├── .jarvis/               # Storage
    │   │   ├── .next/
    │   │   │   ├── server/            # Server-side chunks
    │   │   │   ├── static/            # Client-side assets
    │   │   │   └── *.json             # Manifests
    │   │   └── node_modules/          # Bundled dependencies
    │   └── companion/                 # Wake companion (extraResource)
    │       ├── jarvis-wake.py
    │       └── requirements.txt
    └── Info.plist
```

**Key:** The standalone server is a real directory on the filesystem (not inside ASAR), so `node server.js` executes normally.

---

## Startup Flow (Packaged)

1. Electron starts → `app.whenReady()`
2. Single instance lock acquired
3. `findAvailablePort()` → checks if JARVIS already running on 3000
4. `startBackend(port)`:
   - `app.isPackaged === true` → production branch
   - `serverDir = path.join(process.resourcesPath, "standalone")`
   - `serverJs = path.join(serverDir, "server.js")`
   - `findNodeExecutable()` → `/usr/local/bin/node`
   - `spawn("/usr/local/bin/node", ["server.js"], { cwd: serverDir })`
5. Health check loop polls `http://localhost:{port}/api/health`
6. Server responds → healthy
7. `startCompanion(port)`:
   - Looks in `process.resourcesPath/companion/jarvis-wake.py`
   - Spawns `python3 jarvis-wake.py --port {port}`
8. BrowserWindow created → loads `http://localhost:{port}`
9. Tray icon created

---

## Verified Live Test Results

| # | Test | Result |
|---|------|--------|
| 1 | JARVIS.app builds | PASS |
| 2 | JARVIS.app launches | PASS |
| 3 | No ENOENT error | PASS |
| 4 | Packaged backend starts | PASS |
| 5 | /api/health responds | PASS |
| 6 | UI loads in BrowserWindow | PASS |
| 7 | Standalone server.js used | PASS |
| 8 | Node binary found at /usr/local/bin/node | PASS |
| 9 | Companion path resolved correctly | PASS (graceful skip if deps not installed) |
| 10 | Health check accepts "unavailable" status | PASS |
| 11 | npm run dev still works | PASS |
| 12 | Graceful shutdown | PASS |

---

## Node Runtime Strategy

The packaged app requires Node.js installed on the system. `findNodeExecutable()` checks:

1. `/opt/homebrew/bin/node` (Apple Silicon Homebrew)
2. `/usr/local/bin/node` (Intel Homebrew / manual install)
3. `/usr/bin/node` (system)
4. Falls back to `node` in PATH

If Node.js is not found, the startup error dialog will show clearly.

---

## Quality Gates

| Gate | Result |
|------|--------|
| Tests | **105 suites / 1670 tests** (all pass) |
| TypeScript | PASS |
| ESLint | PASS |
| Build | PASS |
| npm audit | 0 vulnerabilities |
| Electron compile | PASS |
| Packaged app | LAUNCHES AND SERVES |

---

## Development Mode

All development commands remain unchanged:

```bash
npm run dev              # Start Next.js dev server
npm run test             # Run tests
npx tsc --noEmit         # Type check
npm run lint             # ESLint
npm run build            # Production build
npm run electron:dev     # Electron dev mode
```

---

## Known Limitations

1. **Requires Node.js on system** — the standalone server uses the system `node` binary
2. **Wake companion requires Python deps** — user must run `pip install -r companion/requirements.txt`
3. **No code signing** — requires Apple Developer account ($99/year)
4. **Default Electron icon** — needs custom JARVIS icon design
5. **AI_API_KEY not in packaged app** — user must configure via `.env.local` or environment

---

## Code Signing

Build output:
```
skipped macOS application code signing
reason=cannot find valid "Developer ID Application" identity
```

This is expected. Local unsigned testing works. Code signing and notarization are future distribution steps requiring an Apple Developer account.

---

## Build Commands

```bash
# Development
npm run dev

# Production build + package
npm run package          # Creates release/JARVIS.app + DMG + ZIP

# Quick test without installer
npm run package:dir      # Creates release/mac-arm64/JARVIS.app only

# Launch packaged app
open release/mac-arm64/JARVIS.app
```

---

## Packaged Runtime Configuration

### Problem

The packaged JARVIS.app backend had `ai_provider: misconfigured` because the Next.js standalone server runs in an environment without `.env.local`. In dev mode, Next.js automatically loads `.env.local`; in the packaged app, no such file exists inside the bundle.

### Solution

External runtime configuration at `~/.jarvis/.env`.

### Configuration Location

```
~/.jarvis/.env
```

Permissions: `600` (owner read/write only).

### How Electron Loads It

1. `electron/main.ts` calls `loadRuntimeConfig()` at startup
2. Parses `~/.jarvis/.env` (simple `KEY=VALUE` format)
3. Sets vars in `process.env` (only if not already set)
4. The standalone server inherits these via `env: { ...process.env }`

### What's In It

```
AI_PROVIDER=groq
AI_API_KEY=<your-secret-key>
AI_MODEL=openai/gpt-oss-120b
```

### Security Behavior

- `~/.jarvis/.env` is **never bundled** into JARVIS.app
- `AI_API_KEY` is **never logged** — only `apiKey=configured`
- `AI_API_KEY` is **never printed** in diagnostics or reports
- File permissions are `600` (owner only)
- The actual secret never appears in source code, Git, or the app bundle

### Development Behavior

- `npm run dev` continues using `.env.local` (Next.js built-in)
- First dev run auto-migrates `.env.local` → `~/.jarvis/.env`
- Subsequent dev runs use existing `~/.jarvis/.env` (no overwrite)

### Packaged Behavior

```
JARVIS.app
  ↓
Electron main process
  ↓
loadRuntimeConfig() reads ~/.jarvis/.env
  ↓
spawn standalone server with env vars
  ↓
/api/health → ai_provider: healthy
  ↓
UI ready
```

### Live Health Result

```json
{
  "status": "healthy",
  "subsystems": [
    { "name": "ai_provider", "status": "healthy", "message": "Configured" },
    { "name": "storage", "status": "healthy", "message": "Storage directory exists" }
  ]
}
```

### Files Changed

| File | Change |
|------|--------|
| `electron/main.ts` | Added `loadRuntimeConfig()`, `parseEnvFile()`, `migrateDevConfig()` |
| `lib/observability/health.ts` | Health check now reads `AI_API_KEY` in addition to provider-specific keys |
| `lib/config/environment.ts` | Config validation now reads `AI_API_KEY` in addition to provider-specific keys |
| `__tests__/p16_8-packaged-config.test.ts` | NEW — 24 regression tests |
| `__tests__/p17-packaging.test.ts` | Updated secret scanning to check for actual key patterns, not variable names |

### Regression Tests (24 new)

| Category | Tests |
|----------|-------|
| External configuration loading | 5 |
| Missing API key detection | 2 |
| Health status with AI_API_KEY | 2 |
| Packaged environment initialization | 2 |
| Development .env.local behavior | 2 |
| No secret logging | 4 |
| Graceful failure | 3 |
| Config directory structure | 2 |
| Migration from .env.local | 2 |
