// Real-click driver: plays the human seat of a whole match with the mouse (Playwright mouse events on the
// canvas). Every move is chosen by the heuristic AI on a mirror copy of the rules engine and then has to be
// performed through the real UI: prompt buttons, map clicks, tech/blueprint/choice dialogs. It proves that every
// decision the engine can ask a human can actually be answered by clicking, and reports whatever cannot.
//
//   node tools/ui-drive.mjs [--seed=1] [--species=terran-federation] [--versus=planta] [--menu] [--speed=instant]
//                           [--timeout=900] [--out=tmp/drive] [--resume=3] [--tour=0] [--tour-round=1] [--hover=0]
//                           [--quirks=retreat,trade] [--docs=docs/screenshots] [--docs-round=6] [--gl=swiftshader] [--url=...]
//
//   --menu     start through the main menu (pick species, type the seed, press START GAME) instead of ?quick
//   --resume=N at the first action prompt of round N go Menu -> "Continue saved game" and check the restored game
//   --tour=0   skip the one-off tour of the top bar, the help, the tech tray and the opponent board
//   --tour-round=N  do that tour at the first action prompt of round N instead of round 1
//   --docs=DIR also save the README screenshots (stable file names, dialogs cropped to their frame) in DIR
//   --docs-round=N  round of the mid-game overview screenshots of --docs (default 6)
//   --hover=0  skip the mouse sweeps that trigger every tooltip
//   --quirks   make the human seat prefer branches the AI rarely takes, so that their UI gets clicked too:
//              retreat (retreat whenever a battle offers it) and trade (trade resources through the Trade dialog)
//   --gl=swiftshader  force software rendering (slow); by default the GPU is used when there is one
//
// Without --url it starts its own Vite dev server on the first free port from 5200 and shuts it down afterwards.
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';
import { createAI } from '../src/ai/registry.js';
import { Game } from '../src/core/game.js';
import { canon } from '../src/core/util.js';
import { RESOURCE_NAMES } from '../src/data/constants.js';
import { TECHS } from '../src/data/techs.js';
import { ACTION_INFO, shipName } from '../src/ui/names.js';

// ---------------------------------------------------------------------------- page side

