// Browser smoke test: plays a whole match through the real UI (the human seat is answered by an AI), takes
// screenshots of the interesting prompts and fails on any console error.
//
//   node tools/ui-smoke.mjs [--url=http://127.0.0.1:5173/] [--seed=1] [--out=tmp/shots] [--kinds=a,b,c] [--timeout=240]
//
// Without --url it starts its own Vite dev server on the first free port from 5200 (so it never collides with
// another dev server) and shuts it down afterwards.
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v = '1'] = a.replace(/^--/, '').split('=');
    return [k, v];
  })
);
let server = null;
let base = args.url;
if (!base) {
  server = await createServer({
    configFile: path.resolve('vite.config.js'),
    logLevel: 'error',
    clearScreen: false,
    server: { host: '127.0.0.1', port: 5200, strictPort: false, open: false },
  });
  await server.listen();
  base = server.resolvedUrls.local[0];
}
console.log('serving', base);
const seed = Number(args.seed ?? 1);
const out = path.resolve(args.out ?? 'tmp/shots');
const timeout = Number(args.timeout ?? 240) * 1000;
const kinds = (args.kinds ?? 'chooseAction,explore,placeSector,takeControl,research,upgrade,build,move,influence,engage,discovery,upkeepColonize,chooseReaction,bankruptcy,artifactKey,chooseTech,ancientPart').split(',');
const EXE = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
].find((p) => fs.existsSync(p));

fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: EXE, headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const problems = [];
page.on('console', (m) => {
  if (m.text().startsWith('Failed to load resource')) return; // reported with its URL below
  if (m.type() === 'error' || m.type() === 'warning') problems.push(`[${m.type()}] ${m.text()}`);
});
page.on('response', (r) => {
  if (r.status() >= 400) problems.push(`[http ${r.status()}] ${r.url()}`);
});
page.on('pageerror', (e) => problems.push(`[pageerror] ${e.message}\n${e.stack}`));

const shot = async (name) => {
  await page.waitForTimeout(350);
  await page.screenshot({ path: path.join(out, `${name}.png`) });
};

await page.goto(base);
await page.waitForTimeout(1500);
await shot('00-menu');

await page.goto(`${base}?autoplay=1&seed=${seed}&speed=instant`);
await page.waitForFunction(() => !!window.__eclipse, null, { timeout: 30000 });
await page.evaluate((wanted) => {
  const s = window.__eclipse;
  s.want = new Set(wanted);
  s.autoGate = (d) => {
    if (!s.want.has(d.kind)) return undefined;
    s.want.delete(d.kind);
    return new Promise((release) => {
      s.gated = { kind: d.kind, release };
    });
  };
}, kinds);

const t0 = Date.now();
let n = 1;
const seen = [];
for (;;) {
  const state = await page.evaluate(() => ({
    gated: window.__eclipse?.gated?.kind ?? null,
    over: !!window.__eclipseResult,
    round: window.__eclipse?.engine?.state?.round ?? null,
  }));
  if (state.gated) {
    const name = `${String(n++).padStart(2, '0')}-${state.gated}-r${state.round}`;
    seen.push(state.gated);
    await shot(name);
    await page.evaluate(() => {
      const g = window.__eclipse.gated;
      window.__eclipse.gated = null;
      g.release();
    });
  }
  if (state.over) break;
  if (Date.now() - t0 > timeout) {
    problems.push(`[timeout] the match did not finish within ${timeout / 1000}s`);
    break;
  }
  await page.waitForTimeout(80);
}
if (!problems.some((p) => p.startsWith('[timeout]'))) await shot('99-gameover');
const result = await page.evaluate(() => window.__eclipseResult ?? null);
console.log('captured prompts:', seen.join(', '));
console.log('result:', JSON.stringify(result));
console.log(`${problems.length} console problem(s)`);
for (const p of problems.slice(0, 40)) console.log(p);
await browser.close();
await server?.close();
process.exit(problems.length ? 1 : 0);
