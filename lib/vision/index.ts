/**
 * JARVIS Vision — Public API
 */

export type { ScreenContext, OCRResult, OCRBlock, VisionConfig, VisionAnalysis, ScreenDimensions, ScreenFingerprint } from "./types";

export { checkScreenRecordingPermission, checkOCR, resetPermissionCache } from "./permissions";

export { captureScreenTemp, deleteTempScreenshot, cleanupOldTempFiles } from "./capture";
export type { CaptureResult } from "./capture";

export { performOCR } from "./ocr";

export { buildScreenContext, getLastContext, clearContext, getLastCaptureResult } from "./context";

export { analyzeScreenContext, hasVisualContent, getScreenSummary } from "./analyzer";

export { wrapAsUntrustedScreenContent, VISION_SYSTEM_PROMPT_ADDITION } from "./prompts";

export { loadVisionSettings, saveVisionSettings, resetVisionSettings } from "./settings";