// Runs inside the browser (installed with addInitScript), so it cannot use anything from this module.
function installDriver() {
  const GW = 1920;
  const GH = 1080;
  const D = { warns: [], hooked: new WeakSet() };
  window.__drv = D;
  const norm = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
  const phaser = () => window.__phaser;
  const activeKeys = () => (phaser()?.scene.getScenes(true) ?? []).map((s) => s.scene.key);
  const activeScene = () => phaser()?.scene.getScenes(true)[0] ?? null;
  const toClient = (x, y) => {
    const r = phaser().canvas.getBoundingClientRect();
    return { x: r.left + (x * r.width) / GW, y: r.top + (y * r.height) / GH };
  };
  const shown = (o) => {
    for (let c = o; c; c = c.parentContainer) if (!c.visible || !c.active) return false;
    return true;
  };
  const kids = (o) => o.list ?? o.children?.list ?? [];
  const walk = (root, fn) => {
    for (const o of kids(root)) {
      fn(o);
      if (o.list) walk(o, fn);
    }
  };
  const isButton = (o) => !!o && !!o.hit && !!o.txt && 'isEnabled' in o;
  const centre = (o) => {
    const m = o.getWorldTransformMatrix();
    return toClient(m.tx, m.ty);
  };
  const topModal = (scene) => {
    const all = [...(scene?.modals ?? [])];
    return all[all.length - 1] ?? null;
  };
  const describe = (b, free = false) => ({ text: norm(b.txt.text), enabled: !!b.isEnabled, free, ...centre(b.hit) });

  D.activeKeys = activeKeys;
  D.takeWarns = () => D.warns.splice(0);

  const hookWarn = (e) => {
    const p = e.presenter;
    if (D.hooked.has(p)) return;
    D.hooked.add(p);
    const orig = p.warn.bind(p);
    p.warn = (text) => {
      D.warns.push({ text, kind: e.engine.decision?.kind ?? null, round: e.engine.state.round });
      orig(text);
    };
  };

  D.snapshot = (from) => {
    const e = window.__eclipse;
    const scenes = activeKeys();
    const out = { scenes, result: window.__eclipseResult ?? null };
    if (!e || !scenes.includes('Game')) return out;
    hookWarn(e);
    const g = e.engine;
    const d = g.decision;
    out.cmdLen = g.cmdLog.length;
    out.cmds = g.cmdLog.slice(from);
    out.decision = d ? { id: d.id, kind: d.kind, pid: d.playerId, allowFree: !!d.allowFree } : null;
    out.human = e.humanId;
    out.awaitingHuman = !!e.match.awaitingHuman;
    out.pending = !!e.presenter.pending;
    out.colonizing = !!e.presenter.colonizing;
    out.modals = [...(e.scene.modals ?? [])].map((m) => norm(m.titleText?.text));
    out.round = g.state.round;
    out.phase = g.state.phase;
    out.over = !!g.over;
    return out;
  };

  // Buttons of the prompt bar ('prompt'), of the topmost dialog ('modal') or of everything on screen ('scene').
  D.buttons = (scope) => {
    const scene = activeScene();
    const e = window.__eclipse;
    const found = [];
    if (scope === 'prompt') {
      for (const b of e?.prompt.buttons ?? []) found.push([b, false]);
      for (const b of e?.prompt.free ?? []) found.push([b, true]);
    } else {
      const root = scope === 'modal' ? topModal(scene) : scene;
      if (root) walk(root, (o) => isButton(o) && found.push([o, false]));
    }
    return found.filter(([b]) => shown(b)).map(([b, free]) => describe(b, free));
  };

  D.named = (name) => {
    const scene = activeScene();
    let hit = null;
    if (scene) walk(scene, (o) => o.name === name && shown(o) && (hit = o));
    return hit ? centre(hit.hit ?? hit) : null;
  };

  D.names = (prefix = '') => {
    const out = [];
    const scene = activeScene();
    if (scene) walk(scene, (o) => o.name && o.name.startsWith(prefix) && out.push(o.name));
    return out;
  };

  D.map = (key, sq) => {
    const v = window.__eclipse?.view;
    if (!v) return null;
    const p = sq === undefined ? v.screenPos(key) : v.squarePos(key, sq);
    return { ...toClient(p.x, p.y), inside: v.inside(p), visible: v.isVisible(key) };
  };
  D.fit = () => window.__eclipse.view.fit(false, true);

  // Page rectangle of an area given in game coordinates, and of the frame of the topmost dialog.
  D.box = ({ x, y, width, height }) => {
    const a = toClient(x, y);
    const b = toClient(x + width, y + height);
    return { x: a.x, y: a.y, width: b.x - a.x, height: b.y - a.y };
  };
  D.modalBox = () => {
    const m = topModal(activeScene());
    return m ? D.box({ x: (GW - m.w) / 2 - 4, y: (GH - m.h) / 2 - 4, width: m.w + 8, height: m.h + 8 }) : null;
  };

  D.hits = () => {
    const scene = activeScene();
    const ptr = scene.input.activePointer;
    return scene.input.hitTestPointer(ptr).map((o) => ({
      type: o.constructor.name,
      name: o.name,
      owner: o.parentContainer?.txt ? norm(o.parentContainer.txt.text) : (o.parentContainer?.name ?? ''),
      depth: o.depth,
    }));
  };

  D.cards = () => {
    const scene = phaser().scene.getScene('Menu');
    const out = [];
    for (const side of ['human', 'rival']) for (const c of scene.cards?.[side] ?? []) out.push({ side, id: c.sp.id, ...centre(c.hit) });
    return out;
  };
  D.seedBox = () => centre(phaser().scene.getScene('Menu').seedHit);

  D.forceFree = (cmd) => {
    const e = window.__eclipse;
    e.presenter.closeModals();
    return e.presenter.runFree(cmd);
  };
  D.forceSubmit = (cmd) => {
    const e = window.__eclipse;
    e.presenter.closeModals();
    return e.presenter.submit(cmd);
  };
  D.closeModals = () => window.__eclipse?.presenter.closeModals();
  D.info = () => {
    const e = window.__eclipse;
    return { tip: e.tipText ?? null, hover: e.hoverKey ?? null, title: norm(e.right.infoTitle.text), body: norm(e.right.infoBody.text) };
  };
  D.modalText = () => {
    const parts = [];
    const m = topModal(activeScene());
    if (m) walk(m, (o) => typeof o.text === 'string' && shown(o) && parts.push(norm(o.text)));
    return parts.join(' | ');
  };
  D.stateJson = () => JSON.stringify(window.__eclipse.engine.state);
  D.finalJson = () => {
    const g = phaser().scene.getScene('GameOver').result.game;
    return { state: JSON.stringify(g.state), cmdLog: g.cmdLog };
  };
}

// ---------------------------------------------------------------------------- command line and server

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v = '1'] = a.replace(/^--/, '').split('=');
    return [k, v];
  })
);
const seed = Number(args.seed ?? 1);
const species = args.species ?? 'terran-federation';
const versus = args.versus ?? 'planta';
const speed = args.speed ?? 'instant';
const useMenu = !!args.menu;
const resumeRound = args.resume ? Number(args.resume) : 0;
const doTour = args.tour !== '0';
const tourRound = Number(args['tour-round'] ?? 1);
const doHover = args.hover !== '0';
const docsDir = args.docs ? path.resolve(args.docs) : null;
const docsRound = Number(args['docs-round'] ?? 6);
const quirks = new Set((args.quirks ?? '').split(',').filter(Boolean));
const timeout = Number(args.timeout ?? 900) * 1000;
const out = path.resolve(args.out ?? 'tmp/drive');
const EXE = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
].find((p) => fs.existsSync(p));

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
fs.mkdirSync(out, { recursive: true });

const GPU_ARGS = args.gl === 'swiftshader' ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] : ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const browser = await chromium.launch({ executablePath: EXE, headless: true, args: GPU_ARGS });
const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
await context.addInitScript(installDriver);
const page = await context.newPage();

const problems = [];
page.on('console', (m) => {
  if (m.text().startsWith('Failed to load resource')) return;
  if (m.type() === 'error' || m.type() === 'warning') problems.push(`[${m.type()}] ${m.text()}`);
});
page.on('response', (r) => {
  if (r.status() >= 400) problems.push(`[http ${r.status()}] ${r.url()}`);
});
page.on('pageerror', (e) => problems.push(`[pageerror] ${e.message}\n${e.stack}`));

// ---------------------------------------------------------------------------- helpers

class Stuck extends Error {
  constructor(message, info = {}) {
    super(message);
    this.info = info;
  }
}
class Fatal extends Error {}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const settle = () => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));

async function waitFor(fn, ms = 4000, step = 30) {
  const t0 = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - t0 > ms) return null;
    await sleep(step);
  }
}

