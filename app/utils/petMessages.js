// How the pet reacts to a batch of pet events: which animations to play (in
// order) and the one line worth saying. Pure, so the priorities are testable.

import { STAGES, treasureByKey, trickByKey } from './pet';

const capitalize = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const find = (events, type) => events.find((e) => e.type === type);
const findLast = (events, type) => [...events].reverse().find((e) => e.type === type);

const SNACK_LINES = [
  (s) => `Nom! ${s}`,
  (s) => `Yum, ${s}!`,
  (s) => `Munch munch ${s}`,
  (s) => `${s} so good!`,
];

/**
 * @param {Array<object>} events one batch from the pet engine
 * @param {{ name: string, tricks?: string[] }} pet
 * @param {number} [variant] any integer; rotates snack lines and picks a known trick
 * @returns {{ actions: Array<object>, message: string|null, haptic: 'success'|'medium'|null }|null}
 */
export const reactionFor = (events, pet, variant = 0) => {
  if (!Array.isArray(events) || events.length === 0) return null;
  const name = pet?.name ?? 'Your pet';
  const known = pet?.tricks ?? [];
  const snacks = events.filter((e) => e.type === 'snack');
  const lastSnack = snacks[snacks.length - 1];
  const eat = lastSnack ? [{ type: 'eat', snack: lastSnack.snack }] : [];

  if (find(events, 'hatch')) {
    return {
      actions: [{ type: 'hatch' }, ...eat],
      message: `It hatched! Say hi to ${name} 💖`,
      haptic: 'success',
    };
  }

  const welcome = find(events, 'welcome');
  if (welcome) {
    const t = treasureByKey(welcome.treasure);
    return {
      // Calm mode promises no napping, so no yawn-and-stretch either.
      actions: pet?.calm ? [{ type: 'cheer' }] : [{ type: 'wake' }, { type: 'cheer' }],
      message: t ? `Welcome back! ${name} dreamt up a ${t.emoji} ${t.label}.` : 'Welcome back!',
      haptic: 'success',
    };
  }

  const stage = findLast(events, 'stage');
  if (stage) {
    const label = STAGES.find((s) => s.key === stage.stage)?.label ?? stage.stage;
    return {
      actions: [...eat, { type: 'cheer' }],
      message: `${name} grew into a ${label}! 🌱`,
      haptic: 'success',
    };
  }

  const season = findLast(events, 'season');
  if (season) {
    return {
      actions: [...eat, { type: 'cheer' }],
      message: `A new room: ${capitalize(season.room)}!`,
      haptic: 'success',
    };
  }

  const trick = findLast(events, 'trick');
  if (trick) {
    const t = trickByKey(trick.trick);
    return {
      actions: [...eat, { type: 'trick', trick: trick.trick }],
      message: `New trick: ${t?.label ?? trick.trick}! Tap ${name} to see it again.`,
      haptic: 'medium',
    };
  }

  const gift = findLast(events, 'gift');
  if (gift) {
    const t = treasureByKey(gift.treasure);
    return {
      actions: [...eat, { type: 'cheer' }],
      message: t ? `${gift.encore ? 'Encore! ' : ''}${name} found a ${t.emoji} ${t.label}!` : null,
      haptic: 'medium',
    };
  }

  if (find(events, 'full')) {
    const showOff = known.length > 0 ? known[Math.abs(variant) % known.length] : null;
    return {
      actions: [...eat, showOff ? { type: 'trick', trick: showOff } : { type: 'cheer' }],
      message: 'Full belly! 💗',
      haptic: 'medium',
    };
  }

  if (snacks.length > 3) {
    return { actions: eat, message: `${snacks.length} snacks! ${name} is stuffed.`, haptic: null };
  }
  if (lastSnack) {
    const line = SNACK_LINES[Math.abs(variant) % SNACK_LINES.length];
    return { actions: eat, message: line(lastSnack.snack), haptic: null };
  }

  const cozy = findLast(events, 'cozy');
  if (cozy) {
    return {
      actions: [{ type: 'cheer' }],
      message: `Cozy week! ${cozy.weeks} so far.`,
      haptic: null,
    };
  }

  if (find(events, 'wake') && !pet?.calm) {
    return { actions: [{ type: 'wake' }], message: null, haptic: null };
  }
  return null;
};
