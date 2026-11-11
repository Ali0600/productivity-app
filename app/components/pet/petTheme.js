/**
 * Pet colour palettes and room themes. Pure data with no React, so pet logic,
 * pickers and tests can import it without pulling in any UI code.
 */

// Bodies are soft pastels, which read as light shapes on the app's dark indigo
// gradient; `ink` (eyes and mouth) stays dark enough to read on the body itself.
// `top` -> `bottom` is the body's vertical gradient, `belly` the lighter tummy
// patch, `cheek` the blush (and tongue), and `accent` a deeper shade of the same
// hue for small details such as egg spots and the reduced-motion glow.
export const PET_PALETTES = {
  peach: {
    top: '#ffe3cf',
    bottom: '#ffb894',
    belly: '#fff5ec',
    cheek: '#ff8fa3',
    ink: '#3b2731',
    accent: '#f4946b',
  },
  mint: {
    top: '#d4fae6',
    bottom: '#8fe3b8',
    belly: '#f1fff7',
    cheek: '#ff9db4',
    ink: '#1f3633',
    accent: '#3fbf86',
  },
  lavender: {
    top: '#ebe4ff',
    bottom: '#bba9f7',
    belly: '#f8f5ff',
    cheek: '#ff9fca',
    ink: '#2c2546',
    accent: '#8f7ae6',
  },
  sky: {
    top: '#dcefff',
    bottom: '#9fcbf5',
    belly: '#f3f9ff',
    cheek: '#ffa3bd',
    ink: '#1d2d44',
    accent: '#5e9fe0',
  },
  lemon: {
    top: '#fff6cc',
    bottom: '#ffd97a',
    belly: '#fffbeb',
    cheek: '#ffa08f',
    ink: '#3b2f1e',
    accent: '#e6b23c',
  },
  rose: {
    top: '#ffe0ec',
    bottom: '#f7a6c6',
    belly: '#fff3f8',
    cheek: '#ff6f9e',
    ink: '#3e2232',
    accent: '#e06a9b',
  },
};

export const DEFAULT_PET_COLOR = 'peach';

// Dusky, night-friendly rooms that sit inside a dark glass card: no daytime
// white anywhere. `sky` runs top -> horizon. PetRoom places `decor` in the
// corners in the order top-left, bottom-right, top-right, bottom-left, so the
// 2nd and 4th entries sit on the ground and the 1st and 3rd in the sky.
// Every emoji is Unicode 13 or older, so none renders as a blank box on older iOS.
export const ROOM_THEMES = {
  nest: {
    label: 'Cosy Nest',
    sky: ['#2b2035', '#3d2c33'],
    ground: '#57402f',
    decor: ['🪶', '🍂', '🌙', '🌾'],
  },
  nursery: {
    label: 'Nursery',
    sky: ['#211f45', '#332a57'],
    ground: '#433a6b',
    decor: ['🌙', '🧸', '⭐'],
  },
  garden: {
    label: 'Garden',
    sky: ['#162a36', '#1d3a36'],
    ground: '#2d5a40',
    decor: ['🐝', '🌷', '🦋', '🌿'],
  },
  treehouse: {
    label: 'Treehouse',
    sky: ['#1b2638', '#2a3330'],
    ground: '#5b4030',
    decor: ['🏮', '🪵', '🍃'],
  },
  meadow: {
    label: 'Meadow',
    sky: ['#1e2c48', '#2a3f3d'],
    ground: '#355c3c',
    decor: ['🦋', '🌼', '✨', '🍀'],
  },
  seaside: {
    label: 'Seaside',
    sky: ['#11273f', '#1b3c58'],
    ground: '#5a5470',
    decor: ['🌙', '🐚', '⭐', '🦀'],
  },
  starlight: {
    label: 'Starlight',
    sky: ['#0c1029', '#1d1846'],
    ground: '#272456',
    decor: ['⭐', '🔭', '🌙', '✨'],
  },
  snowfall: {
    label: 'Snowfall',
    sky: ['#18233d', '#2a3657'],
    ground: '#5f6d90',
    decor: ['❄️', '⛄', '🌨️'],
  },
  blossom: {
    label: 'Blossom',
    sky: ['#2a1d3b', '#3f2546'],
    ground: '#5a3a5c',
    decor: ['🌸', '🍡', '💮'],
  },
  harvest: {
    label: 'Harvest',
    sky: ['#2b1f30', '#40292a'],
    ground: '#5e4329',
    decor: ['🍂', '🎃', '🌙', '🍎'],
  },
  aurora: {
    label: 'Aurora',
    sky: ['#0d2433', '#271f4d'],
    ground: '#1e2f4f',
    decor: ['✨', '🏔️', '🌌'],
  },
};