// README screenshots (--docs): driver shot name -> stable file name and the part to keep, which is the whole
// canvas ('full'), the frame of the topmost dialog ('modal') or a rectangle of the 1920x1080 game area.
// One shot can feed several files; each file is written once, from the first matching shot of the match.
const AREA = {
  board: { x: 0, y: 56, width: 430, height: 892 },
  sidebar: { x: 1548, y: 56, width: 372, height: 892 },
  prompt: { x: 0, y: 948, width: 1920, height: 132 },
};
const DOC_SHOTS = [
  [/^menu-picked$/, 'menu', 'full'],
  [/^overview-round-1$/, 'game-start', 'full'],
  [/^overview-midgame$/, 'game-midgame', 'full'],
  [/^overview-midgame$/, 'species-board', AREA.board],
  [/^overview-midgame$/, 'sidebar', AREA.sidebar],
  [/^overview-midgame$/, 'prompt-bar', AREA.prompt],
  [/^hover-sector$/, 'sector-info', 'full'],
  [/^colonize-mode$/, 'colony-ships', 'full'],
  [/^place-sector-\d+-orientations$/, 'explore', 'full'],
  [/^build-/, 'build', 'full'],
  [/^move-destinations$/, 'move', 'full'],
  [/^research-dialog$/, 'research', 'modal'],
  [/^upgrade-part-picked$/, 'upgrade', 'modal'],
  [/^trade-dialog$/, 'trade', 'modal'],
  [/^dialog-discovery$/, 'discovery', 'modal'],
  [/^dialog-engage$/, 'engage', 'modal'],
  [/^battle-report$/, 'battle-summary', 'modal'],
  [/^battle-report-round$/, 'battle-round', 'modal'],
  [/^tour-tech-tray$/, 'tech-tray', 'modal'],
  [/^tour-opponent-board$/, 'opponent-board', 'modal'],
  [/^gameover$/, 'game-over', 'full'],
];
const docsDone = new Set();

async function docShots(name, { keepMouse = false } = {}) {
  const rules = DOC_SHOTS.filter(([re, file]) => re.test(name) && !docsDone.has(file));
  if (!docsDir || !rules.length) return;
  // Park the pointer in a corner so that no tooltip, hover highlight or info box ends up in the picture.
  if (!keepMouse) await page.mouse.move(1919, 1079);
  await settle();
  fs.mkdirSync(docsDir, { recursive: true });
  for (const [, file, area] of rules) {
    docsDone.add(file);
    const clip = area === 'full' ? null : area === 'modal' ? await page.evaluate(() => window.__drv.modalBox()) : await page.evaluate((r) => window.__drv.box(r), area);
    await page.screenshot({ path: path.join(docsDir, `${file}.png`), ...(clip ? { clip } : {}) });
  }
}

const shotsTaken = new Set();
async function shot(name, opts) {
  await settle();
  await page.screenshot({ path: path.join(out, `${name}.png`) });
  await docShots(name, opts);
}
async function shotOnce(name, opts) {
  if (shotsTaken.has(name)) return;
  shotsTaken.add(name);
  await shot(name, opts);
}

let mirror = null;
let ai = null;
const snap = () => page.evaluate((n) => window.__drv.snapshot(n), mirror?.cmdLog.length ?? 0);
const buttons = (scope) => page.evaluate((s) => window.__drv.buttons(s), scope);

const clickStats = { n: 0, ms: 0 };
async function clickAt(x, y) {
  const t = Date.now();
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.up();
  await settle();
  clickStats.n += 1;
  clickStats.ms += Date.now() - t;
}

// Presses the first enabled button of a scope whose label matches.
async function press(scope, re, { wait = 1500 } = {}) {
  let list = [];
  const found = await waitFor(async () => {
    list = await buttons(scope);
    return list.find((b) => re.test(b.text));
  }, wait);
  if (!found) throw new Stuck(`no ${scope} button matching ${re}`, { buttons: list.map((b) => b.text) });
  if (!found.enabled) throw new Stuck(`${scope} button "${found.text}" is disabled`, { buttons: list.map((b) => `${b.text}${b.enabled ? '' : ' (disabled)'}`) });
  await clickAt(found.x, found.y);
  return found;
}

async function clickNamed(name, wait = 1500) {
  const at = await waitFor(() => page.evaluate((n) => window.__drv.named(n), name), wait);
  if (!at) throw new Stuck(`nothing named ${name} on screen`, { names: await page.evaluate(() => window.__drv.names()) });
  await clickAt(at.x, at.y);
}

// Clicks a sector (or one Population square of it) once the map has stopped moving.
async function mapClick(key, sq) {
  let prev = null;
  for (let i = 0; i < 50; i++) {
    const m = await page.evaluate(([k, s]) => window.__drv.map(k, s), [key, sq]);
    if (!m) throw new Stuck('the map is not on screen');
    if (!m.inside || !m.visible) {
      await page.evaluate(() => window.__drv.fit());
      await sleep(80);
      prev = null;
      continue;
    }
    if (prev && Math.abs(prev.x - m.x) < 0.5 && Math.abs(prev.y - m.y) < 0.5) {
      await clickAt(m.x, m.y);
      return;
    }
    prev = m;
    await sleep(70);
  }
  throw new Stuck(`sector ${key}${sq === undefined ? '' : ` square ${sq}`} never became clickable`);
}

