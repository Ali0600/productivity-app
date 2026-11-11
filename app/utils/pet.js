// Pure engine for the virtual pet: turns the task completion log into pet care.
// No React, storage or clock access, so every rule here is unit-testable.
//
// Design rules (research and reasoning in docs/GAMIFICATION.md):
// - Care is DAILY, never hourly: each day starts peckish, 1 snack = fed, 3 = full.
// - The floor is a nap, after 2 full days with no completion. Nothing is ever
//   lost: no sickness, no death, no lost items, no reversed growth.
// - Growth counts CARE DAYS (days with at least one completion), so a gap
//   pauses it and never undoes it.
// - Snacks are read from the completion log through a watermark, so every
//   completion path (present or future) feeds the pet, and deleting a task
//   later never takes a snack back.

import { dayKey, toMs } from './dayKey';

export const PET_STATE_VERSION = 1;
export const DEFAULT_PET_NAME = 'Mochi';
export const MAX_NAME_LENGTH = 24;
export const PET_COLOR_KEYS = ['peach', 'mint', 'lavender', 'sky', 'lemon', 'rose'];
export const DEFAULT_PET_COLOR = 'peach';

export const FULL_AT = 3; // snacks in a day for a full belly
export const NAP_AFTER_EMPTY_DAYS = 2; // full days with no completion before napping
export const REST_DAYS_PER_WEEK = 2; // empty days per week shown as rest, not misses
export const TRICK_SLOTS = 12;
export const TRICK_HEAD_START = 2; // every trick bar starts partly filled
export const WELCOME_BACK_AFTER_DAYS = 7; // empty days before a comeback gift
export const WELCOME_BACK_SLOTS = 2;
export const GIFT_CHANCE = 0.18; // per completion, at most one gift a day
export const SEASON_EVERY = 30; // care days per new room once grown up

// Completions stamped more than this far in the future (a wrong clock, a bad
// import) wait until their time comes instead of jumping the watermark ahead.
const FUTURE_GRACE_MS = 10 * 60 * 1000;
// Per-day snack counts older than this are dropped; the weekly diary, cozy
// weeks and moods only ever look back a couple of weeks. A week is always
// judged in the first pass after it ends, before that pass prunes anything.
const DAY_WINDOW = 70;
// Backstop for a clock that jumps decades: weeks judged in one pass.
const MAX_WEEKS_PER_PASS = 600;

export const STAGES = [
  { key: 'egg', label: 'Egg', minCareDays: 0, room: 'nest' },
  { key: 'baby', label: 'Baby', minCareDays: 1, room: 'nursery' },
  { key: 'kid', label: 'Kid', minCareDays: 7, room: 'garden' },
  { key: 'teen', label: 'Teen', minCareDays: 21, room: 'treehouse' },
  { key: 'adult', label: 'Grown-up', minCareDays: 60, room: 'meadow' },
];
const ADULT_MIN = STAGES[STAGES.length - 1].minCareDays;
export const SEASON_ROOMS = ['seaside', 'starlight', 'snowfall', 'blossom', 'harvest', 'aurora'];

export const TRICKS = [
  { key: 'hop', label: 'Hop' },
  { key: 'wiggle', label: 'Wiggle' },
  { key: 'spin', label: 'Spin' },
  { key: 'bounce', label: 'Bounce' },
  { key: 'wave', label: 'Wave' },
  { key: 'peekaboo', label: 'Peekaboo' },
  { key: 'twirl', label: 'Twirl' },
  { key: 'flip', label: 'Flip' },
  { key: 'dance', label: 'Dance' },
  { key: 'stretch', label: 'Big stretch' },
  { key: 'roll', label: 'Roll' },
  { key: 'sparkle', label: 'Sparkle' },
];
const TRICK_KEYS = new Set(TRICKS.map((t) => t.key));

export const SNACKS = ['🍓', '🍙', '🍪', '🧁', '🫐', '🍑', '🥟', '🍩', '🍡', '🥐'];

