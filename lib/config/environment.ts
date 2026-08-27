/**
 * P15 — Environment Validation
 *
 * Startup validation layer. Checks all subsystems and reports status.
 * Never crashes the application — always degrades gracefully.
 */

import type {
  EnvironmentReport,
  EnvironmentStatus,
  SubsystemCheck,
  SubsystemName,
  JarvisConfig,
} from "./types";

/**
 * Read the current configuration from environment variables.
 * Never exposes API key values.
 */
export function getConfig(): JarvisConfig {
  const provider = process.env.AI_PROVIDER || "groq";
  const model = process.env.AI_MODEL || "openai/gpt-oss-120b";
  const testMode = process.env.NODE_ENV === "test";

  let hasApiKey = false;
  // Support unified AI_API_KEY or provider-specific keys
  if (process.env.AI_API_KEY) {
    hasApiKey = true;
  } else if (provider === "groq") {
    hasApiKey = Boolean(process.env.GROQ_API_KEY);
  } else if (provider === "openai") {
    hasApiKey = Boolean(process.env.OPENAI_API_KEY);
  } else if (provider === "xai") {
    hasApiKey = Boolean(process.env.XAI_API_KEY);
  } else if (provider === "anthropic") {
    hasApiKey = Boolean(process.env.ANTHROPIC_API_KEY);
  }

  return {
    provider,
    model,
    hasApiKey,
    testMode,
    nodeEnv: process.env.NODE_ENV || "development",
    aiTimeout: parseInt(process.env.AI_TIMEOUT || "30000", 10),
    aiMaxRetries: parseInt(process.env.AI_MAX_RETRIES || "3", 10),
    maxConversationHistory: 50,
    maxInputLength: 10000,
  };
}

/**
 * Check the AI provider subsystem.
 */
function checkAIProvider(): SubsystemCheck {
  const config = getConfig();
  if (!config.hasApiKey) {
    return {
      name: "ai_provider",
      status: "misconfigured",
      message: `${config.provider.toUpperCase()} API key not set. AI features unavailable.`,
      required: false,
    };
  }
  return {
    name: "ai_provider",
    status: "ready",
    message: `${config.provider} configured with model ${config.model}`,
    required: false,
  };
}

/**
 * Check the storage subsystem.
 */
function checkStorage(): SubsystemCheck {
  try {
    const fs = require("fs");
    const path = require("path");
    const os = require("os");

    // Check both possible storage locations
    const cwdDir = path.join(process.cwd(), ".jarvis");
    const homeDir = path.join(os.homedir(), ".jarvis");

    const cwdExists = fs.existsSync(cwdDir);
    const homeExists = fs.existsSync(homeDir);

    if (!cwdExists && !homeExists) {
      return {
        name: "storage",
        status: "degraded",
        message: "Storage directories will be created on first use",
        required: false,
      };
    }

    // Check write permissions
    const testDir = cwdExists ? cwdDir : homeDir;
    try {
      const testFile = path.join(testDir, ".write-test");
      fs.writeFileSync(testFile, "test", { flag: "a" });
      fs.unlinkSync(testFile);
    } catch {
      return {
        name: "storage",
        status: "misconfigured",
        message: "Storage directory is not writable",
        required: false,
      };
    }

    return {
      name: "storage",
      status: "ready",
      message: "Storage available",
      required: false,
    };
  } catch {
    return {
      name: "storage",
      status: "degraded",
      message: "Storage check failed",
      required: false,
    };
  }
}

/**
 * Check voice subsystem readiness.
 */
function checkVoice(): SubsystemCheck {
  // Voice requires microphone permission — can't check server-side
  return {
    name: "voice",
    status: "degraded",
    message: "Voice requires microphone permission (check browser/system settings)",
    required: false,
  };
}

/**
 * Check vision subsystem readiness.
 */
function checkVision(): SubsystemCheck {
  try {
    const { execFileSync } = require("child_process");
    // Check if swift is available for OCR
    try {
      execFileSync("which", ["swift"], { timeout: 2000, stdio: "pipe" });
    } catch {
      return {
        name: "vision",
        status: "degraded",
        message: "OCR unavailable (Swift compiler not found)",
        required: false,
      };
    }

    // Check screen recording permission
    try {
      execFileSync("screencapture", ["-x", "-t", "png", "/dev/null"], {
        timeout: 3000,
        stdio: "pipe",
      });
    } catch {
      return {
        name: "vision",
        status: "degraded",
        message: "Screen recording permission not granted",
        required: false,
      };
    }

    return {
      name: "vision",
      status: "ready",
      message: "Vision system available",
      required: false,
    };
  } catch {
    return {
      name: "vision",
      status: "degraded",
      message: "Vision check failed",
      required: false,
    };
  }
}

/**
 * Check computer-use (accessibility) readiness.
 */
function checkComputerUse(): SubsystemCheck {
  try {
    const { execFileSync } = require("child_process");
    try {
      execFileSync("osascript", ["-e", 'tell application "System Events" to get name of first process whose frontmost is true'], {
        timeout: 3000,
        stdio: "pipe",
      });
      return {
        name: "computer_use",
        status: "ready",
        message: "Accessibility permission available",
        required: false,
      };
    } catch {
      return {
        name: "computer_use",
        status: "degraded",
        message: "Accessibility permission not granted (required for computer use)",
        required: false,
      };
    }
  } catch {
    return {
      name: "computer_use",
      status: "degraded",
      message: "Computer use check failed",
      required: false,
    };
  }
}

/**
 * Run all environment checks and produce a report.
 */
export function validateEnvironment(): EnvironmentReport {
  const subsystems: SubsystemCheck[] = [
    checkAIProvider(),
    checkStorage(),
    checkVoice(),
    checkVision(),
    checkComputerUse(),
  ];

  let overall: EnvironmentStatus = "ready";

  for (const sub of subsystems) {
    if (sub.status === "misconfigured" && sub.required) {
      overall = "misconfigured";
      break;
    }
    if (sub.status === "misconfigured" || sub.status === "degraded") {
      if (overall === "ready") {
        overall = "degraded";
      }
    }
  }

  return {
    status: overall,
    subsystems,
    checkedAt: Date.now(),
  };
}

/**
 * Get a user-friendly status message from an environment report.
 */
export function getStatusMessage(report: EnvironmentReport): string {
  switch (report.status) {
    case "ready":
      return "JARVIS is ready.";
    case "degraded":
      return "JARVIS is running with limited capabilities. Some features may be unavailable.";
    case "misconfigured":
      return "JARVIS needs configuration. Please check your environment settings.";
    default:
      return "JARVIS status unknown.";
  }
}
