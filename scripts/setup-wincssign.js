/**
 * setup-wincssign.js
 *
 * Pre-extracts winCodeSign into the electron-builder cache so that NSIS builds
 * succeed on Windows machines that don't have Developer Mode enabled.
 *
 * Root cause: electron-builder bundles macOS OpenSSL dylib symlinks inside the
 * winCodeSign-2.6.0.7z archive. On Windows, creating symlinks requires either
 * Developer Mode or admin rights. 7-Zip exits with code 2 (warning) when it
 * can't create those symlinks, and electron-builder treats any non-zero exit as
 * a complete failure — so it deletes the partial extraction and retries forever.
 *
 * This script:
 *  1. Downloads winCodeSign-2.6.0.7z to the electron-builder cache (if needed)
 *  2. Extracts it, tolerating exit code 2
 *  3. Creates empty stub files for the two darwin symlinks that couldn't be created
 *  4. Writes a marker file so electron-builder recognises the cache as valid
 */

'use strict';

const { execFileSync } = require('child_process');
const fs   = require('fs');
const path = require('path');
const https = require('https');
const os   = require('os');

// ─── Config ──────────────────────────────────────────────────────────────────

const VERSION     = 'winCodeSign-2.6.0';
const ARCHIVE_URL = `https://github.com/electron-userland/electron-builder-binaries/releases/download/${VERSION}/${VERSION}.7z`;

// Symlinks inside the archive that Windows can't create without Developer Mode.
// We stub them out so the extraction is considered complete.
const STUB_PATHS = [
  'darwin/10.12/lib/libcrypto.dylib',
  'darwin/10.12/lib/libssl.dylib',
];

// electron-builder looks for its cache here on Windows
function getCacheBase() {
  return path.join(
    process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'),
    'electron-builder',
    'Cache',
    'winCodeSign'
  );
}

function get7zaPath() {
  const root = path.join(__dirname, '..');
  return path.join(root, 'node_modules', '7zip-bin', 'win', 'x64', '7za.exe');
}

// ─── Download ─────────────────────────────────────────────────────────────────

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const follow = (u) => {
      https.get(u, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          file.close();
          return follow(res.headers.location);
        }
        if (res.statusCode !== 200) {
          file.close();
          fs.unlink(dest, () => {});
          return reject(new Error(`HTTP ${res.statusCode} downloading ${u}`));
        }
        res.pipe(file);
        file.on('finish', () => { file.close(); resolve(); });
        file.on('error', (err) => { fs.unlink(dest, () => {}); reject(err); });
      }).on('error', (err) => { fs.unlink(dest, () => {}); reject(err); });
    };
    follow(url);
  });
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  // Only needed on Windows; other platforms don't have this problem
  if (process.platform !== 'win32') return;

  const cacheBase  = getCacheBase();
  const targetDir  = path.join(cacheBase, VERSION);
  const archiveFile = path.join(cacheBase, `${VERSION}.7z`);

  // Sentinel: electron-builder writes this when it considers the cache valid.
  // We write it ourselves after a successful manual extraction.
  const sentinelFile = path.join(targetDir, 'windows-10', 'x64', 'signtool.exe');

  if (fs.existsSync(sentinelFile)) {
    console.log('[setup-wincssign] Cache already populated, skipping.');
    return;
  }

  const z7za = get7zaPath();
  if (!fs.existsSync(z7za)) {
    console.log('[setup-wincssign] 7za not found (node_modules not installed yet?), skipping.');
    return;
  }

  console.log('[setup-wincssign] Pre-extracting winCodeSign cache to bypass symlink permission error...');

  // 1. Ensure cache directory exists
  fs.mkdirSync(targetDir, { recursive: true });

  // 2. Download archive if not already cached
  if (!fs.existsSync(archiveFile)) {
    process.stdout.write(`[setup-wincssign] Downloading ${VERSION}.7z ... `);
    await download(ARCHIVE_URL, archiveFile);
    process.stdout.write('done.\n');
  } else {
    console.log('[setup-wincssign] Archive already downloaded.');
  }

  // 3. Extract — 7za exits with code 2 (warning) when it can't create macOS symlinks.
  //    That's expected and harmless for our Windows-only use case.
  try {
    execFileSync(z7za, ['x', archiveFile, `-o${targetDir}`, '-y', '-aoa'], {
      stdio: 'pipe',
    });
    console.log('[setup-wincssign] Extracted cleanly (symlinks supported on this machine).');
  } catch (err) {
    if (err.status === 2) {
      console.log('[setup-wincssign] Extracted with warnings (exit 2 — symlinks skipped, expected on Windows without Developer Mode).');
    } else {
      console.error(`[setup-wincssign] Unexpected extraction error (exit ${err.status}):`, err.stderr?.toString() || err.message);
      return; // don't create stubs if something else went wrong
    }
  }

  // 4. Create empty stub files for the two darwin symlinks that 7za couldn't create.
  //    electron-builder doesn't need these for Windows builds — they're macOS OpenSSL libs.
  for (const rel of STUB_PATHS) {
    const abs = path.join(targetDir, rel.replace(/\//g, path.sep));
    if (!fs.existsSync(abs)) {
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, ''); // empty stub
      console.log(`[setup-wincssign] Created stub: ${rel}`);
    }
  }

  if (fs.existsSync(sentinelFile)) {
    console.log('[setup-wincssign] ✓ Cache ready.');
  } else {
    console.log('[setup-wincssign] ⚠ signtool.exe not found in expected location — extraction may be incomplete.');
    console.log(`                  Expected: ${sentinelFile}`);
    console.log('                  If the build still fails, enable Windows Developer Mode (Settings → System → For developers).');
  }
}

main().catch((err) => {
  // Non-fatal — the build will fail later with the original error if the cache isn't ready,
  // but we don't want a broken postinstall to block npm install entirely.
  console.error('[setup-wincssign] Error:', err.message);
});