export const TREASURES = [
  { key: 'shell', emoji: '🐚', label: 'Seashell' },
  { key: 'clover', emoji: '🍀', label: 'Four-leaf clover' },
  { key: 'acorn', emoji: '🌰', label: 'Acorn' },
  { key: 'feather', emoji: '🪶', label: 'Feather' },
  { key: 'mushroom', emoji: '🍄', label: 'Tiny mushroom' },
  { key: 'key', emoji: '🗝️', label: 'Old key' },
  { key: 'sock', emoji: '🧦', label: 'Lost sock' },
  { key: 'balloon', emoji: '🎈', label: 'Balloon' },
  { key: 'kite', emoji: '🪁', label: 'Kite' },
  { key: 'star', emoji: '⭐', label: 'Star sticker' },
  { key: 'gem', emoji: '💎', label: 'Shiny gem' },
  { key: 'puzzle', emoji: '🧩', label: 'Puzzle piece' },
  { key: 'die', emoji: '🎲', label: 'Lucky die' },
  { key: 'yoyo', emoji: '🪀', label: 'Yo-yo' },
  { key: 'blossom', emoji: '🌸', label: 'Blossom' },
  { key: 'leaf', emoji: '🍁', label: 'Maple leaf' },
  { key: 'bubble', emoji: '🫧', label: 'Bubble' },
  { key: 'ribbon', emoji: '🎀', label: 'Ribbon' },
  { key: 'teddy', emoji: '🧸', label: 'Teddy' },
  { key: 'letter', emoji: '💌', label: 'Love letter' },
  { key: 'ticket', emoji: '🎟️', label: 'Ticket stub' },
  { key: 'honey', emoji: '🍯', label: 'Honey pot' },
  { key: 'marble', emoji: '🔮', label: 'Marble' },
  { key: 'coin', emoji: '🪙', label: 'Shiny coin' },
  { key: 'snail', emoji: '🐌', label: 'Snail friend' },
  { key: 'rainbow', emoji: '🌈', label: 'Rainbow' },
  { key: 'crayon', emoji: '🖍️', label: 'Crayon' },
  { key: 'bell', emoji: '🔔', label: 'Little bell' },
  { key: 'pebble', emoji: '🪨', label: 'Smooth pebble' },
  { key: 'moonrock', emoji: '🌙', label: 'Moon rock' },
];

// Comeback souvenirs: only ever given on a return after a long break.
export const DREAM_SOUVENIRS = [
  { key: 'dream-cloud', emoji: '☁️', label: 'Pocket cloud' },
  { key: 'dream-comet', emoji: '☄️', label: 'Tiny comet' },
  { key: 'dream-planet', emoji: '🪐', label: 'Planet marble' },
  { key: 'dream-castle', emoji: '🏰', label: 'Sandcastle' },
  { key: 'dream-whale', emoji: '🐋', label: 'Sky whale' },
  { key: 'dream-moon', emoji: '🌛', label: 'Sleepy moon' },
];
const ALL_TREASURES = new Map([...TREASURES, ...DREAM_SOUVENIRS].map((t) => [t.key, t]));

// --- Day math (local calendar days, DST-safe via setDate) ----------------------

export const startOfDay = (ms) => {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

export const addDays = (ms, n) => {
  const d = new Date(ms);
  d.setDate(d.getDate() + n);
  return d.getTime();
};

/** Whole local calendar days from the day containing `a` to the day containing `b`. */
export const dayDiff = (a, b) => Math.round((startOfDay(b) - startOfDay(a)) / 86400000);

/** Local midnight of the dayKey `y-m-d` (month 0-based, as dayKey writes it). */
const keyToDayStart = (key) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m, d).getTime();
};

const DAY_KEY_RE = /^\d{4}-\d{1,2}-\d{1,2}$/;

/** Local midnight of the Monday that starts the week containing `ms`. */
export const weekStart = (ms) => {
  const day = startOfDay(ms);
  const mondayOffset = (new Date(day).getDay() + 6) % 7;
  return addDays(day, -mondayOffset);
};

// --- Deterministic randomness --------------------------------------------------

/**
 * FNV-1a over a string, mapped to [0, 1). Every "random" pet outcome is a pure
 * function of the completion it came from, so replaying the same log always
 * gives the same snacks and gifts.
 */
export const hashUnit = (str) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) / 4294967296;
};

