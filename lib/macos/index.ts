/**
 * macOS Integration Module Exports
 */

export type {
  TelemetryResult,
  CPUTelemetry,
  MemoryTelemetry,
  DiskTelemetry,
  BatteryTelemetry,
  NetworkTelemetry,
  UptimeTelemetry,
  MacOSSystemTelemetry,
  AppLaunchResult,
  ApplicationDefinition,
  ProcessSummary,
  VolumeStatus,
  BrightnessStatus,
  AppQuitResult,
  FolderOpenResult,
  ScreenshotResult,
  FrontmostAppResult,
  RunningApplicationInfo,
  RunningApplicationsResult,
  ActiveWindowResult,
} from "./types";

export {
  getCPUUsage,
  getMemoryUsage,
  getDiskUsage,
  getBatteryStatus,
  getNetworkStatus,
  getSystemUptime,
  getProcessSummary,
  getSystemTelemetry,
} from "./telemetry";

export {
  getAllowlistedApplication,
  getAllowlistedApplications,
  resolveApplicationName,
  launchApplication,
  applicationExists,
  quitApplication,
  getFrontmostApplication,
  getRunningApplications,
} from "./applications";

export {
  getVolumeStatus,
  setVolume,
  validateSetVolume,
  parseVolumeSettings,
} from "./volume";

export {
  getActiveWindow,
} from "./window";

export {
  getBrightnessStatus,
  setBrightness,
  validateSetBrightness,
} from "./brightness";

export {
  FOLDER_ALLOWLIST,
  resolveFolderPath,
  openFolder,
} from "./folders";

export {
  SCREENSHOT_DIR_NAME,
  getScreenshotDirectory,
  buildScreenshotPath,
  takeScreenshot,
} from "./screenshot";
