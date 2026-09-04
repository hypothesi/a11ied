export { createDriverAdapter } from './adapters.js';
export { driverCapabilities, type DriverAdapter } from './adapter-shared.js';
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
