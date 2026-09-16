#!/usr/bin/env node
/**
 * Ensures the Vale binary is downloaded and ready in @vvago/vale/native.
 *
 * The @vvago/vale postinstall script uses GitHub REST API asset URLs that are subject to
 * GitHub's unauthenticated 60 req/hr rate limit, which fails CI runners with HTTP 403.
 * This script downloads directly from GitHub Releases CDN instead, ensuring reliability.
 */
import { spawnSync } from 'node:child_process';
import {
   accessSync,
   chmodSync,
   constants,
   existsSync,
   mkdirSync,
   writeFileSync,
} from 'node:fs';
import { resolve } from 'node:path';

const { env: processEnv, platform } = process;

const VALE_VERSION = '3.20.0';
const EXEC_MODE = 0o755;
const NATIVE_DIR = resolve(
   import.meta.dirname,
   '..',
   'node_modules',
   '@vvago',
   'vale',
   'native',
);
const IS_WINDOWS = platform === 'win32';
const BIN_NAME = IS_WINDOWS ? 'vale.exe' : 'vale';
const BIN_PATH = resolve(NATIVE_DIR, BIN_NAME);

function isExecutable(path) {
   if (!existsSync(path)) {
      return false;
   }
   try {
      accessSync(path, constants.X_OK);
      return true;
   } catch {
      return false;
   }
}

function resolveAsset() {
   const key = `${platform}-${process.arch}`;
   const map = {
      'darwin-arm64': `vale_${VALE_VERSION}_macOS_arm64.tar.gz`,
      'darwin-x64': `vale_${VALE_VERSION}_macOS_64-bit.tar.gz`,
      'linux-x64': `vale_${VALE_VERSION}_Linux_64-bit.tar.gz`,
      'linux-arm64': `vale_${VALE_VERSION}_Linux_arm64.tar.gz`,
      'win32-x64': `vale_${VALE_VERSION}_Windows_64-bit.zip`,
      'win32-arm64': `vale_${VALE_VERSION}_Windows_arm64.zip`,
   };
   const asset = map[key];
   if (!asset) {
      throw new Error(`Unsupported platform for Vale: ${key}`);
   }
   return asset;
}

async function downloadArchive(url) {
   const headers = {};
   if (processEnv.GITHUB_TOKEN) {
      headers.Authorization = `Bearer ${processEnv.GITHUB_TOKEN}`;
   }
   const response = await fetch(url, { headers, redirect: 'follow' });
   if (!response.ok) {
      throw new Error(
         `Failed to download Vale: ${response.status} ${response.statusText}`,
      );
   }
   return Buffer.from(await response.arrayBuffer());
}

function extractArchive(archivePath) {
   const result = spawnSync('tar', ['-xf', archivePath, '-C', NATIVE_DIR], {
      stdio: 'inherit',
   });
   if (result.status !== 0) {
      throw new Error(`Failed to extract Vale archive: exit code ${result.status}`);
   }
   if (!IS_WINDOWS) {
      chmodSync(BIN_PATH, EXEC_MODE);
   }
}

async function ensureVale() {
   if (isExecutable(BIN_PATH)) {
      return;
   }

   mkdirSync(NATIVE_DIR, { recursive: true });
   const asset = resolveAsset();
   const url = `https://github.com/errata-ai/vale/releases/download/v${VALE_VERSION}/${asset}`;

   process.stdout.write(`Downloading Vale v${VALE_VERSION} from ${url}...\n`);
   const buffer = await downloadArchive(url);
   const tempArchive = resolve(NATIVE_DIR, asset);
   writeFileSync(tempArchive, buffer);

   extractArchive(tempArchive);
   process.stdout.write(`Vale v${VALE_VERSION} installed to ${BIN_PATH}\n`);
}

await ensureVale();
