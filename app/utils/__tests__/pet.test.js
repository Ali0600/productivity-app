import {
  advancePet,
  collectCompletions,
  createPet,
  dayDiff,
  DEFAULT_PET_COLOR,
  DEFAULT_PET_NAME,
  DREAM_SOUVENIRS,
  FULL_AT,
  choosePet,
  helpingStats,
  MAX_NAME_LENGTH,
  moodFor,
  needsWake,
  normalizePet,
  placeholderTiles,
  recolorPet,
  renamePet,
  roomFor,
  snacksOn,
  stageFor,
  statusLine,
  TREASURES,
  TRICK_HEAD_START,
  TRICKS,
  trickView,
  wakePet,
  weekDiary,
} from '../pet';
import { dayKey } from '../dayKey';

// Monday 2 November 2026, 09:00 local. The diary's weeks start on Monday.
const T0 = new Date(2026, 10, 2, 9, 0).getTime();

const at = (dayOffset, hour = 10, minute = 0) => {
  const d = new Date(2026, 10, 2, hour, minute);
  d.setDate(d.getDate() + dayOffset);
  return d.getTime();
};

/** A mainLists tree with one side list holding `tasks` = [{ id, ats: [ms] }]. */
const tree = (tasks) => [
  {
    name: 'Home',
    sideLists: [
      {
        listName: 'Today',
        tasks: tasks.map((t) => ({
          id: t.id,
          taskName: t.name ?? t.id,
          completions: t.ats.map((a) => ({ at: a })),
        })),
      },
    ],
  },
];

const minutesFrom = (start, n) => Array.from({ length: n }, (_, i) => start + (i + 1) * 60000);
const dailyTask = (days) => ({ id: 'daily', ats: Array.from({ length: days }, (_, i) => at(i)) });
const fedOn = (offset) =>
  advancePet(createPet(T0), tree([{ id: 'a', ats: [at(offset)] }]), at(offset, 11)).pet;
const types = (events, ...keep) => events.filter((e) => keep.includes(e.type)).map((e) => e.type);