const pick = (list, seed) => list[Math.floor(hashUnit(seed) * list.length) % list.length];

// --- State ---------------------------------------------------------------------

export const createPet = (now) => ({
  v: PET_STATE_VERSION,
  name: DEFAULT_PET_NAME,
  color: DEFAULT_PET_COLOR,
  adoptedAt: now,
  hatchedAt: null,
  watermark: now,
  lastSnackAt: null,
  snacks: 0,
  careDays: 0,
  days: {},
  trickProgress: TRICK_HEAD_START,
  tricks: [],
  treasures: {},
  lastGiftDay: null,
  cozyWeeks: 0,
  cozyCheckedThrough: null,
  wokeFor: null,
  wokeOn: null,
  // "Before the pet" stats, snapshotted once from the completion log (see
  // takeBaseline): the log shrinks when tasks are deleted, the snapshot doesn't.
  baseline: null,
  calm: false,
  hidden: false,
});

const isFiniteNumber = (n) => typeof n === 'number' && Number.isFinite(n);
const count = (n) => (isFiniteNumber(n) && n > 0 ? Math.floor(n) : 0);
const msOrNull = (n) => (isFiniteNumber(n) && n > 0 ? n : null);

/**
 * A watermark more than the grace ahead of the clock (the clock was set back)
 * moves to just before now. Not to now itself: the task that triggered this
 * pass was stamped moments before now and would be swallowed. The cost is that
 * an already-counted task stamped in that last window may count again: rare,
 * and better than losing a real one.
 */
const clampToClock = (ms, now) => (ms > now + FUTURE_GRACE_MS ? now - FUTURE_GRACE_MS : ms);

const cleanBaseline = (raw) => {
  if (!raw || typeof raw !== 'object') return null;
  const { days, completions, activeDays } = raw;
  if (![days, completions, activeDays].every((n) => isFiniteNumber(n) && n >= 0)) return null;
  if (activeDays > days) return null;
  return { days: Math.floor(days), completions: Math.floor(completions), activeDays };
};

export const cleanName = (raw) => {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.replace(/\s+/g, ' ').trim().slice(0, MAX_NAME_LENGTH).trim();
  return trimmed.length > 0 ? trimmed : null;
};

/**
 * Bring a stored or imported record up to the current shape. Field by field,
 * so one bad value falls back alone instead of resetting the pet. Returns null
 * when `raw` is not a pet record at all.
 */
export const normalizePet = (raw, now) => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const base = createPet(now);
  const adoptedAt = msOrNull(raw.adoptedAt) ?? now;

  const days = {};
  if (raw.days && typeof raw.days === 'object' && !Array.isArray(raw.days)) {
    for (const [key, n] of Object.entries(raw.days)) {
      if (DAY_KEY_RE.test(key) && count(n) > 0) days[key] = count(n);
    }
  }

  const treasures = {};
  if (raw.treasures && typeof raw.treasures === 'object' && !Array.isArray(raw.treasures)) {
    for (const [key, entry] of Object.entries(raw.treasures)) {
      if (!ALL_TREASURES.has(key) || !entry || typeof entry !== 'object') continue;
      const n = count(entry.count);
      if (n > 0) treasures[key] = { count: n, firstAt: msOrNull(entry.firstAt) ?? adoptedAt };
    }
  }

  const tricks = Array.isArray(raw.tricks)
    ? TRICKS.map((t) => t.key).filter((k) => raw.tricks.includes(k))
    : [];

  const progress = count(raw.trickProgress);
  return {
    ...base,
    name: cleanName(raw.name) ?? DEFAULT_PET_NAME,
    color: PET_COLOR_KEYS.includes(raw.color) ? raw.color : DEFAULT_PET_COLOR,
    adoptedAt,
    hatchedAt: msOrNull(raw.hatchedAt),
    // A watermark ahead of the clock (a fast-clock backup, a clock set back)
    // would freeze feeding until that time, so pull it back to now.
    watermark: clampToClock(msOrNull(raw.watermark) ?? adoptedAt, now),
    lastSnackAt: msOrNull(raw.lastSnackAt),
    snacks: count(raw.snacks),
    careDays: count(raw.careDays),
    days,
    trickProgress:
      raw.trickProgress == null ? TRICK_HEAD_START : Math.min(progress, TRICK_SLOTS - 1),
    tricks,
    treasures,
    lastGiftDay:
      typeof raw.lastGiftDay === 'string' && DAY_KEY_RE.test(raw.lastGiftDay)
        ? raw.lastGiftDay
        : null,
    cozyWeeks: count(raw.cozyWeeks),
    cozyCheckedThrough: msOrNull(raw.cozyCheckedThrough),
    wokeFor: msOrNull(raw.wokeFor),
    wokeOn: typeof raw.wokeOn === 'string' && DAY_KEY_RE.test(raw.wokeOn) ? raw.wokeOn : null,
    baseline: cleanBaseline(raw.baseline),
    calm: raw.calm === true,
    hidden: raw.hidden === true,
  };
};

