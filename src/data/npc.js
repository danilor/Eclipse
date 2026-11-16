// Non-player ships (basic Blueprint Tiles). They always defend and never retreat.

export const NPC_BLUEPRINTS = {
  ancient: { name: 'Ancient', dice: { yellow: 2 }, computer: 1, shield: 0, hull: 1, init: 1, missiles: {} },
  guardian: { name: 'Guardian', dice: { yellow: 3 }, computer: 2, shield: 0, hull: 2, init: 3, missiles: {} },
  gcds: { name: 'Galactic Center Defense System', dice: { yellow: 4 }, computer: 2, shield: 0, hull: 7, init: 0, missiles: {} },
};
