// AgentX logo contract — runs against brand-dist/ (built by the preceding
// test:agentx-auth step, like test/workmate-install.test.mjs).
//
//   npm run brand:build && node test/agentx-brand-assets.test.mjs
//
// Every logo WebMate shows comes from brand/icons/, which
// scripts/sync-brand-assets.py renders from the AgentX Workmate artwork in
// assets/brand/. These checks keep an upstream logo (or the retired "A" mark)
// from reaching a build: the toolbar and store icons, the sign-in gate, the
// onboarding and install pages, and the AgentX Cloud provider card.
import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TARGETS = ['chrome', 'firefox'];
const PROVIDER_ICON = 'icons/providers/webbrain_cloud.png';

const bytes = (rel) => fs.readFileSync(path.join(ROOT, rel));
const exists = (rel) => fs.existsSync(path.join(ROOT, rel));

/** Width and height from a PNG's IHDR chunk. */
function pngSize(buffer) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  assert.ok(buffer.subarray(0, 8).equals(signature), 'not a PNG');
  assert.equal(buffer.toString('latin1', 12, 16), 'IHDR', 'PNG without IHDR first');
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

/** Every `size → path` icon map a manifest declares, flattened. */
function manifestIcons(manifest) {
  const maps = [
    manifest.icons,
    manifest.action?.default_icon,
    manifest.browser_action?.default_icon,
    manifest.sidebar_action?.default_icon,
  ].filter((map) => map && typeof map === 'object');
  return maps.flatMap((map) => Object.entries(map).map(([size, file]) => ({ size: Number(size), file })));
}

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('brand/icons holds the AgentX icons at the sizes their names promise', () => {
  for (const [file, size] of [['icon16.png', 16], ['icon48.png', 48], ['icon128.png', 128], ['providers/webbrain_cloud.png', 64]]) {
    const { width, height } = pngSize(bytes(`brand/icons/${file}`));
    assert.deepEqual([width, height], [size, size], file);
  }
});

for (const target of TARGETS) {
  const dist = `brand-dist/${target}`;

  test(`${target}: every manifest icon is the AgentX icon of its declared size`, () => {
    const manifest = JSON.parse(bytes(`${dist}/manifest.json`).toString('utf8'));
    const icons = manifestIcons(manifest);
    assert.ok(icons.length >= 3, 'manifest declares no icons');
    for (const { size, file } of icons) {
      const built = bytes(`${dist}/${file}`);
      assert.ok(built.equals(bytes(`brand/${file}`)), `${file} is not brand/${file}`);
      const { width, height } = pngSize(built);
      assert.deepEqual([width, height], [size, size], `${file} declared as ${size}px`);
    }
  });

  test(`${target}: the AgentX Cloud provider shows the AgentX mark, not upstream's`, () => {
    const built = bytes(`${dist}/${PROVIDER_ICON}`);
    assert.ok(built.equals(bytes(`brand/${PROVIDER_ICON}`)), `${PROVIDER_ICON} is not the brand copy`);
    const upstream = `src/${target}/${PROVIDER_ICON}`;
    if (exists(upstream)) assert.ok(!built.equals(bytes(upstream)), 'upstream WebBrain Cloud icon shipped');
  });

  test(`${target}: every logo the pages show comes from brand/icons`, () => {
    const uiDir = path.join(ROOT, dist, 'src/ui');
    const shown = [];
    for (const name of fs.readdirSync(uiDir).filter((file) => file.endsWith('.html'))) {
      const html = fs.readFileSync(path.join(uiDir, name), 'utf8');
      // Product logos sit at the top of icons/; flags and provider marks live in subfolders.
      for (const match of html.matchAll(/<img\b[^>]*\bsrc="(?:\.\.\/)+(icons\/[^"/]+)"/g)) {
        shown.push({ page: name, file: match[1] });
      }
    }
    // The sign-in gate, the onboarding welcome and the install page.
    assert.ok(shown.length >= 3, `only ${shown.length} logo image(s) found`);
    for (const { page, file } of shown) {
      assert.ok(exists(`brand/${file}`), `${page} shows ${file}, which brand/icons does not provide`);
      assert.ok(bytes(`${dist}/${file}`).equals(bytes(`brand/${file}`)), `${page}: ${file} differs from brand/${file}`);
    }
  });
}

test('brand/icons is what sync-brand-assets.py renders from assets/brand/', () => {
  // Pillow renders the icons; a machine without it (CI's Node image) relies on
  // the byte checks above, which still catch an upstream or stale logo.
  const probe = spawnSync('python3', ['-c', 'import PIL'], { encoding: 'utf8' });
  if (probe.status !== 0) {
    console.log('      (skipped: python3 with Pillow is not available)');
    return;
  }
  const check = spawnSync('python3', ['scripts/sync-brand-assets.py', '--check'], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(check.status, 0, (check.stderr || check.stdout).trim());
});

let passed = 0;
let failed = 0;
console.log('\nagentx brand assets');
for (const t of tests) {
  try {
    await t.fn();
    console.log(`  ✓ ${t.name}`);
    passed += 1;
  } catch (error) {
    console.log(`  ✗ ${t.name}`);
    console.log(`      ${error.message}`);
    failed += 1;
  }
}
console.log(`\n  ${passed} passed, ${failed} failed (${tests.length} total)`);
if (failed > 0) process.exit(1);