async function waitModal(title = null) {
  const ok = await waitFor(async () => {
    const s = await snap();
    return s.modals?.length && (!title || s.modals[s.modals.length - 1] === title);
  }, 2500);
  if (!ok) throw new Stuck(`the ${title ?? 'expected'} dialog did not open`);
}

async function closeTopModal() {
  const list = await buttons('modal');
  const b = list.find((x) => /^(Close|Continue|X|Close \(decide later\))$/.test(x.text));
  if (!b) throw new Stuck('cannot close the dialog', { buttons: list.map((x) => x.text) });
  await clickAt(b.x, b.y);
}

const sectorNo = (k) => mirror.state.map[k]?.id;
const sectorTile = (id) => new RegExp(`^Sector ${id}$`);

// ---------------------------------------------------------------------------- executors (one per decision kind)

let toggle = 0;

async function colonize(st, cmd) {
  if (!(await snap()).colonizing) {
    await press('prompt', /^Colony Ships/);
    if (!(await waitFor(async () => (await snap()).colonizing, 1500))) throw new Stuck('Colony Ship mode did not switch on');
    await shotOnce('colonize-mode');
  }
  const same = mirror.freeCommands().filter((c) => c.type === 'colonize' && c.at === cmd.at && c.sq === cmd.sq);
  await mapClick(cmd.at, cmd.sq);
  if (same.length > 1) {
    await waitModal('Which Population track?');
    await shotOnce('colonize-track-dialog');
    await press('modal', new RegExp(`^${RESOURCE_NAMES[cmd.track]}\\b`));
  }
}

async function trade(cmd) {
  await press('prompt', /^Trade resources$/);
  await waitModal('Trade Resources');
  await shotOnce('trade-dialog');
  await press('modal', new RegExp(`^\\d+ ${RESOURCE_NAMES[cmd.from]} \u2192 1 ${RESOURCE_NAMES[cmd.to]}$`));
  await press('modal', /^Close$/);
}

async function placeSector(d, cmd) {
  if (cmd.type === 'discard') return press('prompt', /^Discard$/);
  const places = d.options.filter((o) => o.type === 'place');
  const indexes = [...new Set(places.map((o) => o.index))];
  if (indexes.length > 1) await press('prompt', sectorTile(d.ctx.tiles[cmd.index]));
  const rots = places.filter((o) => o.index === cmd.index).map((o) => o.rot);
  const target = rots.indexOf(cmd.rot);
  for (let i = 0; i <= rots.length; i++) {
    const rot = (await buttons('prompt')).find((b) => /^Rotate/.test(b.text));
    const m = rot && /\((\d+) of (\d+)\)/.exec(rot.text);
    const cur = m ? Number(m[1]) - 1 : 0;
    if (cur === target) break;
    if (!rot || !rot.enabled) throw new Stuck('cannot rotate the sector to the wanted orientation', { target, cur });
    if (i === 0) await mapClick(d.ctx.zone);
    else await clickAt(rot.x, rot.y);
  }
  await shotOnce(`place-sector-${rots.length}-orientations`);
  await press('prompt', /^Place sector$/);
}

async function takeControl(d, cmd) {
  const explore = d.ctx.reason === 'explore';
  if (cmd.type === 'done') return press('prompt', explore ? /^Leave it uncontrolled$/ : /^Done$/);
  if (toggle++ % 2) return mapClick(cmd.to);
  return press('prompt', explore ? /^Take control/ : new RegExp(`^Take sector ${sectorNo(cmd.to)}$`));
}

async function build(cmd) {
  if (cmd.type === 'done') return press('prompt', /^Done building$/);
  await press('prompt', new RegExp(`^${cmd.what[0].toUpperCase()}${cmd.what.slice(1)}\\b`));
  await shotOnce(`build-${cmd.what}`);
  await mapClick(cmd.at);
}

async function move(cmd) {
  if (cmd.type === 'done') return press('prompt', /^Done moving$/);
  const ship = mirror.state.ships.find((s) => s.id === cmd.ship);
  await mapClick(ship.at);
  const typeButton = (await buttons('prompt')).find((b) => new RegExp(`^\\d+ ${shipName(ship.type)}s?$`).test(b.text));
  if (typeButton) await clickAt(typeButton.x, typeButton.y);
  await shotOnce('move-destinations');
  await mapClick(cmd.to);
}

async function influence(cmd) {
  if (cmd.type === 'done') return press('prompt', /^Done$/);
  if (cmd.from === 'track') return mapClick(cmd.to);
  await mapClick(cmd.from);
  await shotOnce('influence-from-sector');
  if (cmd.to === 'track') return press('prompt', /^Return disc to the track$/);
  return mapClick(cmd.to);
}

async function research(cmd) {
  const open = async () => (await page.evaluate(() => window.__drv.names('tech:'))).length > 0;
  if (!(await open())) {
    await press('prompt', /^Open technology list$/);
    if (!(await waitFor(open, 2000))) throw new Stuck('the technology list did not open');
  }
  if (cmd.type === 'done') {
    await press('modal', /^Close \(decide later\)$/);
    return press('prompt', /^Done researching$/);
  }
  await shotOnce('research-dialog');
  await clickNamed(`tech:${cmd.tech}`);
  const picks = mirror.decision.options.filter((o) => o.type === 'research' && o.tech === cmd.tech);
  if (picks.length > 1) {
    await waitModal(`Place ${TECHS[cmd.tech].name}`);
    const list = (await buttons('modal')).filter((b) => b.text !== 'X');
    const i = picks.findIndex((o) => canon(o) === canon(cmd));
    if (!list[i]) throw new Stuck('the track dialog has no button for the wanted track', { buttons: list.map((b) => b.text) });
    await shotOnce('research-track-dialog');
    await clickAt(list[i].x, list[i].y);
  }
}

