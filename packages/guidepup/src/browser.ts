/*
 * The part of this package that runs in a browser: the virtual reader runtime and the
 * adapter over it, plus the errors and helpers the core action handlers need. Nothing
 * here imports Node modules, jsdom, or Guidepup's VoiceOver and NVDA drivers.
 */
export {
   driverCapabilities,
   type DriverActionOptions,
   type DriverAdapter,
} from './adapter-shared.js';
export { DriverCommandError } from './driver-command-error.js';
export { delay, ignoreError, repeatUntil, runInOrder } from './sequential.js';
export {
   createVirtualAdapter,
   defaultVirtualDocument,
   type VirtualAdapterOptions,
   type VirtualCommandResolution,
   type VirtualCommandResolver,
} from './virtual-adapter.js';
export type { VirtualHost } from './virtual-host.js';
export type { VirtualReader, VirtualWindow } from './virtual-reader.js';
export {
   createVirtualRuntime,
   type VirtualCurrentItem,
   type VirtualRuntime,
   type VirtualRuntimeOptions,
   type VirtualSpeech,
} from './virtual-runtime.js';
