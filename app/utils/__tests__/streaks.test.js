import { computeStreak } from '../streaks';

// Fixed local reference: 15 June 2026, noon.
const NOW = new Date(2026, 5, 15, 12, 0).getTime();

// Timestamp `offset` days before NOW, at 10:00 local.
const daysAgo = (offset) => {
  const d = new Date(2026, 5, 15, 10, 0);
  d.setDate(d.getDate() - offset);
  return d.getTime();
};

const listWithCompletions = (offsets, { legacyCompletedAt } = {}) => ({
  name: 'Workouts',
  sideLists: [
    {
      listName: 'Push',
      tasks: [
        {
          taskName: 'Bench',
          completions: offsets.map((o) => ({ at: daysAgo(o) })),
          ...(legacyCompletedAt != null ? { completedAt: new Date(legacyCompletedAt) } : {}),
        },
      ],
    },
  ],
});

describe('computeStreak', () => {
  test('no completions anywhere → 0', () => {
    expect(computeStreak(undefined, NOW)).toBe(0);
    expect(computeStreak({ sideLists: [] }, NOW)).toBe(0);
    expect(computeStreak(listWithCompletions([]), NOW)).toBe(0);
  });

  test('completed today → 1', () => {
    expect(computeStreak(listWithCompletions([0]), NOW)).toBe(1);
  });

  test('three consecutive days ending today → 3', () => {
    expect(computeStreak(listWithCompletions([0, 1, 2]), NOW)).toBe(3);
  });

  test('streak ending yesterday still counts (grace before today\'s workout)', () => {
    expect(computeStreak(listWithCompletions([1, 2]), NOW)).toBe(2);
  });

  test('a gap breaks the streak', () => {
    // today + 2 days ago, nothing yesterday → only today counts
    expect(computeStreak(listWithCompletions([0, 2]), NOW)).toBe(1);
    // ended two days ago → no active streak
    expect(computeStreak(listWithCompletions([2, 3]), NOW)).toBe(0);
  });

  test('several completions on one day count once', () => {
    expect(computeStreak(listWithCompletions([0, 0, 0, 1]), NOW)).toBe(2);
  });

  test('legacy completedAt (pre-history data) contributes its day', () => {
    const ml = {
      sideLists: [
        { listName: 'Push', tasks: [{ taskName: 'Bench', completedAt: new Date(daysAgo(0)) }] },
      ],
    };
    expect(computeStreak(ml, NOW)).toBe(1);
  });

  test('days union across tasks and side lists', () => {
    const ml = {
      sideLists: [
        { listName: 'Push', tasks: [{ completions: [{ at: daysAgo(0) }] }] },
        { listName: 'Pull', tasks: [{ completions: [{ at: daysAgo(1) }] }] },
      ],
    };
    expect(computeStreak(ml, NOW)).toBe(2);
  });

  test('malformed timestamps are ignored', () => {
    const ml = {
      sideLists: [
        {
          listName: 'Push',
          tasks: [{ completions: [{ at: 'garbage' }], completedAt: 'also-garbage' }],
        },
      ],
    };
    expect(computeStreak(ml, NOW)).toBe(0);
  });
});