// --- Derived views -------------------------------------------------------------

export const isHatched = (pet) => pet.hatchedAt != null;

/** What to call the pet on screen: its name, or "<name>'s egg" before hatching. */
export const petDisplayName = (pet) => (isHatched(pet) ? pet.name : `${pet.name}'s egg`);

export const stageFor = (pet) => {
  if (!isHatched(pet)) return STAGES[0];
  let stage = STAGES[1];
  for (const s of STAGES) {
    if (s.key !== 'egg' && pet.careDays >= s.minCareDays) stage = s;
  }
  return stage;
};

/** Seasons completed since growing up: 0 while not yet grown up. */
const seasonIndex = (pet) =>
  stageFor(pet).key === 'adult' ? Math.floor((pet.careDays - ADULT_MIN) / SEASON_EVERY) : 0;

export const roomFor = (pet) => {
  const seasons = seasonIndex(pet);
  if (seasons <= 0) return stageFor(pet).room;
  return SEASON_ROOMS[(seasons - 1) % SEASON_ROOMS.length];
};

export const snacksOn = (pet, ms) => pet.days[dayKey(ms)] ?? 0;

/** Full local days with no snack between the last snack's day and `now`'s day. */
export const emptyDaysBefore = (pet, now) =>
  pet.lastSnackAt == null ? 0 : Math.max(0, dayDiff(pet.lastSnackAt, now) - 1);

/**
 * True while the pet is napping and nobody has woken it for this nap yet. A nap
 * is identified by the snack it followed, so it greets you once per nap.
 */
export const needsWake = (pet, now) =>
  isHatched(pet) &&
  snacksOn(pet, now) === 0 &&
  emptyDaysBefore(pet, now) >= NAP_AFTER_EMPTY_DAYS &&
  pet.wokeFor !== pet.lastSnackAt;

/** The avatar's mood: 'napping' | 'peckish' | 'fed' | 'full'. */
export const moodFor = (pet, now) => {
  const today = snacksOn(pet, now);
  if (today >= FULL_AT) return 'full';
  if (today >= 1) return 'fed';
  if (pet.calm) return 'fed';
  return needsWake(pet, now) ? 'napping' : 'peckish';
};

/**
 * The first day the diary and cozy weeks judge: the hatch day. Days spent as an
 * egg are onboarding, not care days missed. An unhatched egg has none.
 */
const judgedFrom = (pet) => (isHatched(pet) ? startOfDay(pet.hatchedAt) : Infinity);

/**
 * A week (Monday first, the one containing `weekOf`, this week by default) as
 * seven entries, judged as of `now`. Empty past days use up to
 * REST_DAYS_PER_WEEK rest days before they show as open — never as failures.
 */
export const weekDiary = (pet, now, weekOf = now) => {
  const today = startOfDay(now);
  const firstJudged = judgedFrom(pet);
  const monday = weekStart(weekOf);
  let restLeft = REST_DAYS_PER_WEEK;
  return ['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((label, i) => {
    const day = addDays(monday, i);
    const key = dayKey(day);
    const snacks = pet.days[key] ?? 0;
    let status;
    if (day > today) status = 'future';
    else if (snacks > 0) status = 'care';
    else if (day === today) status = 'today';
    else if (day < firstJudged) status = 'before';
    else if (restLeft > 0) {
      restLeft -= 1;
      status = 'rest';
    } else status = 'open';
    return { key, label, status, snacks };
  });
};