describe('hatching and snacks', () => {
  test('a new pet is an egg; completions from before adoption never count', () => {
    const egg = createPet(T0);
    expect(stageFor(egg).key).toBe('egg');
    const { pet, events } = advancePet(egg, tree([{ id: 'a', ats: [T0 - 60000] }]), T0 + 1000);
    expect(pet.snacks).toBe(0);
    expect(events).toEqual([]);
  });

  test('the first completion after adoption hatches the egg', () => {
    const lists = tree([{ id: 'a', ats: [T0 - 60000, at(0, 10)] }]);
    const { pet, events } = advancePet(createPet(T0), lists, at(0, 11));
    expect(types(events, 'hatch', 'snack', 'stage')).toEqual(['hatch', 'snack']);
    expect(stageFor(pet).key).toBe('baby');
    expect(pet).toMatchObject({ snacks: 1, careDays: 1, hatchedAt: at(0, 10) });
  });

  test('replaying the same log changes nothing and returns the same object', () => {
    const lists = tree([{ id: 'a', ats: [at(0, 10), at(0, 11)] }]);
    const first = advancePet(createPet(T0), lists, at(0, 12)).pet;
    const again = advancePet(first, lists, at(0, 12));
    expect(again.pet).toBe(first);
    expect(again.events).toEqual([]);
  });

  test('deleting a completed task later never takes its snacks back', () => {
    const both = tree([
      { id: 'a', ats: [at(0, 10)] },
      { id: 'b', ats: [at(0, 11)] },
    ]);
    const p1 = advancePet(createPet(T0), both, at(0, 12)).pet;
    const p2 = advancePet(p1, tree([{ id: 'b', ats: [at(0, 11)] }]), at(0, 13)).pet;
    expect(p2).toBe(p1);
    expect(p2.snacks).toBe(2);
  });

  test('completions are taken in time order, whatever order the lists are in', () => {
    const lists = tree([
      { id: 'late', ats: [at(0, 15)] },
      { id: 'early', ats: [at(0, 9, 30)] },
    ]);
    const first = advancePet(createPet(T0), lists, at(0, 16));
    expect(first.events.filter((e) => e.type === 'snack').map((e) => e.at)).toEqual([
      at(0, 9, 30),
      at(0, 15),
    ]);
    expect(advancePet(first.pet, lists, at(0, 16)).pet).toBe(first.pet);
  });

  test('every list in every main list feeds the same pet', () => {
    const lists = [
      ...tree([{ id: 'a', ats: [at(0, 10)] }]),
      {
        name: 'Work',
        sideLists: [{ listName: 'Inbox', tasks: [{ id: 'w', completions: [{ at: at(0, 11) }] }] }],
      },
    ];
    expect(advancePet(createPet(T0), lists, at(0, 12)).pet.snacks).toBe(2);
  });

  test('the third snack of a day fills the belly, and only the third', () => {
    const lists = tree([{ id: 'a', ats: [at(0, 10), at(0, 11), at(0, 12), at(0, 13)] }]);
    const { pet, events } = advancePet(createPet(T0), lists, at(0, 14));
    expect(events.filter((e) => e.type === 'snack').map((e) => e.nth)).toEqual([1, 2, 3, 4]);
    expect(events.filter((e) => e.type === 'full')).toHaveLength(1);
    expect(events.find((e) => e.type === 'full').at).toBe(at(0, 12));
    expect(moodFor(pet, at(0, 15))).toBe('full');
  });

  test('a far-future completion waits for its time instead of freezing the pet', () => {
    const future = at(30);
    const p1 = advancePet(
      createPet(T0),
      tree([
        { id: 'f', ats: [future] },
        { id: 'a', ats: [at(0)] },
      ]),
      at(0, 11)
    ).pet;
    expect(p1.snacks).toBe(1);
    expect(p1.watermark).toBe(at(0));
    const p2 = advancePet(
      p1,
      tree([
        { id: 'f', ats: [future] },
        { id: 'a', ats: [at(0)] },
        { id: 'b', ats: [at(1)] },
      ]),
      at(1, 11)
    ).pet;
    expect(p2.snacks).toBe(2);
  });

  test('reads completion stamps rehydrated as strings or Dates', () => {
    const lists = [
      {
        name: 'Home',
        sideLists: [
          {
            listName: 'Today',
            tasks: [
              {
                id: 'a',
                completions: [{ at: new Date(at(0)).toISOString() }, { at: new Date(at(0, 11)) }],
              },
            ],
          },
        ],
      },
    ];
    expect(collectCompletions(lists, T0, at(0, 12)).map((c) => c.at)).toEqual([at(0), at(0, 11)]);
  });

  test('a late-night snack belongs to that day, not the next', () => {
    const pet = advancePet(
      createPet(T0),
      tree([{ id: 'a', ats: [at(0, 23, 59)] }]),
      at(1, 0, 1)
    ).pet;
    expect(snacksOn(pet, at(0, 12))).toBe(1);
    expect(snacksOn(pet, at(1, 0, 5))).toBe(0);
    expect(moodFor(pet, at(1, 0, 5))).toBe('peckish');
  });
});

describe('growth', () => {
  test('stages follow care days: kid at 7, teen at 21, grown-up at 60, a new room every 30 after', () => {
    const { pet, events } = advancePet(createPet(T0), tree([dailyTask(91)]), at(91, 9));
    expect(events.filter((e) => e.type === 'stage').map((e) => e.stage)).toEqual([
      'kid',
      'teen',
      'adult',
    ]);
    expect(events.filter((e) => e.type === 'season').map((e) => e.room)).toEqual(['seaside']);
    expect(pet.careDays).toBe(91);
    expect(roomFor(pet)).toBe('seaside');
  });

  test.each([
    [1, 'baby', 'nursery'],
    [6, 'baby', 'nursery'],
    [7, 'kid', 'garden'],
    [20, 'kid', 'garden'],
    [21, 'teen', 'treehouse'],
    [59, 'teen', 'treehouse'],
    [60, 'adult', 'meadow'],
    [89, 'adult', 'meadow'],
    [90, 'adult', 'seaside'],
    [120, 'adult', 'starlight'],
  ])('%i care days → %s in the %s', (days, stage, room) => {
    const { pet } = advancePet(createPet(T0), tree([dailyTask(days)]), at(days, 9));
    expect(stageFor(pet).key).toBe(stage);
    expect(roomFor(pet)).toBe(room);
  });

  test('several snacks on one day are one care day', () => {
    const lists = tree([{ id: 'a', ats: minutesFrom(at(0), 9) }]);
    expect(advancePet(createPet(T0), lists, at(0, 12)).pet.careDays).toBe(1);
  });

  test('a long gap pauses growth and never reverses it', () => {
    const lists = tree([dailyTask(8)]);
    const grown = advancePet(createPet(T0), lists, at(8, 9)).pet;
    expect(stageFor(grown).key).toBe('kid');
    const later = advancePet(grown, lists, at(80, 9)).pet;
    expect(stageFor(later).key).toBe('kid');
    expect(later.careDays).toBe(8);
  });
});

