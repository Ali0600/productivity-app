import {
  evaluateGate,
  isGateSatisfied,
  isGateTargetMissing,
  gateProgress,
  DEFAULT_GATE_CONFIG,
} from '../focusGate';

// Fixed local reference: 15 June 2026, 12:00.
const NOW = new Date(2026, 5, 15, 12, 0).getTime();

const at = (dayOffset, hour = 10) => {
  const d = new Date(2026, 5, 15, hour, 0);
  d.setDate(d.getDate() - dayOffset);
  return d.getTime();
};

const CONFIG = {
  enabled: true,
  mainListName: 'Routines',
  sideListName: 'Morning',
  rearmHour: 6,
};

/** Build a mainLists tree whose Morning list holds the given tasks. */
const tree = (tasks, { sideListName = 'Morning', mainName = 'Routines' } = {}) => [
  {
    name: mainName,
    sideLists: [
      { listName: sideListName, tasks },
      { listName: 'Evening', tasks: [{ taskName: 'unrelated' }] },
    ],
  },
];

const doneToday = (name) => ({ taskName: name, completions: [{ at: at(0) }] });
const doneYesterday = (name) => ({ taskName: name, completions: [{ at: at(1) }] });
const neverDone = (name) => ({ taskName: name });

describe('isGateSatisfied', () => {
  test('every task completed today → satisfied', () => {
    const lists = tree([doneToday('Meds'), doneToday('Water')]);
    expect(isGateSatisfied(CONFIG, lists, NOW)).toBe(true);
  });

  test('one task outstanding → not satisfied', () => {
    const lists = tree([doneToday('Meds'), neverDone('Water')]);
    expect(isGateSatisfied(CONFIG, lists, NOW)).toBe(false);
  });

  test("yesterday's completions do not carry over", () => {
    const lists = tree([doneYesterday('Meds'), doneYesterday('Water')]);
    expect(isGateSatisfied(CONFIG, lists, NOW)).toBe(false);
  });

  test('an EMPTY gating list is never satisfied', () => {
    // Guards the vacuous-truth trap: "all zero tasks are done" must not unlock.
    expect(isGateSatisfied(CONFIG, tree([]), NOW)).toBe(false);
  });

  test('legacy completedAt (pre-history data) counts for today', () => {
    const lists = tree([{ taskName: 'Meds', completedAt: new Date(at(0)) }]);
    expect(isGateSatisfied(CONFIG, lists, NOW)).toBe(true);
  });

  test('malformed timestamps do not count as completions', () => {
    const lists = tree([
      { taskName: 'Meds', completions: [{ at: 'garbage' }], completedAt: 'nonsense' },
    ]);
    expect(isGateSatisfied(CONFIG, lists, NOW)).toBe(false);
  });

  test('only the designated side list matters', () => {
    // Morning outstanding, Evening fully done → still not satisfied.
    const lists = [
      {
        name: 'Routines',
        sideLists: [
          { listName: 'Morning', tasks: [neverDone('Meds')] },
          { listName: 'Evening', tasks: [doneToday('Journal')] },
        ],
      },
    ];
    expect(isGateSatisfied(CONFIG, lists, NOW)).toBe(false);
  });
});

describe('isGateTargetMissing', () => {
  test('false when the list exists', () => {
    expect(isGateTargetMissing(CONFIG, tree([doneToday('Meds')]))).toBe(false);
  });

  test('true when the side list was renamed or deleted', () => {
    const lists = tree([doneToday('Meds')], { sideListName: 'Renamed' });
    expect(isGateTargetMissing(CONFIG, lists)).toBe(true);
  });

  test('true when the main list was deleted', () => {
    expect(isGateTargetMissing(CONFIG, [])).toBe(true);
  });

  test('true when the config never picked a list', () => {
    const half = { ...CONFIG, sideListName: null };
    expect(isGateTargetMissing(half, tree([doneToday('Meds')]))).toBe(true);
  });

  test('false when the gate is disabled, whatever the target', () => {
    expect(isGateTargetMissing({ ...CONFIG, enabled: false }, [])).toBe(false);
  });
});

describe('evaluateGate', () => {
  test('blocks while the list is incomplete', () => {
    const lists = tree([doneToday('Meds'), neverDone('Water')]);
    expect(evaluateGate(CONFIG, lists, NOW)).toEqual({
      shouldBlock: true,
      reason: 'incomplete',
    });
  });

  test('unblocks once the list is done', () => {
    const lists = tree([doneToday('Meds'), doneToday('Water')]);
    expect(evaluateGate(CONFIG, lists, NOW)).toEqual({
      shouldBlock: false,
      reason: 'satisfied',
    });
  });

  test('disabled gate never blocks', () => {
    const lists = tree([neverDone('Meds')]);
    expect(evaluateGate({ ...CONFIG, enabled: false }, lists, NOW)).toEqual({
      shouldBlock: false,
      reason: 'disabled',
    });
  });

  test('fails OPEN when the target list is gone', () => {
    // A shield the user has no way to satisfy would be unescapable in-app.
    expect(evaluateGate(CONFIG, [], NOW)).toEqual({
      shouldBlock: false,
      reason: 'target-missing',
    });
  });

  test('fails open on an empty/default config', () => {
    expect(evaluateGate(DEFAULT_GATE_CONFIG, tree([]), NOW).shouldBlock).toBe(false);
    expect(evaluateGate(undefined, undefined, NOW).shouldBlock).toBe(false);
  });

  test('day rollover re-blocks: same data, next day', () => {
    const lists = tree([doneToday('Meds')]);
    expect(evaluateGate(CONFIG, lists, NOW).shouldBlock).toBe(false);
    const tomorrowNoon = new Date(2026, 5, 16, 12, 0).getTime();
    expect(evaluateGate(CONFIG, lists, tomorrowNoon).shouldBlock).toBe(true);
  });
});

describe('gateProgress', () => {
  test('counts today-completed tasks against the list total', () => {
    const lists = tree([doneToday('Meds'), neverDone('Water'), doneYesterday('Walk')]);
    expect(gateProgress(CONFIG, lists, NOW)).toEqual({
      total: 3,
      done: 1,
      remaining: 2,
    });
  });

  test('missing target reports zeroes rather than throwing', () => {
    expect(gateProgress(CONFIG, [], NOW)).toEqual({ total: 0, done: 0, remaining: 0 });
  });
});
