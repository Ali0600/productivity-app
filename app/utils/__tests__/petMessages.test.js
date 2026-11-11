import { reactionFor } from '../petMessages';

const PET = { name: 'Mochi', tricks: ['hop', 'spin'] };
const snack = (nth, s = '🍓') => ({ type: 'snack', nth, snack: s, at: nth });

describe('reactionFor', () => {
  test('nothing happened → no reaction', () => {
    expect(reactionFor([], PET)).toBeNull();
    expect(reactionFor(undefined, PET)).toBeNull();
  });

  test('hatching comes first, then the very first snack', () => {
    const r = reactionFor([{ type: 'hatch' }, snack(1, '🍙')], PET);
    expect(r.actions).toEqual([{ type: 'hatch' }, { type: 'eat', snack: '🍙' }]);
    expect(r.message).toBe('It hatched! Say hi to Mochi 💖');
    expect(r.haptic).toBe('success');
  });

  test('a new trick is shown off right after the snack that earned it', () => {
    const r = reactionFor([snack(1), { type: 'trick', trick: 'wiggle' }], PET);
    expect(r.actions).toEqual([
      { type: 'eat', snack: '🍓' },
      { type: 'trick', trick: 'wiggle' },
    ]);
    expect(r.message).toBe('New trick: Wiggle! Tap Mochi to see it again.');
    expect(r.haptic).toBe('medium');
  });

  test('a full belly shows off a trick it already knows', () => {
    const r = reactionFor([snack(3), { type: 'full' }], PET, 1);
    expect(r.actions[1]).toEqual({ type: 'trick', trick: 'spin' });
    expect(r.message).toBe('Full belly! 💗');
  });

  test('a full belly with no tricks yet just cheers', () => {
    const r = reactionFor([snack(3), { type: 'full' }], { name: 'Mochi', tricks: [] });
    expect(r.actions[1]).toEqual({ type: 'cheer' });
  });

  test('growing up outranks a gift and a full belly in the same batch', () => {
    const r = reactionFor(
      [
        snack(3),
        { type: 'full' },
        { type: 'gift', treasure: 'shell' },
        { type: 'stage', stage: 'kid' },
      ],
      PET
    );
    expect(r.message).toBe('Mochi grew into a Kid! 🌱');
    expect(r.haptic).toBe('success');
  });

  test('a gift names what was found', () => {
    expect(reactionFor([snack(1), { type: 'gift', treasure: 'shell' }], PET).message).toBe(
      'Mochi found a 🐚 Seashell!'
    );
    expect(
      reactionFor([snack(1), { type: 'gift', treasure: 'gem', encore: true }], PET).message
    ).toBe('Encore! Mochi found a 💎 Shiny gem!');
  });

  test('a plain snack eats it and rotates its line', () => {
    const lines = new Set([0, 1, 2, 3].map((v) => reactionFor([snack(1, '🧁')], PET, v).message));
    expect(lines.size).toBe(4);
    for (const line of lines) expect(line).toContain('🧁');
    expect(reactionFor([snack(1, '🧁')], PET).actions).toEqual([{ type: 'eat', snack: '🧁' }]);
  });

  test('a burst of snacks (a backup import) is one summary, not a flood', () => {
    const r = reactionFor([snack(1), snack(2), snack(3), snack(4), snack(5)], PET);
    expect(r.actions).toHaveLength(1);
    expect(r.message).toBe('5 snacks! Mochi is stuffed.');
  });

  test('waking after a long break brings the souvenir up', () => {
    const r = reactionFor(
      [
        { type: 'wake', days: 9 },
        { type: 'welcome', treasure: 'dream-cloud' },
      ],
      PET
    );
    expect(r.actions).toEqual([{ type: 'wake' }, { type: 'cheer' }]);
    expect(r.message).toBe('Welcome back! Mochi dreamt up a ☁️ Pocket cloud.');
  });

  test('a plain wake plays the stretch silently', () => {
    expect(reactionFor([{ type: 'wake', days: 3 }], PET)).toEqual({
      actions: [{ type: 'wake' }],
      message: null,
      haptic: null,
    });
  });

  test('calm mode never plays the nap-and-yawn', () => {
    const calm = { ...PET, calm: true };
    expect(reactionFor([{ type: 'wake', days: 3 }], calm)).toBeNull();
    const welcome = reactionFor(
      [
        { type: 'wake', days: 9 },
        { type: 'welcome', treasure: 'dream-cloud' },
      ],
      calm
    );
    expect(welcome.actions).toEqual([{ type: 'cheer' }]);
    expect(welcome.message).toBe('Welcome back! Mochi dreamt up a ☁️ Pocket cloud.');
  });

  test('a cozy week is celebrated on its own', () => {
    expect(reactionFor([{ type: 'cozy', weeks: 4 }], PET).message).toBe('Cozy week! 4 so far.');
  });

  test('no reaction line blames the user', () => {
    const banned = /forg[eo]t|skipp|miss(ed)? you|\bsad\b|hungry|starv|neglect|fail|broke/i;
    const batches = [
      [snack(1)],
      [{ type: 'hatch' }, snack(1)],
      [snack(1), { type: 'trick', trick: 'hop' }],
      [snack(3), { type: 'full' }],
      [snack(1), { type: 'gift', treasure: 'sock' }],
      [snack(1), { type: 'stage', stage: 'teen' }],
      [snack(1), { type: 'season', room: 'seaside' }],
      [
        { type: 'wake', days: 9 },
        { type: 'welcome', treasure: 'dream-moon' },
      ],
      [{ type: 'cozy', weeks: 1 }],
      [snack(1), snack(2), snack(3), snack(4)],
    ];
    for (const batch of batches) {
      for (let v = 0; v < 4; v += 1) {
        expect(reactionFor(batch, PET, v)?.message ?? '').not.toMatch(banned);
      }
    }
  });
});
