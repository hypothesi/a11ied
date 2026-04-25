export { createDriverAdapter } from './adapters.js';
export { driverCapabilities, type DriverAdapter } from './adapter-shared.js';
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

export { describePlatform, guidepupSetupCommand } from './readiness.js';
