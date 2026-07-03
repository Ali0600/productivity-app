import {
  isInQuietHours,
  startOfDayMs,
  isRuleActive,
  isRuleCurrentlyActive,
  rulesEqual,
  computeStaggerOffsetMs,
} from '../notificationRules';

const MIN = 60 * 1000;
const at = (hours, minutes = 0) => new Date(2026, 5, 15, hours, minutes);

describe('isInQuietHours', () => {
  test('start === end means quiet hours never apply', () => {
    expect(isInQuietHours(at(3), 120, 120)).toBe(false);
  });

  test('daytime window: start inclusive, end exclusive', () => {
    const start = 9 * 60;
    const end = 17 * 60;
    expect(isInQuietHours(at(9), start, end)).toBe(true);
    expect(isInQuietHours(at(12), start, end)).toBe(true);
    expect(isInQuietHours(at(16, 59), start, end)).toBe(true);
    expect(isInQuietHours(at(17), start, end)).toBe(false);
    expect(isInQuietHours(at(8, 59), start, end)).toBe(false);
  });

  test('overnight wrap 22:00 → 08:00', () => {
    const start = 22 * 60;
    const end = 8 * 60;
    expect(isInQuietHours(at(23), start, end)).toBe(true);
    expect(isInQuietHours(at(2), start, end)).toBe(true);
    expect(isInQuietHours(at(7, 59), start, end)).toBe(true);
    expect(isInQuietHours(at(22), start, end)).toBe(true);
    expect(isInQuietHours(at(8), start, end)).toBe(false);
    expect(isInQuietHours(at(12), start, end)).toBe(false);
  });
});

describe('startOfDayMs', () => {
  test('returns local midnight of the same calendar day', () => {
    const midnight = new Date(startOfDayMs(at(13, 45)));
    expect(midnight.getFullYear()).toBe(2026);
    expect(midnight.getMonth()).toBe(5);
    expect(midnight.getDate()).toBe(15);
    expect(midnight.getHours()).toBe(0);
    expect(midnight.getMinutes()).toBe(0);
  });
});

describe('isRuleActive (schedule-time)', () => {
  const trigger = at(18);
  const workout = ({ taskCompletedAt = null, listCompletedAt = null } = {}) => ({
    name: 'Workouts',
    sideLists: [
      {
        listName: 'Push',
        lastCompletedAt: listCompletedAt,
        tasks: [{ id: 't1', taskName: 'Bench', completedAt: taskCompletedAt }],
      },
    ],
  });
  const taskRule = { type: 'task', taskId: 't1', sideListName: 'Push' };

  test('no rule or no source list → inactive', () => {
    expect(isRuleActive(null, workout(), trigger, null)).toBe(false);
    expect(isRuleActive(taskRule, null, trigger, null)).toBe(false);
  });

  test('task completed earlier the same day pauses the trigger', () => {
    const ml = workout({ taskCompletedAt: at(10).toISOString() });
    expect(isRuleActive(taskRule, ml, trigger, null)).toBe(true);
  });

  test('completion the previous day does not pause', () => {
    const yesterday = new Date(2026, 5, 14, 10).toISOString();
    expect(isRuleActive(taskRule, workout({ taskCompletedAt: yesterday }), trigger, null)).toBe(false);
  });

  test('completion after the trigger time does not pause it', () => {
    const ml = workout({ taskCompletedAt: at(19).toISOString() });
    expect(isRuleActive(taskRule, ml, trigger, null)).toBe(false);
  });

  test('armedAt after the completion re-arms the rule', () => {
    const ml = workout({ taskCompletedAt: at(10).toISOString() });
    expect(isRuleActive(taskRule, ml, trigger, at(11).getTime())).toBe(false);
    expect(isRuleActive(taskRule, ml, trigger, at(9).getTime())).toBe(true);
  });

  test('sideList and mainList rules read lastCompletedAt', () => {
    const ml = workout({ listCompletedAt: at(10).toISOString() });
    expect(isRuleActive({ type: 'sideList', sideListName: 'Push' }, ml, trigger, null)).toBe(true);
    expect(isRuleActive({ type: 'mainList' }, ml, trigger, null)).toBe(true);
    expect(isRuleActive({ type: 'sideList', sideListName: 'Pull' }, ml, trigger, null)).toBe(false);
  });
});

describe('isRuleCurrentlyActive (UI, relative to now)', () => {
  const mainData = (completedAt) => ({
    sideLists: [{ listName: 'Push', tasks: [{ id: 't1', completedAt }] }],
  });
  const rule = { type: 'task', taskId: 't1', sideListName: 'Push' };

  test('completion just now → active', () => {
    expect(isRuleCurrentlyActive(rule, mainData(new Date()))).toBe(true);
  });

  test('completion 36h ago → inactive', () => {
    const old = new Date(Date.now() - 36 * 60 * MIN);
    expect(isRuleCurrentlyActive(rule, mainData(old))).toBe(false);
  });

  test('no rule → inactive', () => {
    expect(isRuleCurrentlyActive(null, mainData(new Date()))).toBe(false);
  });
});

describe('rulesEqual', () => {
  test('both empty are equal; empty vs rule are not', () => {
    expect(rulesEqual(null, null)).toBe(true);
    expect(rulesEqual(null, { type: 'mainList' })).toBe(false);
  });

  test('task rules compare id + side list', () => {
    const a = { type: 'task', taskId: 't1', sideListName: 'Push' };
    expect(rulesEqual(a, { ...a })).toBe(true);
    expect(rulesEqual(a, { ...a, sideListName: 'Pull' })).toBe(false);
    expect(rulesEqual(a, { ...a, taskId: 't2' })).toBe(false);
  });

  test('sideList rules compare name; mainList rules always match', () => {
    expect(
      rulesEqual({ type: 'sideList', sideListName: 'Push' }, { type: 'sideList', sideListName: 'Push' })
    ).toBe(true);
    expect(rulesEqual({ type: 'mainList' }, { type: 'mainList' })).toBe(true);
    expect(rulesEqual({ type: 'mainList' }, { type: 'sideList', sideListName: 'Push' })).toBe(false);
  });
});

describe('computeStaggerOffsetMs', () => {
  test('single message in a group gets no offset', () => {
    expect(computeStaggerOffsetMs(0, 1, 60)).toBe(0);
  });

  test('two 60-min messages land 30 min apart', () => {
    expect(computeStaggerOffsetMs(0, 2, 60)).toBe(0);
    expect(computeStaggerOffsetMs(1, 2, 60)).toBe(30 * MIN);
  });

  test('three 30-min messages land 10 min apart', () => {
    expect(computeStaggerOffsetMs(0, 3, 30)).toBe(0);
    expect(computeStaggerOffsetMs(1, 3, 30)).toBe(10 * MIN);
    expect(computeStaggerOffsetMs(2, 3, 30)).toBe(20 * MIN);
  });
});
