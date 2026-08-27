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
  listWindows,
  focusApplication,
  minimizeWindow,
  closeWindow,
  getScreenDimensions,
} from "./window";

export type {
  WindowInfo,
  WindowListResult,
  WindowActionResult,
  ScreenDimensions,
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

export {
  readClipboard,
  writeClipboard,
  clearClipboard,
  isCredentialLike,
} from "./clipboard";

export type {
  ClipboardReadResult,
  ClipboardWriteResult,
} from "./clipboard";

export {
  listFiles,
  getFileMetadata,
  searchFiles,
  openFile,
  revealInFinder,
  createFolder,
} from "./files";

export type {
  FileMetadata,
  FileListResult,
  FileSearchResult,
  FileActionResult,
} from "./files";

export {
  validateUrl as validateSafariUrl,
  isSafariRunning,
  getSafariState,
  openUrlInSafari,
  newSafariTab,
  closeSafari,
  closeSafariTab,
} from "./apps/safari";

export type {
  SafariTab,
  SafariState,
  SafariActionResult,
} from "./apps/safari";

export {
  isVSCodeRunning,
  getVSCodeState,
  focusVSCode,
  openVSCode,
} from "./apps/vscode";

export type {
  VSCodeState,
  VSCodeActionResult,
} from "./apps/vscode";

export {
  getUpcomingEvents,
  getTodayEvents,
  createCalendarEvent,
} from "./calendar";

export type {
  CalendarEvent,
  CalendarResult,
  CalendarActionResult,
} from "./calendar";

export {
  isMusicRunning,
  getMusicState,
  controlMusic,
  playTrack,
} from "./music";

export type {
  TrackInfo,
  MusicState,
  MusicActionResult,
} from "./music";

export {
  getSystemSnapshot,
} from "./system-snapshot";

export type {
  SystemSnapshot,
} from "./system-snapshot";
