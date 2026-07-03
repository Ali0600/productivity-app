// Pure helpers for notification "pause" rules and scheduling math, shared by
// the UI (Homepage) and NotificationService, and unit-tested independently.
//
// A rule pauses a list's reminders once its target has been completed *today*:
//   - type 'task'     → a specific task in a side list
//   - type 'sideList' → any completion in a named side list
//   - type 'mainList' → any completion anywhere in the main list

export const startOfDayMs = (d) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.getTime();
};

// Quiet-hours window in minutes-of-day; supports overnight wraps (e.g. 22:00→08:00).
export const isInQuietHours = (date, startMin, endMin) => {
  if (startMin === endMin) return false;
  const minOfDay = date.getHours() * 60 + date.getMinutes();
  if (startMin < endMin) {
    return minOfDay >= startMin && minOfDay < endMin;
  }
  return minOfDay >= startMin || minOfDay < endMin;
};

// Schedule-time rule check: is `rule` pausing a notification that would fire at
// `triggerDate`? Completions only count from max(day start, armedAt) so editing
// a rule re-arms it. (The UI-facing "is it paused right now" variant is
// isRuleCurrentlyActive below.)
export const isRuleActive = (rule, sourceMainList, triggerDate, armedAt) => {
  if (!rule || !sourceMainList) return false;
  const dayStart = startOfDayMs(triggerDate);
  const armed = armedAt ? new Date(armedAt).getTime() : 0;
  const lowerBound = Math.max(dayStart, armed);
  const dayEnd = triggerDate.getTime();
  const hitWindow = (ts) => {
    const t = ts ? new Date(ts).getTime() : 0;
    return t >= lowerBound && t < dayEnd;
  };
  if (rule.type === 'task') {
    const sl = sourceMainList.sideLists?.find((s) => s.listName === rule.sideListName);
    const task = sl?.tasks?.find((t) => t.id === rule.taskId);
    return hitWindow(task?.completedAt);
  }
  if (rule.type === 'sideList') {
    const sl = sourceMainList.sideLists?.find((s) => s.listName === rule.sideListName);
    return hitWindow(sl?.lastCompletedAt);
  }
  if (rule.type === 'mainList') {
    return (sourceMainList.sideLists ?? []).some((sl) => hitWindow(sl.lastCompletedAt));
  }
  return false;
};

// Same-interval messages are offset by (index / groupSize) of the interval so
// two 60-min reminders land 30 min apart instead of firing together.
export const computeStaggerOffsetMs = (indexInGroup, groupSize, intervalMinutes) => {
  if (groupSize <= 1) return 0;
  const intervalMs = intervalMinutes * 60 * 1000;
  return Math.round((indexInGroup * intervalMs) / groupSize);
};

export const isRuleTargetMissing = (rule, mainData) => {
  if (!rule || !mainData) return false;
  if (rule.type === 'task') {
    const sl = mainData.sideLists?.find((s) => s.listName === rule.sideListName);
    return !sl || !sl.tasks?.some((t) => t.id === rule.taskId);
  }
  if (rule.type === 'sideList') {
    return !mainData.sideLists?.some((s) => s.listName === rule.sideListName);
  }
  return false;
};

export const isRuleCurrentlyActive = (rule, mainData) => {
  if (!rule || !mainData) return false;
  const now = Date.now();
  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  const inToday = (ts) => {
    if (!ts) return false;
    const t = new Date(ts).getTime();
    return t >= dayStart.getTime() && t <= now;
  };
  if (rule.type === 'task') {
    const sl = mainData.sideLists?.find((s) => s.listName === rule.sideListName);
    const task = sl?.tasks?.find((t) => t.id === rule.taskId);
    return inToday(task?.completedAt);
  }
  if (rule.type === 'sideList') {
    const sl = mainData.sideLists?.find((s) => s.listName === rule.sideListName);
    return inToday(sl?.lastCompletedAt);
  }
  if (rule.type === 'mainList') {
    return (mainData.sideLists ?? []).some((sl) => inToday(sl.lastCompletedAt));
  }
  return false;
};

export const rulesEqual = (a, b) => {
  if (!a && !b) return true;
  if (!a || !b) return false;
  if (a.type !== b.type) return false;
  if (a.type === 'task') return a.taskId === b.taskId && a.sideListName === b.sideListName;
  if (a.type === 'sideList') return a.sideListName === b.sideListName;
  if (a.type === 'mainList') return true;
  return false;
};

export const formatRuleChip = (rule, mainData) => {
  if (!rule) return { label: '+ Add pause rule', tone: 'dim' };
  if (isRuleTargetMissing(rule, mainData)) return { label: '⚠  Rule target missing', tone: 'warn' };
  if (rule.type === 'task') {
    const sl = mainData?.sideLists?.find((s) => s.listName === rule.sideListName);
    const task = sl?.tasks?.find((t) => t.id === rule.taskId);
    return { label: `⊘  Pause when "${task?.taskName ?? '…'}" is done`, tone: 'normal' };
  }
  if (rule.type === 'sideList') {
    return { label: `⊘  Pause when "${rule.sideListName}" is done`, tone: 'normal' };
  }
  if (rule.type === 'mainList') {
    return { label: '⊘  Pause when any task is done', tone: 'normal' };
  }
  return { label: '+ Add pause rule', tone: 'dim' };
};
