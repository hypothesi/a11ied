import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';

const { env: processEnv } = process;
const THIS_DIR = import.meta.dirname;
const ARG_SCRIPT_INDEX = 1;

function resolveSdkRoot() {
   const candidates = [
      processEnv.ANDROID_HOME,
      processEnv.ANDROID_SDK_ROOT,
      resolve(homedir(), 'Library', 'Android', 'sdk'),
   ].filter(Boolean);

   for (const candidate of candidates) {
      if (existsSync(candidate)) {
         return candidate;
      }
   }
   throw new Error('Could not locate Android SDK directory.');
}

function findLatestDir(parent, preferred) {
   const target = resolve(parent, preferred);
   if (existsSync(target)) {
      return target;
   }
   throw new Error(`Expected Android SDK path missing: ${target}`);
}

function packageAndSignApk({ tools, paths }) {
   execFileSync('zip', ['-j', paths.unalignedApk, resolve(paths.dexDir, 'classes.dex')]);
   execFileSync(tools.zipalign, ['-f', '-p', '4', paths.unalignedApk, paths.alignedApk]);

   execFileSync('keytool', [
      '-genkeypair',
      '-v',
      '-keystore',
      paths.keystorePath,
      '-storepass',
      'android',
      '-alias',
      'srdebug',
      '-keypass',
      'android',
      '-keyalg',
      'RSA',
      '-keysize',
      '2048',
      '-validity',
      '365',
      '-dname',
      'CN=SR Debug,O=a11ied,C=US',
   ]);

   execFileSync(tools.apksigner, [
      'sign',
      '--ks',
      paths.keystorePath,
      '--ks-pass',
      'pass:android',
      '--key-pass',
      'pass:android',
      '--out',
      paths.signedApk,
      paths.alignedApk,
   ]);
}

export function buildAndroidWebViewApk(outputDir = '/tmp/sr-android-webview') {
   const sdkRoot = resolveSdkRoot();
   const buildTools = findLatestDir(resolve(sdkRoot, 'build-tools'), '32.0.0');
   const platformJar = resolve(sdkRoot, 'platforms', 'android-33', 'android.jar');

   if (!existsSync(platformJar)) {
      throw new Error(`Missing android-33 platform jar at ${platformJar}`);
   }

   const tools = {
      aapt2: resolve(buildTools, 'aapt2'),
      d8: resolve(buildTools, 'd8'),
      zipalign: resolve(buildTools, 'zipalign'),
      apksigner: resolve(buildTools, 'apksigner'),
   };

   rmSync(outputDir, { recursive: true, force: true });
   const classesDir = resolve(outputDir, 'classes');
   const dexDir = resolve(outputDir, 'dex');
   mkdirSync(classesDir, { recursive: true });
   mkdirSync(dexDir, { recursive: true });

   const paths = {
      manifestPath: resolve(THIS_DIR, 'AndroidManifest.xml'),
      javaPath: resolve(THIS_DIR, 'MainActivity.java'),
      unalignedApk: resolve(outputDir, 'unaligned.apk'),
      alignedApk: resolve(outputDir, 'aligned.apk'),
      signedApk: resolve(outputDir, 'sr-webview.apk'),
      keystorePath: resolve(outputDir, 'debug.keystore'),
      dexDir,
   };

   execFileSync(tools.aapt2, [
      'link',
      '-o',
      paths.unalignedApk,
      '-I',
      platformJar,
      '--manifest',
      paths.manifestPath,
      '--java',
      outputDir,
      '-v',
   ]);

   execFileSync('javac', [
      '--release',
      '11',
      '-classpath',
      platformJar,
      '-d',
      classesDir,
      paths.javaPath,
   ]);

   execFileSync(tools.d8, [
      '--lib',
      platformJar,
      '--output',
      paths.dexDir,
      resolve(classesDir, 'dev', 'a11ied', 'srwebview', 'MainActivity.class'),
   ]);

   packageAndSignApk({ tools, paths });
   return paths.signedApk;
}

if (import.meta.url === `file://${process.argv[ARG_SCRIPT_INDEX]}`) {
   const apk = buildAndroidWebViewApk();
   process.stdout.write(`Built ${apk}\n`);
}