describe('tricks', () => {
  test('a bar starts with 2 of 12 filled, so the 10th snack teaches the first trick', () => {
    const egg = createPet(T0);
    expect(trickView(egg)).toMatchObject({ filled: 2, slots: 12, remaining: 10 });
    const nine = advancePet(egg, tree([{ id: 'a', ats: minutesFrom(at(0), 9) }]), at(0, 12));
    expect(types(nine.events, 'trick')).toEqual([]);
    expect(trickView(nine.pet).remaining).toBe(1);
    const ten = advancePet(nine.pet, tree([{ id: 'a', ats: minutesFrom(at(0), 10) }]), at(0, 12));
    expect(ten.events.filter((e) => e.type === 'trick').map((e) => e.trick)).toEqual(['hop']);
    expect(ten.pet.tricks).toEqual(['hop']);
    expect(trickView(ten.pet).filled).toBe(TRICK_HEAD_START);
  });

  test('tricks are learned in order, then each full bar becomes an encore gift', () => {
    const n = 10 * TRICKS.length + 10;
    const lists = tree([{ id: 'a', ats: minutesFrom(T0, n) }]);
    const { pet, events } = advancePet(createPet(T0), lists, T0 + (n + 2) * 60000);
    expect(pet.tricks).toEqual(TRICKS.map((t) => t.key));
    expect(events.filter((e) => e.type === 'gift' && e.encore)).toHaveLength(1);
    expect(trickView(pet).next).toBeNull();
  });
});

describe('surprise gifts', () => {
  test('at most one surprise gift a day, however many tasks get done', () => {
    const lists = tree([{ id: 'a', ats: minutesFrom(at(0), 40) }]);
    const { events } = advancePet(createPet(T0), lists, at(0, 12));
    expect(events.filter((e) => e.type === 'gift' && !e.encore)).toHaveLength(1);
  });

  test('the same log always gives the same gifts', () => {
    const ats = [];
    for (let d = 0; d < 20; d += 1) for (let k = 0; k < 3; k += 1) ats.push(at(d, 8 + k));
    const lists = tree([{ id: 'a', ats }]);
    const a = advancePet(createPet(T0), lists, at(20, 9)).pet;
    const b = advancePet(createPet(T0), lists, at(20, 9)).pet;
    expect(a.treasures).toEqual(b.treasures);
  });

  test('gifts never repeat until every treasure has been found', () => {
    const ats = [];
    for (let d = 0; d < 20; d += 1) for (let k = 0; k < 3; k += 1) ats.push(at(d, 8 + k));
    const { pet, events } = advancePet(createPet(T0), tree([{ id: 'a', ats }]), at(20, 9));
    const gifts = events.filter((e) => e.type === 'gift');
    expect(gifts.length).toBeGreaterThan(0);
    expect(gifts.length).toBeLessThan(TREASURES.length);
    expect(Object.keys(pet.treasures)).toHaveLength(gifts.length);
    expect(Object.values(pet.treasures).every((t) => t.count === 1)).toBe(true);
  });
});

describe('placeholderTiles', () => {
  test.each([
    [7, 23, ['?', '?', '?', '?', '+19']],
    [0, 30, ['?', '?', '?', '?', '?', '+25']],
    [6, 24, ['?', '?', '?', '?', '?', '+19']],
    [28, 2, ['?', '?']],
    [29, 1, ['?']],
    [30, 0, []],
  ])('%i found, %i to go → %j', (found, unfound, expected) => {
    const tiles = placeholderTiles(found, unfound, 6);
    expect(tiles).toEqual(expected);
    // The tiles always account for exactly what is left to find.
    const accounted = tiles.reduce((n, t) => n + (t === '?' ? 1 : Number(t.slice(1))), 0);
    expect(accounted).toBe(unfound);
    expect((found + tiles.length) % 6 === 0 || tiles.length === unfound).toBe(true);
  });
});

