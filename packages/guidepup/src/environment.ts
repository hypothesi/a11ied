import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir, release } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { z } from 'zod';
import type { DoctorCheck, Platform } from '@a11ied/contracts';

/** Configures the OS permissions Guidepup needs to drive a real screen reader. */
export const GUIDEPUP_SETUP_COMMAND = 'npx -y @guidepup/setup setup';

/** Downloads the screen reader assets Guidepup drives into its local cache. */
export const GUIDEPUP_INSTALL_COMMAND = 'npx -y @guidepup/setup install';

export const GUIDEPUP_MANUAL_VOICEOVER_SETUP_URL =
   'https://www.guidepup.dev/docs/guides/manual-voiceover-setup';

const { env: processEnv, platform: processPlatform } = process;

const VOICEOVER_DEFAULTS_DOMAIN = 'com.apple.VoiceOver4/default';
const VOICEOVER_APPLESCRIPT_KEY = 'SCREnableAppleScript';
const VOICEOVER_TRAINING_DOMAIN = 'com.apple.VoiceOverTraining';
const VOICEOVER_SPLASH_KEY = 'doNotShowSplashScreen';
const VOICEOVER_APPLESCRIPT_SYSTEM_FLAG =
   '/private/var/db/Accessibility/.VoiceOverAppleScriptEnabled';
const VOICEOVER_LOCAL_PREFERENCES_FILE = 'com.apple.VoiceOver4.local.plist';
const DEFAULTS_TIMEOUT_MS = 5000;
const DEFAULTS_ENABLED_VALUE = '1';
const MANIFEST_DEPTH_TO_INSTALL_ROOT = 3;

const manifestSchema = z.object({
   screenReaders: z.array(
      z.object({
         id: z.string(),
         assets: z.array(
            z.object({
               version: z.string(),
               platformVersion: z.string().optional(),
               asset: z.string(),
            }),
         ),
      }),
   ),
});
type GuidepupManifest = z.infer<typeof manifestSchema>;

export interface GuidepupEnvironmentDeps {
   platform: NodeJS.Platform;
   osRelease: string;
   homeDir: string;
   env: NodeJS.ProcessEnv;
   existsSync: (path: string) => boolean;
   readDefault: (domain: string, key: string) => string | undefined;
   /**
    * Absolute path to `@guidepup/guidepup/manifest.json`, or undefined when not
    * resolvable.
    */
   manifestPath: string | undefined;
   readManifest: (manifestPath: string) => GuidepupManifest;
}

function readDefaultWithDefaultsCommand(domain: string, key: string): string | undefined {
   const result = spawnSync('defaults', ['read', domain, key], {
      encoding: 'utf8',
      timeout: DEFAULTS_TIMEOUT_MS,
   });
   if (result.error || result.status !== 0) {
      return undefined;
   }
   return result.stdout.trim();
}

function resolveManifestPath(): string | undefined {
   try {
      return createRequire(import.meta.url).resolve('@guidepup/guidepup/manifest.json');
   } catch {
      return undefined;
   }
}

function readManifestFile(manifestPath: string): GuidepupManifest {
   return manifestSchema.parse(createRequire(import.meta.url)(manifestPath));
}

export function createDefaultGuidepupEnvironmentDeps(): GuidepupEnvironmentDeps {
   return {
      platform: processPlatform,
      osRelease: release(),
      homeDir: homedir(),
      env: processEnv,
      existsSync,
      readDefault: readDefaultWithDefaultsCommand,
      manifestPath: resolveManifestPath(),
      readManifest: readManifestFile,
   };
}

/** Mirrors the cache location `@guidepup/setup install` writes to. */
export function resolveGuidepupCachePath(deps: GuidepupEnvironmentDeps): string {
   const override = deps.env.GUIDEPUP_SCREEN_READERS_PATH;
   if (override) {
      return resolve(override);
   }
   if (deps.platform === 'darwin') {
      return join(deps.homeDir, 'Library', 'Caches', 'guidepup');
   }
   if (deps.platform === 'win32') {
      return resolve(
         deps.env.LOCALAPPDATA ?? join(deps.homeDir, 'AppData', 'Local'),
         'guidepup',
      );
   }
   return join(deps.homeDir, '.cache', 'guidepup');
}

