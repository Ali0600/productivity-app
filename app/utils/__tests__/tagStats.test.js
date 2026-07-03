import { computeTagRecovery } from '../tagStats';

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-07-01T12:00:00Z').getTime();

describe('computeTagRecovery', () => {
  test('returns [] for missing or empty side lists', () => {
    expect(computeTagRecovery(undefined, NOW)).toEqual([]);
    expect(computeTagRecovery([], NOW)).toEqual([]);
    expect(computeTagRecovery([{ listName: 'A', tasks: [] }], NOW)).toEqual([]);
  });

  test('never-completed tags sort first, then longest-since, then alphabetical', () => {
    const rows = computeTagRecovery(
      [
        {
          listName: 'A',
          tasks: [
            { tags: ['Chest'], completedAt: new Date(NOW - 2 * DAY).toISOString() },
            { tags: ['Back'], completedAt: new Date(NOW - 5 * DAY).toISOString() },
            { tags: ['Calves'] },
            { tags: ['Abs'] },
          ],
        },
      ],
      NOW
    );
    expect(rows.map((r) => r.tag)).toEqual(['Abs', 'Calves', 'Back', 'Chest']);
    expect(rows[0].neverCompleted).toBe(true);
    expect(rows[1].neverCompleted).toBe(true);
    expect(rows[2].msSince).toBe(5 * DAY);
    expect(rows[3].msSince).toBe(2 * DAY);
  });

  test('case and whitespace variants collapse into one row with first-seen casing', () => {
    const rows = computeTagRecovery(
      [
        {
          listName: 'A',
          tasks: [
            { tags: ['Chest'], completedAt: new Date(NOW - 3 * DAY).toISOString() },
            { tags: [' chest '], completedAt: new Date(NOW - 1 * DAY).toISOString() },
            { tags: ['CHEST'] },
          ],
        },
      ],
      NOW
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].tag).toBe('Chest');
    // Latest completion across the variants wins.
    expect(rows[0].msSince).toBe(1 * DAY);
    expect(rows[0].neverCompleted).toBe(false);
  });

  test('latest completion wins across tasks and side lists sharing a tag', () => {
    const rows = computeTagRecovery(
      [
        {
          listName: 'Push',
          tasks: [{ tags: ['Chest'], completedAt: new Date(NOW - 4 * DAY).toISOString() }],
        },
        {
          listName: 'Full Body',
          tasks: [{ tags: ['Chest'], completedAt: new Date(NOW - 1 * DAY).toISOString() }],
        },
      ],
      NOW
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].msSince).toBe(1 * DAY);
  });

  test('a task with multiple tags updates all of them', () => {
    const rows = computeTagRecovery(
      [
        {
          listName: 'A',
          tasks: [
            { tags: ['Chest', 'Triceps'], completedAt: new Date(NOW - 2 * DAY).toISOString() },
          ],
        },
      ],
      NOW
    );
    expect(rows.map((r) => r.tag).sort()).toEqual(['Chest', 'Triceps']);
    expect(rows.every((r) => r.msSince === 2 * DAY)).toBe(true);
  });

  test('malformed completedAt counts as not completed, valid one elsewhere still wins', () => {
    const rows = computeTagRecovery(
      [
        {
          listName: 'A',
          tasks: [
            { tags: ['Back'], completedAt: 'not-a-date' },
            { tags: ['Legs'], completedAt: 'not-a-date' },
            { tags: ['Back'], completedAt: new Date(NOW - 1 * DAY).toISOString() },
          ],
        },
      ],
      NOW
    );
    const back = rows.find((r) => r.tag === 'Back');
    const legs = rows.find((r) => r.tag === 'Legs');
    expect(back.neverCompleted).toBe(false);
    expect(back.msSince).toBe(1 * DAY);
    expect(legs.neverCompleted).toBe(true);
  });

  test('empty and whitespace-only tags are ignored', () => {
    const rows = computeTagRecovery(
      [{ listName: 'A', tasks: [{ tags: ['', '   ', null, 'Chest'] }] }],
      NOW
    );
    expect(rows.map((r) => r.tag)).toEqual(['Chest']);
  });
});