describe('moods', () => {
  test('each day starts peckish; one empty day stays peckish; two empty days → napping', () => {
    const pet = fedOn(0);
    expect(moodFor(pet, at(0, 12))).toBe('fed');
    expect(moodFor(pet, at(1, 8))).toBe('peckish');
    expect(moodFor(pet, at(2, 8))).toBe('peckish');
    expect(moodFor(pet, at(3, 8))).toBe('napping');
  });

  test('one task wakes it straight back up to fed', () => {
    const lists = tree([{ id: 'a', ats: [at(0), at(5, 9)] }]);
    const back = advancePet(fedOn(0), lists, at(5, 9, 1)).pet;
    expect(moodFor(back, at(5, 10))).toBe('fed');
  });

  test('calm mode never dips below content', () => {
    const pet = { ...fedOn(0), calm: true };
    expect(moodFor(pet, at(1, 8))).toBe('fed');
    expect(moodFor(pet, at(9, 8))).toBe('fed');
  });

  test('FULL_AT snacks make a full belly', () => {
    const lists = tree([{ id: 'a', ats: minutesFrom(at(0), FULL_AT) }]);
    expect(moodFor(advancePet(createPet(T0), lists, at(0, 12)).pet, at(0, 13))).toBe('full');
  });
});

describe('waking up after a break', () => {
  test('the first look after a nap wakes it once, with a plain-time greeting', () => {
    const pet = fedOn(0);
    const now = at(3, 9);
    expect(needsWake(pet, now)).toBe(true);
    expect(statusLine(pet, now)).toBe('Mochi is napping.');
    const { pet: awake, events } = wakePet(pet, now);
    expect(events).toEqual([{ type: 'wake', days: 3 }]);
    expect(moodFor(awake, now)).toBe('peckish');
    expect(statusLine(awake, now)).toBe('3 days! Mochi napped like a champion.');
    expect(wakePet(awake, now).pet).toBe(awake);
    expect(needsWake(awake, at(4, 9))).toBe(false);
  });

  test('after 7+ empty days it brings a dream souvenir and a 2-slot head start, once', () => {
    const pet = fedOn(0);
    const { pet: awake, events } = wakePet(pet, at(9, 9));
    const welcome = events.find((e) => e.type === 'welcome');
    expect(DREAM_SOUVENIRS.map((d) => d.key)).toContain(welcome.treasure);
    expect(awake.treasures[welcome.treasure].count).toBe(1);
    expect(awake.trickProgress).toBe(pet.trickProgress + 2);
    expect(wakePet(awake, at(10, 9)).events).toEqual([]);
  });

  test('the head start never finishes a trick bar on its own', () => {
    const pet = { ...fedOn(0), trickProgress: 11 };
    const { pet: awake } = wakePet(pet, at(9, 9));
    expect(awake.trickProgress).toBe(11);
    expect(awake.tricks).toEqual(pet.tricks);
  });

  test('a short break brings no souvenir', () => {
    expect(types(wakePet(fedOn(0), at(3, 9)).events, 'welcome')).toEqual([]);
  });

  test('a new snack starts a new nap cycle, so the next long break greets again', () => {
    const first = wakePet(fedOn(0), at(9, 9)).pet;
    const fedAgain = advancePet(first, tree([{ id: 'a', ats: [at(0), at(9, 10)] }]), at(9, 11)).pet;
    expect(types(wakePet(fedAgain, at(20, 9)).events, 'wake', 'welcome')).toEqual([
      'wake',
      'welcome',
    ]);
  });
});

