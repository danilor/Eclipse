import Phaser from 'phaser';
import { COLORS, HEX, RECT } from '../config.js';
import { hexToPixel, parseKey, pixelToHex, key as hexKey, rotateEdges } from '../core/hex.js';
import { SECTORS } from '../data/sectors.js';
import { Button, clamp } from './kit.js';
import {
  ORB_SQ,
  SQ,
  buildTileBase,
  buildTileOverlay,
  drawHexOutline,
  overlaySignature,
  squareCenter,
} from './tileArt.js';

const MIN_ZOOM = 0.3;
const MAX_ZOOM = 1.6;
const DRAG_THRESHOLD = 6;

// The pannable, zoomable galaxy map. All interaction is hit-tested by hand (no interactive map objects)
// so thousands of redraws never have to re-register input handlers.
export class MapView extends Phaser.Events.EventEmitter {
  constructor(scene, game) {
    super();
    this.scene = scene;
    this.game = game;
    const m = RECT.map;
    this.rect = m;
    this.world = scene.add.container(m.x + m.w / 2, m.y + m.h / 2).setDepth(0);
    this.tileLayer = scene.add.container(0, 0);
    this.hiGfx = scene.add.graphics();
    this.ghostLayer = scene.add.container(0, 0);
    this.fxLayer = scene.add.container(0, 0);
    this.world.add([this.tileLayer, this.hiGfx, this.ghostLayer, this.fxLayer]);

    this.tiles = new Map();
    this.ready = false;
    this.highlights = [];
    this.squareTargets = [];
    this.ghost = null;
    this.userMoved = false;
    this.hoverKey = undefined;
    this.drag = null;
    this.tween = null;

    scene.tweens.add({ targets: this.hiGfx, alpha: { from: 1, to: 0.45 }, duration: 650, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    this.bindInput();

    this.fitButton = new Button(scene, m.x + 12, m.y + 12, 74, 32, 'Fit view', () => this.fit(true, true), { size: 15, tip: 'Show the whole galaxy (drag to pan, wheel to zoom)' });
    this.fitButton.setDepth(150);
  }

  // ------------------------------------------------------------------ coordinates

  get scale() {
    return this.world.scaleX;
  }

  inside(p) {
    const m = this.rect;
    return p.x >= m.x && p.x < m.x + m.w && p.y >= m.y && p.y < m.y + m.h;
  }

  toLocal(p) {
    return { x: (p.x - this.world.x) / this.scale, y: (p.y - this.world.y) / this.scale };
  }

  keyAt(p) {
    const l = this.toLocal(p);
    const h = pixelToHex(l.x, l.y, HEX);
    return { key: hexKey(h.q, h.r), local: l, hex: h };
  }

  tilePixel(k) {
    return hexToPixel(parseKey(k), HEX);
  }

  // Centre of a sector in screen coordinates (for effects drawn outside the world).
  screenPos(k) {
    const p = this.tilePixel(k);
    return { x: this.world.x + p.x * this.scale, y: this.world.y + p.y * this.scale };
  }

  // Centre of a Population square (index or 'orb') of sector k in screen coordinates.
  squarePos(k, sq) {
    const def = SECTORS[this.game.state.map[k].id];
    const c = sq === 'orb' ? ORB_SQ : squareCenter(def, sq);
    const p = this.screenPos(k);
    return { x: p.x + c.x * this.scale, y: p.y + c.y * this.scale };
  }

  get blocked() {
    return !!this.scene.modals && this.scene.modals.size > 0;
  }

  // ------------------------------------------------------------------ input

  bindInput() {
    const input = this.scene.input;
    input.on('pointerdown', (p, over) => {
      if (this.blocked || over.length || !this.inside(p)) return;
      this.drag = { x: p.x, y: p.y, wx: this.world.x, wy: this.world.y, moved: false };
    });
    input.on('pointermove', (p) => {
      if (this.drag) {
        const dx = p.x - this.drag.x;
        const dy = p.y - this.drag.y;
        if (!this.drag.moved && Math.hypot(dx, dy) > DRAG_THRESHOLD) this.drag.moved = true;
        if (this.drag.moved) {
          this.stopTween();
          this.world.x = this.drag.wx + dx;
          this.world.y = this.drag.wy + dy;
          this.userMoved = true;
        }
        return;
      }
      if (this.blocked || !this.inside(p)) {
        this.setHover(null);
        return;
      }
      this.setHover(this.keyAt(p).key);
    });
    input.on('pointerup', (p, over) => {
      const d = this.drag;
      this.drag = null;
      if (!d || d.moved || this.blocked || !this.inside(p)) return;
      const hit = this.keyAt(p);
      this.emit('click', hit.key, hit.local);
    });
    input.on('wheel', (p, over, dx, dy) => {
      if (this.blocked || !this.inside(p)) return;
      this.zoomAt(p, Math.pow(1.0014, -dy));
    });
  }

  setHover(k) {
    if (k === this.hoverKey) return;
    this.hoverKey = k;
    this.emit('hover', k && this.game.state.map[k] ? k : null);
  }

  zoomAt(p, factor) {
    this.stopTween();
    const old = this.scale;
    const next = clamp(old * factor, MIN_ZOOM, MAX_ZOOM);
    if (next === old) return;
    const l = this.toLocal(p);
    this.world.setScale(next);
    this.world.x = p.x - l.x * next;
    this.world.y = p.y - l.y * next;
    this.userMoved = true;
  }

  stopTween() {
    this.tween?.stop();
    this.tween = null;
  }

  // ------------------------------------------------------------------ view

  boundsKeys() {
    const keys = new Set([...Object.keys(this.game.state.map), ...this.highlights.map((h) => h.key)]);
    if (this.ghost) keys.add(this.ghost.key);
    return [...keys];
  }

  fit(animate = true, force = false) {
    const keys = this.boundsKeys();
    if (!keys.length) return;
    let x0 = Infinity;
    let x1 = -Infinity;
    let y0 = Infinity;
    let y1 = -Infinity;
    for (const k of keys) {
      const p = this.tilePixel(k);
      x0 = Math.min(x0, p.x - HEX);
      x1 = Math.max(x1, p.x + HEX);
      y0 = Math.min(y0, p.y - HEX * 0.87);
      y1 = Math.max(y1, p.y + HEX * 0.87);
    }
    const m = this.rect;
    const scale = clamp(Math.min((m.w - 30) / (x1 - x0), (m.h - 30) / (y1 - y0)), MIN_ZOOM, 1.05);
    const target = { x: m.x + m.w / 2 - ((x0 + x1) / 2) * scale, y: m.y + m.h / 2 - ((y0 + y1) / 2) * scale, scale };
    if (force) this.userMoved = false;
    this.stopTween();
    if (!animate) {
      this.world.setPosition(target.x, target.y).setScale(scale);
      return;
    }
    this.tween = this.scene.tweens.add({
      targets: this.world,
      x: target.x,
      y: target.y,
      scaleX: scale,
      scaleY: scale,
      duration: 320,
      ease: 'Cubic.easeOut',
    });
  }

  // True when the sector lies fully inside the viewport.
  isVisible(k) {
    const s = this.screenPos(k);
    const m = this.rect;
    const r = HEX * this.scale * 0.6;
    return s.x - r >= m.x && s.x + r <= m.x + m.w && s.y - r >= m.y && s.y + r <= m.y + m.h;
  }

  // ------------------------------------------------------------------ tiles

  createTile(tile, animate) {
    const p = this.tilePixel(tile.key);
    const box = this.scene.add.container(p.x, p.y);
    box.add(buildTileBase(this.scene, tile));
    this.tileLayer.add(box);
    if (animate) {
      box.setScale(0.55).setAlpha(0);
      this.scene.tweens.add({ targets: box, scale: 1, alpha: 1, duration: 360, ease: 'Back.easeOut' });
    }
    const entry = { box, dyn: null, sig: null };
    this.tiles.set(tile.key, entry);
    return entry;
  }

  refresh() {
    const s = this.game.state;
    const added = [];
    for (const [k, tile] of Object.entries(s.map)) {
      let e = this.tiles.get(k);
      if (!e) {
        e = this.createTile(tile, this.ready);
        added.push(k);
      }
      const sig = overlaySignature(s, tile);
      if (sig !== e.sig) {
        e.dyn?.destroy();
        e.dyn = buildTileOverlay(this.scene, s, tile);
        e.box.add(e.dyn);
        e.sig = sig;
      }
    }
    if (added.length) {
      if (!this.userMoved) this.fit(this.ready);
      else if (added.some((k) => !this.isVisible(k))) this.fit(true);
    }
    this.ready = true;
    this.drawHighlights();
  }

  // ------------------------------------------------------------------ highlights

  // entries: [{ key, color, kind: 'select' | 'zone' | 'origin' }]
  setHighlights(entries) {
    this.highlights = entries || [];
    this.drawHighlights();
  }

  setSquareTargets(list) {
    this.squareTargets = list || [];
    this.drawHighlights();
  }

  drawHighlights() {
    const g = this.hiGfx;
    g.clear();
    for (const h of this.highlights) {
      const at = this.tilePixel(h.key);
      const color = h.color ?? COLORS.highlight;
      if (h.kind === 'zone') {
        drawHexOutline(g, color, { width: 3, fillAlpha: 0.08, alpha: 0.9, at, inset: 6 });
        g.lineStyle(4, color, 0.9);
        g.lineBetween(at.x - 18, at.y, at.x + 18, at.y);
        g.lineBetween(at.x, at.y - 18, at.x, at.y + 18);
      } else if (h.kind === 'origin') {
        drawHexOutline(g, color, { width: 5, fillAlpha: 0.1, alpha: 1, at });
      } else {
        drawHexOutline(g, color, { width: 5, fillAlpha: 0.16, alpha: 1, at });
      }
    }
    for (const t of this.squareTargets) {
      const at = this.tilePixel(t.at);
      const def = SECTORS[this.game.state.map[t.at].id];
      const c = squareCenter(def, t.sq);
      if (!c) continue;
      g.lineStyle(4, COLORS.highlight, 1);
      g.strokeRoundedRect(at.x + c.x - SQ / 2 - 4, at.y + c.y - SQ / 2 - 4, SQ + 8, SQ + 8, 9);
      g.fillStyle(COLORS.highlight, 0.28);
      g.fillRoundedRect(at.x + c.x - SQ / 2 - 4, at.y + c.y - SQ / 2 - 4, SQ + 8, SQ + 8, 9);
    }
  }

  // Square (index or 'orb') of tile k closest to a local pointer position, within the hit radius.
  squareAt(k, local) {
    const tile = this.game.state.map[k];
    if (!tile) return null;
    const def = SECTORS[tile.id];
    const p = this.tilePixel(k);
    const rx = local.x - p.x;
    const ry = local.y - p.y;
    const candidates = def.squares.map((_, i) => i);
    if (tile.orbital) candidates.push('orb');
    let best = null;
    let bestD = Infinity;
    for (const sq of candidates) {
      const c = sq === 'orb' ? ORB_SQ : squareCenter(def, sq);
      const d = Math.max(Math.abs(rx - c.x), Math.abs(ry - c.y));
      if (d <= SQ / 2 + 4 && d < bestD) {
        best = sq;
        bestD = d;
      }
    }
    return best;
  }

  // ------------------------------------------------------------------ ghost tile (sector placement preview)

  setGhost(zone, id, rot) {
    this.ghostLayer.removeAll(true);
    this.ghost = null;
    if (zone && id) {
      const def = SECTORS[id];
      const p = this.tilePixel(zone);
      const box = this.scene.add.container(p.x, p.y);
      box.add(buildTileBase(this.scene, { id, wh: rotateEdges(def.wormholes, rot), key: zone }));
      box.setAlpha(0.92);
      this.ghostLayer.add(box);
      this.ghost = { key: zone, id, rot };
    }
    this.drawHighlights();
  }

  // ------------------------------------------------------------------ effects

  flash(k, color = COLORS.gold, duration = 900) {
    if (!this.game.state.map[k]) return;
    const g = this.scene.add.graphics();
    const at = this.tilePixel(k);
    drawHexOutline(g, color, { width: 8, fillAlpha: 0.3, alpha: 1, at, inset: 1 });
    this.fxLayer.add(g);
    this.scene.tweens.add({ targets: g, alpha: 0, duration, ease: 'Quad.easeIn', onComplete: () => g.destroy() });
  }

  destroy() {
    this.world.destroy();
    this.fitButton.destroy();
    this.removeAllListeners();
  }
}
