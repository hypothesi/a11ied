export { createDriverAdapter, type CreateDriverAdapterOptions } from './adapters.js';
export {
   driverCapabilities,
   type DriverActionOptions,
   type DriverAdapter,
} from './adapter-shared.js';
export {
   getPortableCommand,
   portableCommandTable,
   type PortableCommandEntry,
} from './portable-commands.js';
export {
   describeNavigation,
   getNavigationKindEntry,
   navigationKindTable,
   type NavigationKindEntry,
} from './portable-navigation.js';
export { delay, ignoreError, repeatUntil, runInOrder } from './sequential.js';
export { queryFocusedAxProperties } from './ax-properties-mac.js';
export {
   DriverCommandError,
   driverCommandSets,
   isDriverCommandSet,
   listDriverCommands,
   parseDriverCommandSet,
   resolveDriverCommand,
   serializeResolvedDriverCommand,
   type ConcreteDriverCommandSet,
   type DriverCommandGroup,
   type DriverCommandList,
   type DriverCommandSet,
   type ListDriverCommandsOptions,
   type ResolvedDriverCommand,
   type SerializableDriverCommand,
} from './command-registry.js';

export {
   checkNvdaEnvironment,
   checkVoiceOverEnvironment,
   createDefaultGuidepupEnvironmentDeps,
   GUIDEPUP_INSTALL_COMMAND,
   GUIDEPUP_SETUP_COMMAND,
   resolveGuidepupCachePath,
   resolveGuidepupInstallRoot,
   type GuidepupEnvironmentDeps,
} from './environment.js';
export { describePlatform, guidepupSetupCommand } from './readiness.js';
export {
   isFrontmostMatch,
   readFrontmostWindow,
   waitForWindowFocus,
   WINDOW_FOCUS_TIMEOUT_MS,
   type FrontmostWindow,
   type WindowFocusResult,
} from './window-focus.js';
export {
   createVirtualAdapter,
   defaultVirtualDocument,
   type VirtualAdapterOptions,
   type VirtualCommandResolution,
   type VirtualCommandResolver,
} from './virtual-adapter.js';
export { createJsdomVirtualHost } from './virtual-dom.js';
export type { VirtualHost } from './virtual-host.js';
export { readVirtualPageScript } from './virtual-page-script.js';
export type { VirtualReader, VirtualWindow } from './virtual-reader.js';
export {
   createVirtualRuntime,
   type VirtualCurrentItem,
   type VirtualRuntime,
   type VirtualRuntimeOptions,
   type VirtualSpeech,
} from './virtual-runtime.js';
export {
   decodeDriverCommandError,
   encodeDriverCommandError,
} from './driver-command-wire.js';