describe('weekly diary and cozy weeks', () => {
  test('the first two empty days of a week are rest days, later ones are just open', () => {
    const lists = tree([{ id: 'a', ats: [at(0), at(4)] }]);
    const { pet } = advancePet(createPet(T0), lists, at(4, 11));
    expect(weekDiary(pet, at(5, 9)).map((d) => d.status)).toEqual([
      'care',
      'rest',
      'rest',
      'open',
      'care',
      'today',
      'future',
    ]);
  });

  test('days as an egg are onboarding, not missed days', () => {
    const lists = tree([{ id: 'a', ats: [at(3), at(4)] }]);
    const { pet } = advancePet(createPet(T0), lists, at(4, 11));
    expect(weekDiary(pet, at(5, 9)).map((d) => d.status)).toEqual([
      'before',
      'before',
      'before',
      'care',
      'care',
      'today',
      'future',
    ]);
  });

  test('an egg week is never a cozy week; the hatch week is judged from the hatch', () => {
    const lists = tree([{ id: 'a', ats: [7, 8, 9, 10, 11, 12, 13].map((d) => at(d)) }]);
    const { pet } = advancePet(createPet(T0), lists, at(14, 9));
    expect(pet.cozyWeeks).toBe(1);
  });

  test('days before adoption are not held against anything', () => {
    const { pet } = advancePet(createPet(at(3, 9)), tree([{ id: 'a', ats: [at(3)] }]), at(3, 11));
    expect(weekDiary(pet, at(4, 9)).map((d) => d.status)).toEqual([
      'before',
      'before',
      'before',
      'care',
      'today',
      'future',
      'future',
    ]);
  });

  test('a finished week with at most two empty days is a cozy week, counted once', () => {
    const lists = tree([{ id: 'a', ats: [0, 1, 2, 3, 4].map((d) => at(d)) }]);
    const r1 = advancePet(createPet(T0), lists, at(4, 11));
    expect(r1.pet.cozyWeeks).toBe(0);
    const r2 = advancePet(r1.pet, lists, at(7, 9));
    expect(r2.pet.cozyWeeks).toBe(1);
    expect(r2.events).toEqual([{ type: 'cozy', weeks: 1 }]);
    const r3 = advancePet(r2.pet, lists, at(8, 9));
    expect(r3.pet).toBe(r2.pet);
  });

  test('three empty days in a week is not a cozy week, and costs nothing else', () => {
    const lists = tree([{ id: 'a', ats: [0, 1, 2, 3].map((d) => at(d)) }]);
    const { pet } = advancePet(createPet(T0), lists, at(7, 9));
    expect(pet.cozyWeeks).toBe(0);
    expect(pet.careDays).toBe(4);
  });

  test('a week is still judged when the app reopens months later', () => {
    const lists = tree([{ id: 'a', ats: [0, 1, 2, 3, 4, 5].map((d) => at(d)) }]);
    const r1 = advancePet(createPet(T0), lists, at(5, 11));
    const r2 = advancePet(r1.pet, lists, at(7 * 15, 9));
    expect(r2.pet.cozyWeeks).toBe(1);
  });

  test('per-day counts older than 70 days before the last snack are pruned; totals stay', () => {
    const { pet } = advancePet(createPet(T0), tree([dailyTask(100)]), at(200, 9));
    const keys = Object.keys(pet.days);
    expect(keys).toHaveLength(71); // days 29..99: the 70 days before the last snack, and its day
    expect(keys).toContain(dayKey(at(99)));
    expect(keys).not.toContain(dayKey(at(28)));
    expect(pet.careDays).toBe(100);
    expect(pet.snacks).toBe(100);
  });
});

describe('status lines', () => {
  test('the egg invites the first task', () => {
    expect(statusLine(createPet(T0), T0)).toBe('Finish any task to hatch your egg.');
  });

  test('a fed pet says what it had, with no task-for-reward countdown', () => {
    expect(statusLine(fedOn(0), at(0, 12))).toBe('Mochi had a snack today.');
    const two = advancePet(createPet(T0), tree([{ id: 'a', ats: [at(0), at(0, 11)] }]), at(0, 12));
    expect(statusLine(two.pet, at(0, 13))).toBe('Mochi had 2 snacks today.');
  });

  test('the nap greeting is for the day of waking only, never a running count', () => {
    const awake = wakePet(fedOn(0), at(3, 9)).pet;
    expect(statusLine(awake, at(3, 21))).toBe('3 days! Mochi napped like a champion.');
    for (let d = 4; d <= 45; d += 1) {
      expect(statusLine(awake, at(d, 9))).not.toMatch(/\d+ days!/);
      expect(moodFor(awake, at(d, 9))).toBe('peckish');
    }
  });

  test('calm mode greets once, then is simply content', () => {
    const calm = { ...fedOn(0), calm: true };
    expect(statusLine(calm, at(5, 9))).toBe('Mochi is content.');
    const awake = wakePet(calm, at(5, 9)).pet;
    expect(statusLine(awake, at(5, 10))).toBe('Welcome back! Mochi is happy to see you.');
    expect(statusLine(awake, at(6, 9))).toBe('Mochi is content.');
  });

  test('a rest day is named as one', () => {
    expect(statusLine(fedOn(0), at(2, 9))).toBe('Rest day used, nothing lost. Mochi is peckish.');
  });

  test('no line ever blames the user', () => {
    const banned =
      /forg[eo]t|skipp|miss(ed)? you|\bsad\b|hungry|starv|neglect|fail|broke|lost (your|the) streak/i;
    const pet = fedOn(0);
    for (let d = 0; d < 14; d += 1) {
      const now = at(d, 9);
      for (const p of [pet, wakePet(pet, now).pet, { ...pet, calm: true }]) {
        expect(statusLine(p, now)).not.toMatch(banned);
      }
    }
  });
});