function resolveVoiceOverPreferencesDirectory(deps: GuidepupEnvironmentDeps): string {
   const groupContainerDirectory = join(
      deps.homeDir,
      'Library',
      'Group Containers',
      'group.com.apple.VoiceOver',
      'Library',
      'Preferences',
   );
   if (deps.existsSync(groupContainerDirectory)) {
      return groupContainerDirectory;
   }
   return join(deps.homeDir, 'Library', 'Preferences');
}

/**
 * Returns the directory `@guidepup/setup install` must run from: the one whose
 * `node_modules` holds `@guidepup/guidepup`, since the installer resolves the manifest
 * from `process.cwd()`.
 */
export function resolveGuidepupInstallRoot(manifestPath: string): string {
   let installRoot = dirname(manifestPath);
   for (let depth = 0; depth < MANIFEST_DEPTH_TO_INSTALL_ROOT; depth += 1) {
      installRoot = dirname(installRoot);
   }
   return installRoot;
}

/**
 * `a1 setup` runs the Guidepup commands from the directory where the manifest resolves,
 * so a reader never has to cd into a global node_modules tree to install the assets.
 */
export const A11IED_SETUP_COMMAND = 'a1 setup';

function buildCheck(args: {
   id: string;
   label: string;
   passed: boolean;
   failStatus?: DoctorCheck['status'];
   failDetail: string;
   action?: string;
   actionLabel?: string;
}): DoctorCheck {
   if (args.passed) {
      return { id: args.id, label: args.label, status: 'pass' };
   }

   const check: DoctorCheck = {
      id: args.id,
      label: args.label,
      status: args.failStatus ?? 'fail',
      detail: args.failDetail,
   };
   if (args.action) {
      check.action = args.action;
   }
   if (args.actionLabel) {
      check.actionLabel = args.actionLabel;
   }
   return check;
}

function buildManifestMissingCheck(): DoctorCheck {
   return {
      id: 'guidepup-manifest',
      label: 'Guidepup screen reader manifest found',
      status: 'fail',
      detail:
         'Could not resolve @guidepup/guidepup/manifest.json from the a11ied installation.',
   };
}

function findScreenReader(
   manifest: GuidepupManifest,
   id: string,
): GuidepupManifest['screenReaders'][number] | undefined {
   return manifest.screenReaders.find((screenReader) => screenReader.id === id);
}

function buildVoiceOverPreferencesBundleCheck(
   deps: GuidepupEnvironmentDeps,
): DoctorCheck {
   const label = 'Guidepup VoiceOver preferences bundle installed';
   if (!deps.manifestPath) {
      return buildManifestMissingCheck();
   }

   const darwinMajor = deps.osRelease.split('.', 1)[0] ?? '',
      manifest = deps.readManifest(deps.manifestPath);
   const screenReader = findScreenReader(manifest, 'voiceover');
   const asset = screenReader?.assets.find(
      (entry) => entry.platformVersion === darwinMajor,
   );

   if (!asset) {
      const supported = screenReader?.assets
         .map((entry) => entry.platformVersion)
         .join(', ');
      return {
         id: 'voiceover-preferences-bundle',
         label,
         status: 'fail',
         detail: `Guidepup ships no VoiceOver preferences bundle for Darwin ${darwinMajor} (supported: ${supported ?? 'none'}).`,
      };
   }

   const assetPath = join(
      resolveGuidepupCachePath(deps),
      'voiceover',
      darwinMajor,
      asset.version,
      asset.asset,
   );
   return buildCheck({
      id: 'voiceover-preferences-bundle',
      label,
      passed: deps.existsSync(assetPath),
      failDetail: `${assetPath} is missing. VoiceOver sessions mount this bundle on every start.`,
      action: A11IED_SETUP_COMMAND,
      actionLabel: 'Install the Guidepup VoiceOver preferences bundle',
   });
}