/**
 * Whether the completed week starting `monday` counts as a cozy week. A week
 * with no judged days (wholly before the hatch) has no care day, so it isn't.
 */
const isCozyWeek = (pet, monday) => {
  const firstJudged = judgedFrom(pet);
  let care = 0;
  let empty = 0;
  for (let i = 0; i < 7; i += 1) {
    const day = addDays(monday, i);
    if (day < firstJudged) continue;
    if ((pet.days[dayKey(day)] ?? 0) > 0) care += 1;
    else empty += 1;
  }
  return care > 0 && empty <= REST_DAYS_PER_WEEK;
};

export const trickView = (pet) => {
  const learned = TRICKS.filter((t) => pet.tricks.includes(t.key));
  const next = TRICKS.find((t) => !pet.tricks.includes(t.key)) ?? null;
  const filled = Math.max(0, Math.min(pet.trickProgress, TRICK_SLOTS));
  return { filled, slots: TRICK_SLOTS, remaining: TRICK_SLOTS - filled, next, learned };
};

export const growthView = (pet) => {
  const stage = stageFor(pet);
  const index = STAGES.indexOf(stage);
  const next = STAGES[index + 1] ?? null;
  if (next) {
    return {
      stage,
      next,
      remaining: Math.max(0, next.minCareDays - pet.careDays),
      room: roomFor(pet),
    };
  }
  const into = (pet.careDays - ADULT_MIN) % SEASON_EVERY;
  return { stage, next: null, remaining: SEASON_EVERY - into, room: roomFor(pet) };
};

/**
 * Labels for the "still to find" tiles after `foundTiles` found ones: just
 * enough to finish the current row, the last one reading "+N" when more remain,
 * so the shelf hints at the collection without a wall of question marks.
 */
export const placeholderTiles = (foundTiles, unfound, columns) => {
  if (unfound <= 0) return [];
  const toRowEnd = columns - (foundTiles % columns);
  const shown = Math.min(unfound, toRowEnd);
  return Array.from({ length: shown }, (_, i) =>
    i === shown - 1 && unfound > shown ? `+${unfound - shown + 1}` : '?'
  );
};

export const treasureView = (pet) => {
  const found = [...TREASURES, ...DREAM_SOUVENIRS]
    .filter((t) => pet.treasures[t.key])
    .map((t) => ({ ...t, count: pet.treasures[t.key].count, dream: t.key.startsWith('dream-') }));
  return {
    found,
    foundCount: TREASURES.filter((t) => pet.treasures[t.key]).length,
    total: TREASURES.length,
  };
};

export const daysTogether = (pet, now) => Math.max(1, dayDiff(pet.adoptedAt, now) + 1);

/**
 * One informational line about how the pet is doing. Never a verdict on the
 * user: no "you forgot", no countdowns to anything bad.
 */
export const statusLine = (pet, now) => {
  const { name } = pet;
  if (!isHatched(pet)) return 'Finish any task to hatch your egg.';
  const today = snacksOn(pet, now);
  const seed = `${dayKey(now)}|${today}`;
  if (today >= FULL_AT) {
    return pick(
      [
        `${name} is full and happy.`,
        `Full belly! ${name} is glowing.`,
        `${name} is stuffed and very pleased.`,
      ],
      seed
    );
  }
  // No "N more for a full belly": the bowl already shows that, and an announced
  // task-for-reward rate is the kind of expected reward that undermines.
  if (today >= 1) return `${name} had ${today === 1 ? 'a snack' : `${today} snacks`} today.`;
  const away = emptyDaysBefore(pet, now);
  if (away >= NAP_AFTER_EMPTY_DAYS) {
    if (pet.wokeFor !== pet.lastSnackAt)
      return pet.calm ? `${name} is content.` : `${name} is napping.`;
    // Greet on the day of waking only; repeated on later days, the number would
    // become a running count of days without a task.
    if (pet.wokeOn === dayKey(now)) {
      return pet.calm
        ? `Welcome back! ${name} is happy to see you.`
        : `${away + 1} days! ${name} napped like a champion.`;
    }
  }
  if (pet.calm) return `${name} is content.`;
  if (away === 1) {
    const yesterday = addDays(startOfDay(now), -1);
    const entry = weekDiary(pet, now, yesterday).find((d) => d.key === dayKey(yesterday));
    if (entry?.status === 'rest') return `Rest day used, nothing lost. ${name} is peckish.`;
  }
  return pick(
    [`${name} is up and a little peckish.`, `${name} is waiting by the snack bowl.`],
    seed
  );
};