describe('normalizePet', () => {
  test('bad fields fall back one by one instead of resetting the pet', () => {
    const raw = {
      name: '  Bean   Sprout  ',
      color: 'neon',
      adoptedAt: T0,
      hatchedAt: T0 + 5,
      snacks: NaN,
      careDays: 12.7,
      tricks: ['spin', 'moonwalk', 'hop'],
      treasures: { shell: { count: 2, firstAt: T0 }, bogus: { count: 1 } },
      days: { [dayKey(at(0))]: 3, 'not-a-day': 4, [dayKey(at(1))]: -2 },
      trickProgress: 12,
      calm: 'yes',
    };
    const pet = normalizePet(raw, T0 + 10);
    expect(pet).toMatchObject({
      name: 'Bean Sprout',
      color: DEFAULT_PET_COLOR,
      snacks: 0,
      careDays: 12,
      tricks: ['hop', 'spin'],
      days: { [dayKey(at(0))]: 3 },
      trickProgress: 11,
      calm: false,
      hatchedAt: T0 + 5,
    });
    expect(Object.keys(pet.treasures)).toEqual(['shell']);
  });

  test('a watermark ahead of the clock is pulled back, so feeding cannot freeze', () => {
    const pet = normalizePet({ ...createPet(T0), watermark: T0 + 30 * 86400000 }, T0);
    expect(pet.watermark).toBe(T0 - 10 * 60000);
  });

  test('a bad baseline is dropped, so it is simply retaken', () => {
    expect(
      normalizePet({ baseline: { days: 3, completions: 1, activeDays: 9 } }, T0).baseline
    ).toBeNull();
    expect(
      normalizePet({ baseline: { days: NaN, completions: 1, activeDays: 1 } }, T0).baseline
    ).toBeNull();
    expect(
      normalizePet({ baseline: { days: 28, completions: 14, activeDays: 14 } }, T0).baseline
    ).toEqual({ days: 28, completions: 14, activeDays: 14 });
  });

  test('non-records are rejected so the caller decides what to do', () => {
    expect(normalizePet(null, T0)).toBeNull();
    expect(normalizePet('pet', T0)).toBeNull();
    expect(normalizePet([1, 2], T0)).toBeNull();
  });

  test('round-trips through JSON unchanged', () => {
    const lists = tree([dailyTask(12)]);
    const pet = wakePet(advancePet(createPet(T0), lists, at(12, 9)).pet, at(20, 9)).pet;
    expect(normalizePet(JSON.parse(JSON.stringify(pet)), at(20, 9))).toEqual(pet);
  });
});

describe('rename and recolour', () => {
  test('names are trimmed, capped and never emptied', () => {
    const pet = createPet(T0);
    expect(renamePet(pet, '  Pudding ').name).toBe('Pudding');
    expect(renamePet(pet, 'x'.repeat(80)).name).toHaveLength(MAX_NAME_LENGTH);
    expect(renamePet(pet, '   ')).toBe(pet);
    expect(renamePet(pet, DEFAULT_PET_NAME)).toBe(pet);
  });

  test('only known colours are accepted', () => {
    const pet = createPet(T0);
    expect(recolorPet(pet, 'mint').color).toBe('mint');
    expect(recolorPet(pet, 'chartreuse')).toBe(pet);
  });
});

describe('helpingStats', () => {
  // One task every evening, before and after the pet arrives at 20:00.
  const evenings = (fromDay, toDay) =>
    Array.from({ length: toDay - fromDay + 1 }, (_, i) => at(fromDay + i, 21));

  test('compares tasks a day and active days a week, before vs since', () => {
    const adopted = at(28, 9);
    const before = Array.from({ length: 14 }, (_, i) => at(i * 2));
    const since = Array.from({ length: 14 }, (_, i) => at(28 + Math.floor(i / 2), 10 + (i % 2)));
    const lists = tree([{ id: 'a', ats: [...before, ...since] }]);
    const pet = advancePet(createPet(adopted), lists, at(35, 9)).pet;
    const s = helpingStats(pet, at(35, 9));
    expect(s.ready).toBe(true);
    expect(s.before).toEqual({ days: 28, perDay: 0.5, activePerWeek: 3.5 });
    expect(s.since).toEqual({ days: 7, perDay: 2, activePerWeek: 7 });
  });

  test('the same habit reads the same before and since, whatever the hour you look', () => {
    const lists = tree([{ id: 'h', ats: [...evenings(-28, -1), ...evenings(0, 8)] }]);
    const pet = advancePet(createPet(at(0, 20)), lists, at(8, 22)).pet;
    for (const now of [at(8, 8, 30), at(8, 22)]) {
      const s = helpingStats(pet, now);
      expect(s.before).toEqual({ days: 28, perDay: 1, activePerWeek: 7 });
      expect(s.since).toEqual({ days: 8, perDay: 1, activePerWeek: 7 });
    }
  });

  test('a short history gives a short baseline, not one diluted over 28 days', () => {
    const lists = tree([{ id: 'h', ats: [...evenings(-10, -1), ...evenings(0, 7)] }]);
    const pet = advancePet(createPet(at(0, 20)), lists, at(8, 9)).pet;
    expect(helpingStats(pet, at(8, 9)).before).toEqual({ days: 10, perDay: 1, activePerWeek: 7 });
  });

  test('deleting tasks later never shrinks the baseline', () => {
    const full = tree([
      { id: 'old', ats: evenings(-28, -1) },
      { id: 'new', ats: evenings(0, 9) },
    ]);
    const pet = advancePet(createPet(at(0, 20)), full, at(10, 9)).pet;
    const trimmed = advancePet(pet, tree([{ id: 'new', ats: evenings(0, 9) }]), at(10, 9)).pet;
    expect(trimmed.baseline).toEqual(pet.baseline);
    expect(helpingStats(trimmed, at(10, 9)).before.perDay).toBe(1);
  });

  test('no history before the pet gives no baseline, not a fake zero', () => {
    const pet = advancePet(createPet(at(0, 9)), tree([{ id: 'a', ats: [at(1)] }]), at(3, 9)).pet;
    const s = helpingStats(pet, at(3, 9));
    expect(s.before).toBeNull();
    expect(s.ready).toBe(false);
  });

  test('the baseline waits while the lists failed to load (empty), instead of locking in nothing', () => {
    const pet = advancePet(createPet(T0), [], at(1, 9)).pet;
    expect(pet.baseline).toBeNull();
  });
});