async function upgrade(cmd) {
  const open = async () => (await page.evaluate(() => window.__drv.names('slot:'))).length > 0;
  if (!(await open())) {
    await press('prompt', /^Open blueprint editor$/);
    if (!(await waitFor(open, 2000))) throw new Stuck('the blueprint editor did not open');
  }
  if (cmd.type === 'done') {
    if (toggle++ % 2) return press('modal', /^Finish upgrading$/);
    await closeFirst();
    return press('prompt', /^Done upgrading$/);
  }
  const target = cmd.place;
  for (const r of cmd.returns.filter((x) => !(target && x.bp === target.bp && x.slot === target.slot))) await clickNamed(`slot:${r.bp}:${r.slot}`);
  if (!target) return press('modal', /^Return marked parts only$/);
  await clickNamed(`part:${target.part}`);
  await shotOnce('upgrade-part-picked');
  await clickNamed(`slot:${target.bp}:${target.slot}`);
}

async function closeFirst() {
  const list = await buttons('modal');
  const b = list.find((x) => x.text === 'X');
  if (b) await clickAt(b.x, b.y);
}

async function ancientPart(cmd) {
  const open = async () => (await page.evaluate(() => window.__drv.names('slot:'))).length > 0;
  if (!(await open())) {
    await press('prompt', /^Open blueprint editor$/);
    if (!(await waitFor(open, 2000))) throw new Stuck('the blueprint editor did not open');
  }
  await shotOnce('ancient-part-dialog');
  if (cmd.type === 'stash') return press('modal', /^Keep it in my stash$/);
  return clickNamed(`slot:${cmd.place.bp}:${cmd.place.slot}`);
}

// Dialog-only decisions (artifact key, ancient tech, muon source, bankruptcy, discovery, battle).
async function dialogChoice(d, cmd) {
  const modalOpen = async () => ((await snap()).modals ?? []).length > 0;
  if (!(await waitFor(modalOpen, 1500))) {
    const free = (await buttons('prompt')).filter((b) => !b.free);
    if (!free.length) throw new Stuck(`no dialog and no prompt button for ${d.kind}`);
    await clickAt(free[0].x, free[0].y);
    if (!(await waitFor(modalOpen, 2000))) throw new Stuck(`the ${d.kind} dialog would not open`);
  }
  await shotOnce(`dialog-${d.kind}`);
  if (d.kind === 'engage') {
    if (cmd.type === 'attack') {
      const again = (await buttons('modal')).find((b) => /do not ask again/.test(b.text));
      if (again && toggle++ % 3 === 0) return clickAt(again.x, again.y);
      return press('modal', /^Attack$/);
    }
    return press('modal', new RegExp(`^Retreat to sector ${sectorNo(cmd.to)}$`));
  }
  const i = d.options.findIndex((o) => canon(o) === canon(cmd));
  const list = (await buttons('modal')).filter((b) => b.text !== 'X');
  if (i < 0 || !list[i]) throw new Stuck(`the ${d.kind} dialog has no button for the wanted option`, { index: i, buttons: list.map((b) => b.text) });
  await clickAt(list[i].x, list[i].y);
}

async function perform(st, d, cmd) {
  if (d.allowFree && cmd.type === 'colonize') return colonize(st, cmd);
  if (d.allowFree && cmd.type === 'trade') return trade(cmd);
  // The map is read by the Colony Ship mode, so leave it before clicking sectors for something else.
  const mapKinds = ['explore', 'placeSector', 'takeControl', 'build', 'move', 'influence'];
  if (mapKinds.includes(d.kind) && (await snap()).colonizing) await press('prompt', /^Stop placing cubes$/);
  switch (d.kind) {
    case 'chooseAction':
      return press('prompt', cmd.type === 'pass' ? /^Pass$/ : new RegExp(`^${ACTION_INFO[cmd.action].label}\\b`));
    case 'chooseReaction':
      return press('prompt', cmd.type === 'pass' ? /^No reaction$/ : new RegExp(`^React: ${ACTION_INFO[cmd.action].label}$`));
    case 'explore':
      return cmd.type === 'done' ? press('prompt', /^Skip exploring$/) : mapClick(cmd.zone);
    case 'placeSector':
      return placeSector(d, cmd);
    case 'takeControl':
      return takeControl(d, cmd);
    case 'build':
      return build(cmd);
    case 'move':
      return move(cmd);
    case 'influence':
      return influence(cmd);
    case 'research':
      return research(cmd);
    case 'upgrade':
      return upgrade(cmd);
    case 'upkeepColonize':
      return press('prompt', /^Done$/);
    case 'ancientPart':
      return ancientPart(cmd);
    default:
      return dialogChoice(d, cmd);
  }
}

// ---------------------------------------------------------------------------- bookkeeping

const answered = {};
const stuck = [];
const diffs = [];
const warnings = [];
let reportsSeen = 0;

function same(a, b) {
  if (canon(a) === canon(b)) return true;
  if (a.type === 'move' && b.type === 'move' && a.to === b.to) {
    const x = mirror.state.ships.find((s) => s.id === a.ship);
    const y = mirror.state.ships.find((s) => s.id === b.ship);
    return !!x && !!y && x.type === y.type && x.at === y.at;
  }
  if (a.type === 'upgrade' && b.type === 'upgrade') {
    const key = (c) => canon({ place: c.place, returns: c.returns.map((r) => `${r.bp}:${r.slot}`).sort() });
    return key(a) === key(b);
  }
  return false;
}