// --- Transitions -----------------------------------------------------------------

const nextTreasure = (treasures, seed, pool = TREASURES) => {
  const unfound = pool.filter((t) => !treasures[t.key]);
  const source = unfound.length > 0 ? unfound : pool;
  return pick(source, seed);
};

const addTreasure = (treasures, treasure, at) => {
  const prev = treasures[treasure.key];
  return {
    ...treasures,
    [treasure.key]: { count: (prev?.count ?? 0) + 1, firstAt: prev?.firstAt ?? at },
  };
};

/** Every completion in the tree stamped after `after` and not in the far future. */
export const collectCompletions = (mainLists, after, now) => {
  const out = [];
  const latest = now + FUTURE_GRACE_MS;
  for (const ml of mainLists ?? []) {
    for (const sl of ml?.sideLists ?? []) {
      for (const task of sl?.tasks ?? []) {
        for (const c of task?.completions ?? []) {
          const at = toMs(c?.at);
          if (at == null || at <= after || at > latest) continue;
          out.push({
            at,
            taskId: String(task.id ?? ''),
            taskName: typeof task.taskName === 'string' ? task.taskName : '',
            listName: sl.listName,
          });
        }
      }
    }
  }
  out.sort((a, b) => a.at - b.at || (a.taskId < b.taskId ? -1 : a.taskId > b.taskId ? 1 : 0));
  return out;
};

/** Turn new completions (from collectCompletions) into snacks, care days, tricks and gifts. */
const feed = (pet, fresh, events) => {
  if (fresh.length === 0) return pet;

  const next = { ...pet, days: { ...pet.days }, treasures: { ...pet.treasures } };
  for (const c of fresh) {
    const day = dayKey(c.at);
    const seed = `${c.taskId}|${c.at}`;
    const stageBefore = stageFor(next);
    const seasonBefore = seasonIndex(next);

    const before = next.days[day] ?? 0;
    next.days[day] = before + 1;
    next.snacks += 1;
    if (before === 0) next.careDays += 1;
    next.lastSnackAt = c.at; // `fresh` is in time order

    if (!isHatched(next)) {
      next.hatchedAt = c.at;
      events.push({ type: 'hatch', at: c.at });
    } else {
      const stageAfter = stageFor(next);
      if (stageAfter !== stageBefore)
        events.push({ type: 'stage', stage: stageAfter.key, at: c.at });
      else if (seasonIndex(next) > seasonBefore) {
        events.push({ type: 'season', room: roomFor(next), at: c.at });
      }
    }

    const nth = next.days[day];
    events.push({
      type: 'snack',
      at: c.at,
      taskName: c.taskName,
      listName: c.listName,
      snack: pick(SNACKS, `${seed}#snack`),
      nth,
    });
    if (nth === FULL_AT) events.push({ type: 'full', at: c.at });

    next.trickProgress += 1;
    if (next.trickProgress >= TRICK_SLOTS) {
      const trick = TRICKS.find((t) => !next.tricks.includes(t.key));
      if (trick) {
        next.tricks = [...next.tricks, trick.key];
        events.push({ type: 'trick', trick: trick.key, at: c.at });
      } else {
        // Every trick learned: a full bar becomes an encore gift instead.
        const t = nextTreasure(next.treasures, `${seed}#encore`);
        next.treasures = addTreasure(next.treasures, t, c.at);
        events.push({ type: 'gift', treasure: t.key, encore: true, at: c.at });
      }
      next.trickProgress = TRICK_HEAD_START;
    }

    if (next.lastGiftDay !== day && hashUnit(`${seed}#gift`) < GIFT_CHANCE) {
      const t = nextTreasure(next.treasures, `${seed}#treasure`);
      next.treasures = addTreasure(next.treasures, t, c.at);
      next.lastGiftDay = day;
      events.push({ type: 'gift', treasure: t.key, at: c.at });
    }
  }
  next.watermark = fresh[fresh.length - 1].at;
  return next;
};