describe('waking straight into a task', () => {
  test('a task finished before anyone saw the nap still wakes it, gift and all', () => {
    const pet = fedOn(0);
    const lists = tree([{ id: 'a', ats: [at(0), at(10, 9)] }]);
    const { pet: next, events } = advancePet(pet, lists, at(10, 9, 5));
    expect(types(events, 'wake', 'welcome', 'snack')).toEqual(['wake', 'welcome', 'snack']);
    const souvenir = events.find((e) => e.type === 'welcome').treasure;
    expect(next.treasures[souvenir].count).toBe(1);
    expect(next.trickProgress).toBe(pet.trickProgress + 2 + 1);
    expect(moodFor(next, at(10, 10))).toBe('fed');
  });

  test('a short gap does not invent a wake', () => {
    const lists = tree([{ id: 'a', ats: [at(0), at(2)] }]);
    expect(types(advancePet(fedOn(0), lists, at(2, 11)).events, 'wake')).toEqual([]);
  });
});

describe('thresholds the docs promise', () => {
  test('about 18% of completions bring a surprise gift when the daily cap does not bind', () => {
    const lists = tree([{ id: 'g', ats: Array.from({ length: 1000 }, (_, i) => at(i, 12)) }]);
    const { events } = advancePet(createPet(T0), lists, at(1000, 9));
    const rate = events.filter((e) => e.type === 'gift' && !e.encore).length / 1000;
    expect(rate).toBeGreaterThan(0.15);
    expect(rate).toBeLessThan(0.21);
  });

  test('the welcome-back gift starts at exactly 7 empty days', () => {
    expect(types(wakePet(fedOn(0), at(7, 9)).events, 'welcome')).toEqual([]);
    expect(types(wakePet(fedOn(0), at(8, 9)).events, 'welcome')).toEqual(['welcome']);
  });

  test('a completion up to 10 minutes ahead of the clock counts; further ahead waits', () => {
    const now = at(0, 12);
    const near = advancePet(createPet(T0), tree([{ id: 'a', ats: [now + 5 * 60000] }]), now);
    const far = advancePet(createPet(T0), tree([{ id: 'a', ats: [now + 20 * 60000] }]), now);
    expect(near.pet.snacks).toBe(1);
    expect(far.pet.snacks).toBe(0);
  });
});