/** Checks the pieces `@guidepup/setup` configures for VoiceOver automation on macOS. */
export function checkVoiceOverEnvironment(deps: GuidepupEnvironmentDeps): DoctorCheck[] {
   const localPreferencesPath = join(
      resolveVoiceOverPreferencesDirectory(deps),
      VOICEOVER_LOCAL_PREFERENCES_FILE,
   );

   return [
      buildCheck({
         id: 'voiceover-applescript-setting',
         label: 'AppleScript control enabled in VoiceOver settings',
         passed:
            deps.readDefault(VOICEOVER_DEFAULTS_DOMAIN, VOICEOVER_APPLESCRIPT_KEY) ===
            DEFAULTS_ENABLED_VALUE,
         failDetail: `\`defaults read ${VOICEOVER_DEFAULTS_DOMAIN} ${VOICEOVER_APPLESCRIPT_KEY}\` is not ${DEFAULTS_ENABLED_VALUE}.`,
         action: A11IED_SETUP_COMMAND,
         actionLabel: 'Enable AppleScript control for VoiceOver',
      }),
      buildCheck({
         id: 'voiceover-applescript-system-flag',
         label: 'AppleScript control confirmed by macOS',
         passed: deps.existsSync(VOICEOVER_APPLESCRIPT_SYSTEM_FLAG),
         failDetail: `${VOICEOVER_APPLESCRIPT_SYSTEM_FLAG} is missing. If setup cannot create it, turn on "Allow VoiceOver to be controlled with AppleScript" in VoiceOver Utility (${GUIDEPUP_MANUAL_VOICEOVER_SETUP_URL}).`,
         action: A11IED_SETUP_COMMAND,
         actionLabel: 'Confirm AppleScript control for VoiceOver',
      }),
      buildCheck({
         id: 'voiceover-local-preferences',
         label: 'VoiceOver local preferences exist',
         passed: deps.existsSync(localPreferencesPath),
         failDetail: `${localPreferencesPath} is missing. Setup starts VoiceOver once to create it.`,
         action: A11IED_SETUP_COMMAND,
         actionLabel: 'Create the VoiceOver local preferences',
      }),
      buildCheck({
         id: 'voiceover-splash-screen',
         label: 'VoiceOver welcome dialog suppressed',
         passed:
            deps.readDefault(VOICEOVER_TRAINING_DOMAIN, VOICEOVER_SPLASH_KEY) ===
            DEFAULTS_ENABLED_VALUE,
         failStatus: 'warn',
         failDetail: 'VoiceOver may show its welcome dialog when a session starts.',
         action: A11IED_SETUP_COMMAND,
         actionLabel: 'Suppress the VoiceOver welcome dialog',
      }),
      buildVoiceOverPreferencesBundleCheck(deps),
   ];
}

/** Checks that the Guidepup NVDA build `@guidepup/setup install` downloads is present. */
export function checkNvdaEnvironment(deps: GuidepupEnvironmentDeps): DoctorCheck[] {
   if (!deps.manifestPath) {
      return [buildManifestMissingCheck()];
   }

   const manifest = deps.readManifest(deps.manifestPath);
   const asset = findScreenReader(manifest, 'nvda')?.assets[0];
   if (!asset) {
      return [
         {
            id: 'nvda-installed',
            label: 'Guidepup NVDA build installed',
            status: 'fail',
            detail: 'The Guidepup manifest lists no NVDA build.',
         },
      ];
   }

   const nvdaPath = join(
      resolveGuidepupCachePath(deps),
      'nvda',
      'all',
      asset.version,
      'extracted',
      'nvda.exe',
   );
   return [
      buildCheck({
         id: 'nvda-installed',
         label: 'Guidepup NVDA build installed',
         passed: deps.existsSync(nvdaPath),
         failDetail: `${nvdaPath} is missing.`,
         action: A11IED_SETUP_COMMAND,
         actionLabel: 'Install the Guidepup NVDA build',
      }),
   ];
}

const ASSET_CHECK_IDS = new Set(['voiceover-preferences-bundle', 'nvda-installed']);

/**
 * Whether the files a real screen reader downloads are already in the Guidepup cache.
 * VoiceOver mounts its preferences bundle on every start and NVDA runs from its own
 * build, so a session cannot start until they are there.
 */
export function hasScreenReaderAssets(
   deps: GuidepupEnvironmentDeps,
   target: Extract<Platform, 'voiceover' | 'nvda'>,
): boolean {
   const checks =
      target === 'voiceover'
         ? [buildVoiceOverPreferencesBundleCheck(deps)]
         : checkNvdaEnvironment(deps);
   return checks
      .filter((check) => ASSET_CHECK_IDS.has(check.id))
      .every((check) => check.status === 'pass');
}