function sync(st) {
  if (st.cmdLen < mirror.cmdLog.length) throw new Fatal(`the browser has fewer commands (${st.cmdLen}) than the mirror (${mirror.cmdLog.length})`);
  for (const cmd of st.cmds ?? []) {
    try {
      mirror.apply(cmd);
    } catch (err) {
      throw new Fatal(`the mirror rejected ${JSON.stringify(cmd)}: ${err.message}`);
    }
  }
  if ((st.decision?.id ?? null) !== (mirror.decision?.id ?? null)) {
    throw new Fatal(`mirror and browser disagree about the decision (${st.decision?.id}/${st.decision?.kind} vs ${mirror.decision?.id}/${mirror.decision?.kind})`);
  }
}

async function recover(err, st, d, cmd) {
  const n = stuck.length + 1;
  const file = `stuck-${String(n).padStart(2, '0')}-${d.kind}.png`;
  await page.screenshot({ path: path.join(out, file) });
  const hits = await page.evaluate(() => window.__drv.hits()).catch(() => null);
  const record = { n, round: st.round, kind: d.kind, cmd, message: err.message, info: err.info, hits, shot: file };
  stuck.push(record);
  console.log(`  STUCK #${n} (round ${st.round}, ${d.kind}): ${err.message}\n    wanted ${canon(cmd)}\n    ${JSON.stringify(err.info)}`);
  const free = d.allowFree && (cmd.type === 'colonize' || cmd.type === 'trade');
  const ok = await page.evaluate(([c, isFree]) => (isFree ? window.__drv.forceFree(c) : window.__drv.forceSubmit(c)), [cmd, free]);
  if (!ok) throw new Fatal(`even the forced command was rejected: ${canon(cmd)}`);
}

let quirkTick = 0;

function chooseCommand(d) {
  if (quirks.has('retreat') && d.kind === 'engage') {
    const retreat = d.options.find((o) => o.type === 'retreat');
    if (retreat) return retreat;
  }
  if (quirks.has('trade') && d.allowFree && d.kind === 'chooseAction' && quirkTick++ % 5 === 0) {
    const trade = mirror.freeCommands().find((c) => c.type === 'trade');
    if (trade) return trade;
  }
  return ai.decide(mirror, d);
}

async function humanStep(st, d) {
  const cmd = chooseCommand(d);
  const key = `${d.kind}/${cmd.type}`;
  answered[key] = (answered[key] ?? 0) + 1;
  try {
    await perform(st, d, cmd);
    const after = await waitFor(async () => {
      const s = await snap();
      return s.cmdLen > st.cmdLen || s.result || s.scenes.includes('GameOver') ? s : null;
    }, 5000, 25);
    if (!after) throw new Stuck('the clicks did not lead to a command');
    if (after.cmds?.length && !same(cmd, after.cmds[0])) diffs.push({ round: st.round, kind: d.kind, wanted: canon(cmd), applied: canon(after.cmds[0]) });
  } catch (err) {
    if (!(err instanceof Stuck)) throw err;
    await recover(err, st, d, cmd);
  }
  const warns = await page.evaluate(() => window.__drv.takeWarns());
  for (const w of warns) warnings.push({ ...w, wanted: canon(cmd) });
}

// Pages through a whole battle report and leaves it on the round page with the most hits (the README picture).
async function pageThroughReport() {
  const find = async (re) => (await buttons('modal')).find((b) => re.test(b.text) && b.enabled);
  const misses = [];
  for (let b = await find(/^Next/); b && misses.length < 12; b = await find(/^Next/)) {
    await clickAt(b.x, b.y);
    misses.push(((await page.evaluate(() => window.__drv.modalText())).match(/No hits/g) ?? []).length);
  }
  for (let at = misses.length - 1; at > misses.indexOf(Math.min(...misses)); at--) {
    const b = await find(/Previous/);
    if (!b) break;
    await clickAt(b.x, b.y);
  }
  await shotOnce('battle-report-round');
}

async function dismissModal(st) {
  const list = await buttons('modal');
  const next = list.find((b) => /^Next/.test(b.text) && b.enabled);
  if (next && reportsSeen < 3) {
    await shotOnce('battle-report');
    await pageThroughReport();
  }
  reportsSeen += 1;
  const cont = (await buttons('modal')).find((b) => /^(Continue|Close|X)$/.test(b.text));
  if (!cont) {
    await page.evaluate(() => window.__drv.closeModals());
    throw new Stuck('could not dismiss a dialog that nobody is waiting for', { buttons: list.map((b) => b.text), modals: st.modals });
  }
  await clickAt(cont.x, cont.y);
}

// ---------------------------------------------------------------------------- one-off exercises

async function hoverSweep(label) {
  const cols = 16;
  const rows = 9;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      await page.mouse.move(((c + 0.5) * 1920) / cols, ((r + 0.5) * 1080) / rows);
      if ((r * cols + c) % 6 === 5) await settle();
    }
  }
  console.log(`  hover sweep (${label}) done`);
}

