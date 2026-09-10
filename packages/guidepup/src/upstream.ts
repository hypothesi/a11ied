/*
 * The @guidepup/guidepup package index constructs a ScreenReader at import time, and that
 * constructor throws on any host without VoiceOver or NVDA. Importing the platform
 * modules directly keeps the virtual reader, and every Linux CI job, importable.
 */
export {
   voiceOver,
   VoiceOverCommanderCommands,
   voiceOverKeyCodeCommands,
} from '@guidepup/guidepup/lib/macOS/index.js';
export { nvda, NVDAKeyCodeCommands } from '@guidepup/guidepup/lib/windows/index.js';
export type { ScreenReader } from '@guidepup/guidepup/lib/ScreenReader.js';