describe('clock and time-zone changes', () => {
  const everyDay = (days) =>
    tree([{ id: 'a', ats: Array.from({ length: days }, (_, i) => at(i)) }]);

  test('a time-zone move never judges the current week early', () => {
    const lists = everyDay(21); // Monday 2 Nov to Sunday 22 Nov
    const wednesday = advancePet(createPet(T0), lists, at(9, 9)).pet;
    expect(wednesday.cozyWeeks).toBe(1);
    // The same pointer as an instant written five hours ahead (London): Sunday 19:00 here.
    const moved = { ...wednesday, cozyCheckedThrough: wednesday.cozyCheckedThrough - 5 * 3600000 };
    const sameDay = advancePet(moved, lists, at(9, 10)).pet;
    expect(sameDay.cozyWeeks).toBe(1);
    expect(advancePet(sameDay, lists, at(21, 9)).pet.cozyWeeks).toBe(3);
  });

  test('one launch with the date set far ahead neither wipes today nor stops cozy weeks', () => {
    const tenDays = tree([
      {
        id: 'a',
        ats: [...Array.from({ length: 9 }, (_, i) => at(i)), at(9, 8), at(9, 9), at(9, 10)],
      },
    ]);
    const real = advancePet(createPet(T0), tenDays, at(9, 12)).pet;
    const future = advancePet(real, tenDays, at(400, 12)).pet;
    const back = advancePet(future, tenDays, at(9, 13)).pet;
    expect(snacksOn(back, at(9, 13))).toBe(3);
    expect(moodFor(back, at(9, 13))).toBe('full');
    expect(advancePet(back, everyDay(14), at(14, 9)).pet.cozyWeeks).toBe(2);
  });

  test('an egg made while the clock read a year ahead catches up once the clock is right', () => {
    const egg = createPet(at(400));
    const settled = advancePet(egg, everyDay(0), at(0, 9)).pet;
    const pet = advancePet(settled, everyDay(21), at(21, 9)).pet;
    expect(pet.snacks).toBe(21);
    expect(pet.cozyWeeks).toBe(3);
    expect(helpingStats(pet, at(21, 9)).ready).toBe(true);
  });

  test('a hatch stamped while the clock ran ahead still lets cozy weeks count', () => {
    const fast = advancePet(createPet(T0), tree([{ id: 'a', ats: [at(30)] }]), at(30, 11)).pet;
    const lists = tree([
      { id: 'a', ats: [at(30)] },
      { id: 'b', ats: Array.from({ length: 12 }, (_, i) => at(2 + i)) },
    ]);
    const settled = advancePet(fast, lists, at(2, 9)).pet;
    expect(advancePet(settled, lists, at(14, 9)).pet.cozyWeeks).toBe(2);
  });

  test('a clock set back mid-session never freezes feeding, nor swallows the next task', () => {
    const fast = advancePet(createPet(T0), tree([{ id: 'a', ats: [at(2, 10)] }]), at(2, 11)).pet;
    const lists = tree([
      { id: 'a', ats: [at(2, 10)] },
      { id: 'b', ats: [at(0, 12)] },
    ]);
    const back = advancePet(fast, lists, at(0, 12) + 1000).pet;
    expect(back.snacks).toBe(2);
  });
});

describe('choosePet (backup import)', () => {
  const grown = (careDays, snacks) => ({ ...createPet(T0), careDays, snacks, hatchedAt: T0 });

  test('an older backup never rolls the pet back', () => {
    const current = grown(62, 240);
    expect(choosePet(current, grown(10, 31))).toBe(current);
  });

  test('restoring onto a fresh install brings the pet home', () => {
    const backup = grown(30, 90);
    expect(choosePet(createPet(T0), backup)).toBe(backup);
  });

  test('a tie goes to the backup; a missing side yields the other', () => {
    const a = grown(5, 9);
    const b = grown(5, 9);
    expect(choosePet(a, b)).toBe(b);
    expect(choosePet(a, null)).toBe(a);
    expect(choosePet(null, b)).toBe(b);
  });
});

describe('day math across daylight saving', () => {
  test('the suite runs in the pinned US zone (jest.globalSetup.js), or these tests prove nothing', () => {
    // US clocks spring forward on 8 March 2026; UTC (CI's default) and CET do not.
    const before = new Date(2026, 2, 7, 12).getTimezoneOffset();
    const after = new Date(2026, 2, 9, 12).getTimezoneOffset();
    expect(before - after).toBe(60);
  });

  test('dayDiff counts calendar days across the spring-forward night', () => {
    const a = new Date(2026, 2, 7, 23, 30).getTime();
    const b = new Date(2026, 2, 9, 0, 30).getTime();
    expect(dayDiff(a, b)).toBe(2);
  });

  test('a nap starts after exactly two empty days, even across the fall-back night', () => {
    const fedAt = new Date(2026, 9, 31, 23, 0).getTime();
    const pet = advancePet(
      createPet(fedAt - 1000),
      tree([{ id: 'a', ats: [fedAt] }]),
      fedAt + 1
    ).pet;
    expect(moodFor(pet, new Date(2026, 10, 2, 23, 59).getTime())).toBe('peckish');
    expect(moodFor(pet, new Date(2026, 10, 3, 0, 1).getTime())).toBe('napping');
  });
});