async function tour() {
  console.log('  top bar / help / tech tray / opponent board tour');
  const scene = (re) => press('scene', re);
  await scene(/^Help$/);
  await waitModal('How to Play');
  await shotOnce('tour-help');
  await press('modal', /^Close$/);
  await scene(/^Tech tray$/);
  await waitModal('Technology Tray');
  await shotOnce('tour-tech-tray');
  await press('modal', /^Close$/);
  await scene(/^Details$/);
  await waitModal();
  await shotOnce('tour-opponent-board');
  await press('modal', /^X$/);
  for (const name of ['Slow', 'Normal', 'Fast']) {
    const b = (await buttons('scene')).find((x) => x.text === name);
    if (!b) throw new Stuck(`no ${name} speed button`);
    await clickAt(b.x, b.y);
  }
  await press('scene', /^Skip reactions: OFF$/);
  await press('scene', /^Skip reactions: ON$/);
  await press('scene', /^Fit view$/);
  const instant = (await buttons('scene')).find((x) => x.text === 'Instant');
  await clickAt(instant.x, instant.y);
  await shotOnce('tour-top-bar');
}

// Overview pictures for the README, at the first action prompt of round 1 and of --docs-round.
async function docOverview(st) {
  if (!docsDir) return;
  if (st.round === 1 && !shotsTaken.has('overview-round-1')) {
    await sleep(2200); // let the opening toasts fade
    await shotOnce('overview-round-1');
  }
  if (st.round >= docsRound && !shotsTaken.has('overview-midgame')) {
    await sleep(2200);
    await shotOnce('overview-midgame');
    await hoverSector(st);
    await tradeShot(st);
  }
}

// Opens the Trade dialog only to photograph it; nothing is traded.
async function tradeShot(st) {
  try {
    await press('prompt', /^Trade resources$/);
    await waitModal('Trade Resources');
    await shotOnce('trade-dialog');
    await press('modal', /^Close$/);
  } catch (err) {
    if (!(err instanceof Stuck)) throw err;
    stuck.push({ n: stuck.length + 1, round: st.round, kind: 'trade-dialog', message: err.message, info: err.info });
    await page.evaluate(() => window.__drv.closeModals());
  }
}

// Pointer over the busiest sector of the human seat: the info box of the right-hand column describes it.
async function hoverSector(st) {
  const counts = {};
  for (const s of mirror.state.ships) if (s.owner === st.human) counts[s.at] = (counts[s.at] ?? 0) + 1;
  const key = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
  const at = key && (await page.evaluate((k) => window.__drv.map(k), key));
  if (!at?.inside || !at.visible) return;
  await page.mouse.move(at.x, at.y);
  await sleep(300);
  // A tooltip left behind by a button that was rebuilt under the pointer would hide the sector description.
  const info = await page.evaluate(() => window.__drv.info());
  if (info.hover !== key || info.tip) problems.push(`[ui] pointer over sector ${key}, but the info box shows "${info.tip ?? info.title}"`);
  await shotOnce('hover-sector', { keepMouse: true });
  await page.mouse.move(1919, 1079);
}

async function resumeCheck() {
  console.log(`  leaving to the menu and resuming the saved game (${mirror.cmdLog.length} commands)`);
  await press('scene', /^Menu$/);
  if (!(await waitFor(async () => (await page.evaluate(() => window.__drv.activeKeys())).includes('Menu'), 5000))) throw new Fatal('the menu did not open');
  await sleep(500);
  await shot('resume-menu');
  const cont = await press('scene', /^Continue saved game/);
  if (!new RegExp(`${mirror.cmdLog.length} moves`).test(cont.text)) throw new Fatal(`the saved game label does not match the game: "${cont.text}"`);
  const back = await waitFor(async () => {
    const s = await snap();
    return s.scenes.includes('Game') && s.pending ? s : null;
  }, 15000);
  if (!back) throw new Fatal('the saved game did not come back');
  const json = await page.evaluate(() => window.__drv.stateJson());
  if (json !== JSON.stringify(mirror.state)) throw new Fatal('the restored game differs from the one that was saved');
  if (back.cmdLen !== mirror.cmdLog.length) throw new Fatal(`the restored game has ${back.cmdLen} commands instead of ${mirror.cmdLog.length}`);
  console.log('  restored game is identical to the live one');
}

async function menuFlow() {
  await page.goto(`${base}?speed=${speed}`);
  if (!(await waitFor(async () => (await page.evaluate(() => window.__drv.activeKeys())).includes('Menu'), 30000, 100))) throw new Fatal('the menu never appeared');
  await sleep(800);
  await shot('menu-start');
  const cards = await page.evaluate(() => window.__drv.cards());
  for (const [side, id] of [
    ['human', species],
    ['rival', versus],
  ]) {
    const c = cards.find((x) => x.side === side && x.id === id);
    if (!c) throw new Fatal(`no ${side} card for ${id}`);
    await clickAt(c.x, c.y);
  }
  const box = await page.evaluate(() => window.__drv.seedBox());
  await clickAt(box.x, box.y);
  await page.keyboard.type(String(seed), { delay: 40 });
  await page.keyboard.press('Enter');
  await shot('menu-picked');
  await press('scene', /^START GAME$/);
}

// ---------------------------------------------------------------------------- main

