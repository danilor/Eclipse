import { COLORS } from '../config.js';
import { TECHS } from '../data/techs.js';
import { ownerColor } from './battleReport.js';
import { toast } from './kit.js';
import { ACTION_INFO, shipName } from './names.js';
import { speedMs } from './settings.js';

const BUILD_NAMES = { orbital: 'an Orbital', monolith: 'a Monolith' };

// Short-lived banners and sector flashes that make the opponent's moves easy to follow.
export class Effects {
  constructor(scene, view, humanId) {
    this.scene = scene;
    this.view = view;
    this.humanId = humanId;
  }

  play(events, state) {
    const ms = speedMs();
    if (ms <= 0 || !events.length) return;
    const duration = Math.max(1400, ms * 3.2);
    let row = 0;
    const banner = (text, color = COLORS.text) => {
      if (row >= 3) return;
      toast(this.scene, text, { y: 100 + row * 34, color, duration, size: 20 });
      row += 1;
    };
    const who = (pid) => state.players[pid].name;
    const tint = (pid) => ownerColor(state, pid);
    const flash = (k, color, d = ms * 2.2) => this.view.flash(k, color, Math.max(500, d));

    for (const e of events) {
      switch (e.type) {
        case 'action':
          if (e.pid !== this.humanId) banner(`${who(e.pid)}: ${ACTION_INFO[e.action].label}${e.reaction ? ' (reaction)' : ''}`, tint(e.pid));
          break;
        case 'pass':
          if (e.pid !== this.humanId) banner(`${who(e.pid)} passes`, tint(e.pid));
          break;
        case 'explore':
          flash(e.zone, COLORS.gold);
          break;
        case 'sectorPlaced':
          flash(e.at, COLORS.gold);
          break;
        case 'controlChanged': {
          const owner = state.map[e.at]?.controller;
          flash(e.at, owner == null ? COLORS.dim : tint(owner));
          break;
        }
        case 'colonize':
          flash(e.at, tint(e.pid), ms);
          break;
        case 'build':
          flash(e.at, tint(e.pid));
          if (e.pid !== this.humanId) banner(`${who(e.pid)} builds ${BUILD_NAMES[e.what] ?? `a ${shipName(e.what)}`}`, tint(e.pid));
          break;
        case 'move':
          flash(e.from, COLORS.dim, ms * 1.5);
          flash(e.to, tint(e.pid));
          break;
        case 'influence':
          if (e.cmd?.from && e.cmd.from !== 'track') flash(e.cmd.from, COLORS.dim, ms * 1.5);
          if (e.cmd?.to && e.cmd.to !== 'track') flash(e.cmd.to, tint(e.pid));
          break;
        case 'research':
          if (e.pid !== this.humanId) banner(`${who(e.pid)} researches ${TECHS[e.tech].name}`, tint(e.pid));
          break;
        case 'upgrade':
          if (e.pid !== this.humanId) banner(`${who(e.pid)} upgrades a ship blueprint`, tint(e.pid));
          break;
        case 'battleStart':
          flash(e.at, COLORS.danger, ms * 4);
          banner(`Battle in sector ${state.map[e.at]?.id ?? '?'}`, COLORS.danger);
          break;
        case 'discovery':
          flash(e.at, COLORS.gold);
          if (e.pid !== this.humanId) banner(`${who(e.pid)} finds a Discovery Tile`, tint(e.pid));
          break;
        default:
          break;
      }
    }
  }
}