/** Award cozy weeks for completed weeks and drop per-day counts past the window. */
const rollover = (pet, now, events) => {
  const thisMonday = weekStart(now);
  const firstMonday = weekStart(pet.adoptedAt);
  // The stored pointer is an instant: after a time-zone move it is no longer a
  // local Monday midnight, so snap it back to one. A pointer ahead of the clock
  // (the date was set forward once) would stop cozy weeks until that date, so
  // fall back to last week.
  let checked =
    pet.cozyCheckedThrough != null ? weekStart(addDays(pet.cozyCheckedThrough, 3)) : null;
  if (checked != null && dayDiff(checked, thisMonday) <= 0) checked = addDays(thisMonday, -7);
  let from = checked != null ? addDays(checked, 7) : firstMonday;
  const backstop = addDays(thisMonday, -7 * MAX_WEEKS_PER_PASS);
  if (from < backstop) from = backstop;

  let next = pet;
  let lastChecked = checked;
  let awarded = 0;
  // Compare calendar days, not milliseconds, so a 23- or 25-hour day can't
  // land a week boundary on the wrong side.
  for (let monday = from; dayDiff(monday, thisMonday) > 0; monday = addDays(monday, 7)) {
    if (isCozyWeek(pet, monday)) awarded += 1;
    lastChecked = monday;
  }
  if (lastChecked !== pet.cozyCheckedThrough) {
    next = { ...next, cozyCheckedThrough: lastChecked, cozyWeeks: pet.cozyWeeks + awarded };
    if (awarded > 0) events.push({ type: 'cozy', weeks: next.cozyWeeks });
  }

  // Prune relative to the last snack too, so one launch with the date set far
  // ahead can't wipe today's bowl and this week's diary.
  const pruneFrom = Math.min(now, next.lastSnackAt ?? now);
  const cutoff = addDays(startOfDay(pruneFrom), -DAY_WINDOW);
  const stale = Object.keys(next.days).filter((k) => keyToDayStart(k) < cutoff);
  if (stale.length > 0) {
    const days = { ...next.days };
    for (const k of stale) delete days[k];
    next = { ...next, days };
  }
  return next;
};

/**
 * Bring the pet up to date with the completion log and the calendar. Returns the
 * SAME object when nothing changed, so callers can skip saves and re-renders.
 * @returns {{ pet: object, events: Array<object> }}
 */
export const advancePet = (pet, mainLists, now) => {
  const events = [];
  let current = takeBaseline(pet, mainLists);
  // A watermark ahead of the clock (the clock was set back) would freeze
  // feeding until that time; bring it back on every pass, not only at load.
  const watermark = clampToClock(current.watermark, now);
  if (watermark !== current.watermark) current = { ...current, watermark };
  const fresh = collectCompletions(mainLists, current.watermark, now);
  // A task finished before anyone saw the nap (straight into a list, say) still
  // wakes the pet first, so a long break keeps its welcome-back gift.
  if (fresh.length > 0 && needsWake(current, fresh[0].at)) {
    const woke = wakePet(current, fresh[0].at);
    current = woke.pet;
    events.push(...woke.events);
  }
  const fed = feed(current, fresh, events);
  const rolled = rollover(fed, now, events);
  return { pet: rolled, events };
};

/**
 * Wake a napping pet (the first look after a break). After a long break it
 * also hands over a dream souvenir and a head start on the next trick.
 */
export const wakePet = (pet, now) => {
  if (!needsWake(pet, now)) return { pet, events: [] };
  const away = emptyDaysBefore(pet, now);
  const events = [{ type: 'wake', days: away + 1 }];
  // Marking this nap as woken is also what makes the souvenir a one-off.
  let next = { ...pet, wokeFor: pet.lastSnackAt, wokeOn: dayKey(now) };
  if (away >= WELCOME_BACK_AFTER_DAYS) {
    const souvenir = nextTreasure(next.treasures, `${pet.lastSnackAt}|dream`, DREAM_SOUVENIRS);
    next = {
      ...next,
      treasures: addTreasure(next.treasures, souvenir, now),
      trickProgress: Math.min(TRICK_SLOTS - 1, next.trickProgress + WELCOME_BACK_SLOTS),
    };
    events.push({ type: 'welcome', days: away + 1, treasure: souvenir.key });
  }
  return { pet: next, events };
};