const t0 = Date.now();
let result = null;
let fatal = null;
try {
  if (useMenu) await menuFlow();
  else await page.goto(`${base}?quick&seed=${seed}&species=${species}&versus=${versus}&speed=${speed}`);
  if (!(await waitFor(() => page.evaluate(() => !!window.__eclipse), 30000, 100))) throw new Fatal('the game scene never started');

  const config = await page.evaluate(() => window.__eclipse.engine.config);
  mirror = new Game({ ...config, options: { ...config.options, events: false } });
  const humanId = await page.evaluate(() => window.__eclipse.humanId);
  ai = createAI('heuristic', humanId, { seed: config.seed });
  console.log(`match: ${config.players.map((p) => p.species).join(' vs ')}, seed ${config.seed}, human seat ${humanId}`);
  console.log(
    'renderer:',
    await page.evaluate(() => {
      const gl = window.__phaser.renderer.gl;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    })
  );

  let toured = !doTour;
  let swept = !doHover;
  let resumed = !resumeRound;
  let lastProgress = Date.now();
  let lastLen = -1;
  let lastReport = Date.now();

  for (;;) {
    if (Date.now() - t0 > timeout) throw new Fatal(`the match did not finish within ${timeout / 1000}s`);
    const st = await snap();
    if (st.result || st.scenes.includes('GameOver')) break;
    if (!st.scenes.includes('Game') || st.cmdLen === undefined) {
      await sleep(100);
      continue;
    }
    sync(st);
    if (st.cmdLen !== lastLen) {
      lastLen = st.cmdLen;
      lastProgress = Date.now();
    }
    if (Date.now() - lastProgress > 60000) throw new Fatal(`no progress for 60 s (decision ${st.decision?.kind}, pending ${st.pending}, modals ${JSON.stringify(st.modals)})`);
    if (Date.now() - lastReport > 15000) {
      lastReport = Date.now();
      console.log(`  round ${st.round} ${st.phase}: ${st.cmdLen} commands, ${Object.values(answered).reduce((a, b) => a + b, 0)} answered by clicks, ${stuck.length} stuck`);
    }

    const d = mirror.decision;
    if (st.modals.length && !st.pending) {
      try {
        await dismissModal(st);
      } catch (err) {
        if (!(err instanceof Stuck)) throw err;
        stuck.push({ n: stuck.length + 1, round: st.round, kind: 'modal', message: err.message, info: err.info });
        console.log(`  STUCK: ${err.message}`);
      }
      continue;
    }
    if (!d) {
      await sleep(60);
      continue;
    }
    if (!st.awaitingHuman || !st.pending || d.playerId !== st.human) {
      await sleep(40);
      continue;
    }

    if (d.kind === 'chooseAction' && st.modals.length === 0) {
      await docOverview(st);
      if (!toured && st.round >= tourRound) {
        toured = true;
        await tour();
        lastProgress = Date.now();
        continue;
      }
      if (!swept) {
        swept = true;
        await hoverSweep('round 1');
        lastProgress = Date.now();
        continue;
      }
      if (!resumed && st.round >= resumeRound) {
        resumed = true;
        await resumeCheck();
        lastProgress = Date.now();
        continue;
      }
    }
    await humanStep(st, d);
  }

  // Final comparison between the browser and the mirror.
  await sleep(300);
  result = await page.evaluate(() => window.__eclipseResult ?? null);
  const fin = await page.evaluate(() => window.__drv.finalJson());
  for (const cmd of fin.cmdLog.slice(mirror.cmdLog.length)) mirror.apply(cmd);
  if (fin.state !== JSON.stringify(mirror.state)) throw new Fatal('the final game state of the browser differs from the mirror');
  console.log('final state of the browser matches the mirror');
  await shot('gameover');
  if (doHover) await hoverSweep('game over');
  for (const name of ['Main menu']) {
    await press('scene', new RegExp(`^${name}$`));
    if (!(await waitFor(async () => (await page.evaluate(() => window.__drv.activeKeys())).includes('Menu'), 5000))) throw new Fatal('Main menu did not lead to the menu');
  }
  console.log('Game over -> Main menu works');
} catch (err) {
  fatal = err;
  try {
    await page.screenshot({ path: path.join(out, 'fatal.png') });
  } catch {
    // the page may already be gone
  }
}

// ---------------------------------------------------------------------------- report

const total = Object.values(answered).reduce((a, b) => a + b, 0);
console.log('\n==== UI drive report ====');
console.log(`time: ${Math.round((Date.now() - t0) / 1000)} s, decisions answered by mouse: ${total}, mouse clicks: ${clickStats.n} (${Math.round(clickStats.ms / Math.max(1, clickStats.n))} ms each)`);
console.log(
  Object.entries(answered)
    .sort()
    .map(([k, v]) => `${k}=${v}`)
    .join('  ')
);
console.log('result:', JSON.stringify(result));
console.log(`stuck (the UI could not do what the AI wanted): ${stuck.length}`);
for (const s of stuck.slice(0, 20)) console.log(`  #${s.n} round ${s.round} ${s.kind}: ${s.message} ${JSON.stringify(s.info ?? {})} ${s.shot ?? ''}`);
console.log(`diffs (the UI applied another legal command): ${diffs.length}`);
for (const x of diffs.slice(0, 15)) console.log(`  round ${x.round} ${x.kind}: wanted ${x.wanted}\n    applied ${x.applied}`);
const byText = {};
for (const w of warnings) byText[`${w.kind}: ${w.text}`] = (byText[`${w.kind}: ${w.text}`] ?? 0) + 1;
console.log(`UI warnings shown to the player: ${warnings.length}`);
for (const [k, v] of Object.entries(byText)) console.log(`  ${v}x ${k}`);
console.log(`console problems: ${problems.length}`);
for (const p of problems.slice(0, 30)) console.log(`  ${p}`);
if (fatal) console.log(`\nFATAL: ${fatal.message}\n${fatal instanceof Fatal ? '' : fatal.stack}`);

await browser.close();
await server?.close();
process.exit(fatal || stuck.length || problems.length ? 1 : 0);
