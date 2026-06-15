// Pure helpers for notification "pause" rules. Extracted from Homepage so they
// can be reasoned about and (later) unit-tested independently of the UI.
//
// A rule pauses a list's reminders once its target has been completed *today*:
//   - type 'task'     → a specific task in a side list
//   - type 'sideList' → any completion in a named side list
//   - type 'mainList' → any completion anywhere in the main list

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