export const renamePet = (pet, name) => {
  const clean = cleanName(name);
  return clean && clean !== pet.name ? { ...pet, name: clean } : pet;
};

export const recolorPet = (pet, color) =>
  PET_COLOR_KEYS.includes(color) && color !== pet.color ? { ...pet, color } : pet;

export const treasureByKey = (key) => ALL_TREASURES.get(key) ?? null;
export const trickByKey = (key) => (TRICK_KEYS.has(key) ? TRICKS.find((t) => t.key === key) : null);

// --- "Is it helping?" ------------------------------------------------------------

const BASELINE_DAYS = 28;
const MIN_COMPARE_DAYS = 7;

/**
 * Snapshot "before the pet" once, from the completion log: whole local days in
 * the 28 before the adoption day, clipped to the day the log starts. Stored on
 * the pet because the log itself shrinks (deleted tasks, the per-task cap), and
 * a shrinking baseline would make the pet look like it helped. Skipped while
 * mainLists is empty, which only happens when the lists failed to load.
 */
export const takeBaseline = (pet, mainLists) => {
  if (pet.baseline != null || !Array.isArray(mainLists) || mainLists.length === 0) return pet;
  const end = startOfDay(pet.adoptedAt);
  const times = [];
  for (const ml of mainLists) {
    for (const sl of ml?.sideLists ?? []) {
      for (const task of sl?.tasks ?? []) {
        for (const c of task?.completions ?? []) {
          const at = toMs(c?.at);
          if (at != null && at < end) times.push(at);
        }
      }
    }
  }
  if (times.length === 0) return { ...pet, baseline: { days: 0, completions: 0, activeDays: 0 } };
  const earliest = times.reduce((min, t) => (t < min ? t : min), Infinity);
  const from = Math.max(addDays(end, -BASELINE_DAYS), startOfDay(earliest));
  const inWindow = times.filter((t) => t >= from);
  return {
    ...pet,
    baseline: {
      days: dayDiff(from, end),
      completions: inWindow.length,
      activeDays: new Set(inWindow.map(dayKey)).size,
    },
  };
};

/**
 * Tasks a day and active days a week before the pet (the baseline snapshot)
 * versus since: whole days from the adoption day up to yesterday, read from
 * the pet's own counters, which deleting a task never lowers. Today is left
 * out because it isn't over. Either side is null until it spans a week.
 */
export const helpingStats = (pet, now) => {
  const b = pet.baseline;
  const before =
    b && b.days >= MIN_COMPARE_DAYS
      ? { days: b.days, perDay: b.completions / b.days, activePerWeek: (b.activeDays / b.days) * 7 }
      : null;
  const elapsed = Math.max(0, dayDiff(pet.adoptedAt, now));
  const todaySnacks = snacksOn(pet, now);
  const snacks = Math.max(0, pet.snacks - todaySnacks);
  const careDays = Math.max(0, pet.careDays - (todaySnacks > 0 ? 1 : 0));
  const since =
    elapsed > 0
      ? {
          days: elapsed,
          perDay: snacks / elapsed,
          activePerWeek: Math.min(7, (careDays / elapsed) * 7),
        }
      : { days: 0, perDay: 0, activePerWeek: 0 };
  return { before, since, ready: elapsed >= MIN_COMPARE_DAYS };
};

/**
 * Backup import: keep whichever pet has grown more (care days, then snacks,
 * tricks, treasures), so restoring an older backup never rolls growth back and
 * restoring onto a fresh install brings the pet home. Ties go to the backup.
 */
export const choosePet = (current, imported) => {
  if (!imported) return current;
  if (!current) return imported;
  const score = (p) => [p.careDays, p.snacks, p.tricks.length, Object.keys(p.treasures).length];
  const a = score(imported);
  const b = score(current);
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return a[i] > b[i] ? imported : current;
  }
  return imported;
};
