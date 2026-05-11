import React, { createContext, useState, useEffect, useCallback, useMemo } from 'react';
import StorageService from '../services/storageService';
import NotificationService from '../services/notificationService';

export const AppStateContext = createContext();

const DEFAULT_MAIN_LIST_NAME = 'Tasks';

const createDefaultMainLists = () => [
  {
    name: DEFAULT_MAIN_LIST_NAME,
    sideLists: [
      {
        listName: 'Tasks',
        tasks: [{ id: 'task-default-1', taskName: 'Sample Task', creationTime: new Date() }],
        lastCompletedAt: null,
      },
      {
        listName: 'Daily Habits',
        tasks: [{ id: 'task-default-2', taskName: 'Sample Habit', creationTime: new Date() }],
        lastCompletedAt: null,
      },
    ],
    notificationMessages: [],
    notificationIntervalMinutes: 60,
  },
];

export const AppStateProvider = ({ children }) => {
  const [mainLists, setMainLists] = useState([]);
  const [currentMainList, setCurrentMainList] = useState('');
  const [currentSideList, setCurrentSideList] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const loadData = async () => {
      try {
        setIsLoading(true);
        setError(null);

        const loadedMain = await StorageService.getMainLists();
        if (loadedMain !== null && Array.isArray(loadedMain)) {
          const migrated = loadedMain.map((ml) => {
            const msgs = Array.isArray(ml.notificationMessages) ? ml.notificationMessages : [];
            const fallbackInterval = ml.notificationIntervalMinutes ?? 60;
            const normalized = msgs.map((m) => {
              const base = typeof m === 'string' ? { body: m, rule: null } : m;
              return base.intervalMinutes != null
                ? base
                : { ...base, intervalMinutes: fallbackInterval };
            });
            return { ...ml, notificationMessages: normalized };
          });
          setMainLists(migrated);
        } else {
          const defaults = createDefaultMainLists();
          setMainLists(defaults);
          await StorageService.saveMainLists(defaults);
        }
      } catch (err) {
        console.error('Error loading app data:', err);
        setError('Failed to load app data. Please restart the app.');
      } finally {
        setIsLoading(false);
      }
    };
    loadData();
  }, []);

  useEffect(() => {
    if (isLoading) return;
    const t = setTimeout(() => {
      StorageService.saveMainLists(mainLists).catch((err) => {
        console.error('Error saving mainLists:', err);
        setError('Failed to save changes. Please try again.');
      });
    }, 100);
    return () => clearTimeout(t);
  }, [mainLists, isLoading]);

  useEffect(() => {
    if (isLoading) return;
    const t = setTimeout(() => {
      NotificationService.scheduleAllMainListsNotifications({ mainLists })
        .catch((err) => console.error('Error rescheduling notifications:', err));
    }, 250);
    return () => clearTimeout(t);
  }, [mainLists, isLoading]);

  const mutateSideList = useCallback((mainName, sideName, mutator) => {
    setMainLists((prev) =>
      prev.map((ml) => {
        if (ml.name !== mainName) return ml;
        return {
          ...ml,
          sideLists: ml.sideLists.map((sl) => (sl.listName === sideName ? mutator(sl) : sl)),
        };
      })
    );
  }, []);

  // --- Task ops (scoped to currentMainList) ---
  const addTask = useCallback(
    (listName, task) => {
      if (!currentMainList) return;
      mutateSideList(currentMainList, listName, (sl) => ({
        ...sl,
        tasks: [...sl.tasks, { id: task.id || `task-${Date.now()}`, ...task }],
      }));
    },
    [currentMainList, mutateSideList]
  );

  const removeTask = useCallback(
    (listName, taskId) => {
      if (!currentMainList) return;
      mutateSideList(currentMainList, listName, (sl) => ({
        ...sl,
        tasks: sl.tasks.filter((t) => t.id !== taskId),
      }));
    },
    [currentMainList, mutateSideList]
  );

  const removeTaskByIndex = useCallback(
    (listName, idx) => {
      if (!currentMainList) return;
      mutateSideList(currentMainList, listName, (sl) => {
        if (idx < 0 || idx >= sl.tasks.length) return sl;
        const next = [...sl.tasks];
        next.splice(idx, 1);
        return { ...sl, tasks: next };
      });
    },
    [currentMainList, mutateSideList]
  );

  const updateTask = useCallback(
    (listName, taskId, updates) => {
      if (!currentMainList) return;
      mutateSideList(currentMainList, listName, (sl) => ({
        ...sl,
        tasks: sl.tasks.map((t) => (t.id === taskId ? { ...t, ...updates } : t)),
      }));
    },
    [currentMainList, mutateSideList]
  );

  const completeTaskByIndex = useCallback(
    (listName, idx) => {
      if (!currentMainList) return;
      setMainLists((prev) =>
        prev.map((ml) => {
          if (ml.name !== currentMainList) return ml;
          return {
            ...ml,
            sideLists: ml.sideLists.map((sl) => {
              if (sl.listName !== listName) return sl;
              if (idx < 0 || idx >= sl.tasks.length) return sl;
              const next = [...sl.tasks];
              const done = { ...next[idx], completedAt: new Date() };
              next.splice(idx, 1);
              next.push(done);
              return { ...sl, tasks: next, lastCompletedAt: new Date() };
            }),
          };
        })
      );
    },
    [currentMainList]
  );

  const completeTask = useCallback(
    (listName, taskId) => {
      if (!currentMainList) return;
      setMainLists((prev) =>
        prev.map((ml) => {
          if (ml.name !== currentMainList) return ml;
          return {
            ...ml,
            sideLists: ml.sideLists.map((sl) => {
              if (sl.listName !== listName) return sl;
              const idx = sl.tasks.findIndex((t) => t.id === taskId);
              if (idx === -1) return sl;
              const next = [...sl.tasks];
              const done = { ...next[idx], completedAt: new Date() };
              next.splice(idx, 1);
              next.push(done);
              return { ...sl, tasks: next, lastCompletedAt: new Date() };
            }),
          };
        })
      );
    },
    [currentMainList]
  );

  const reorderTasks = useCallback(
    (listName, reorderedTasks) => {
      if (!currentMainList) return;
      mutateSideList(currentMainList, listName, (sl) => ({ ...sl, tasks: reorderedTasks }));
    },
    [currentMainList, mutateSideList]
  );

  const moveTask = useCallback(
    (fromListName, toListName, taskId) => {
      if (!currentMainList || !fromListName || !toListName) return;
      if (fromListName === toListName) return;
      setMainLists((prev) =>
        prev.map((ml) => {
          if (ml.name !== currentMainList) return ml;
          const fromList = ml.sideLists.find((sl) => sl.listName === fromListName);
          const task = fromList?.tasks.find((t) => t.id === taskId);
          if (!task) return ml;
          return {
            ...ml,
            sideLists: ml.sideLists.map((sl) => {
              if (sl.listName === fromListName) {
                return { ...sl, tasks: sl.tasks.filter((t) => t.id !== taskId) };
              }
              if (sl.listName === toListName) {
                return { ...sl, tasks: [...sl.tasks, task] };
              }
              return sl;
            }),
          };
        })
      );
    },
    [currentMainList]
  );

  // --- Side list ops (scoped to currentMainList) ---
  const addList = useCallback(
    (sideListName) => {
      if (!currentMainList || !sideListName) return;
      setMainLists((prev) =>
        prev.map((ml) => {
          if (ml.name !== currentMainList) return ml;
          if (ml.sideLists.some((sl) => sl.listName === sideListName)) return ml;
          return {
            ...ml,
            sideLists: [
              ...ml.sideLists,
              { listName: sideListName, tasks: [], lastCompletedAt: null },
            ],
          };
        })
      );
      if (!currentSideList) setCurrentSideList(sideListName);
    },
    [currentMainList, currentSideList]
  );

  const removeList = useCallback(
    (sideListName) => {
      if (!currentMainList) return;
      setMainLists((prev) =>
        prev.map((ml) =>
          ml.name === currentMainList
            ? { ...ml, sideLists: ml.sideLists.filter((sl) => sl.listName !== sideListName) }
            : ml
        )
      );
      if (currentSideList === sideListName) setCurrentSideList('');
    },
    [currentMainList, currentSideList]
  );

  const switchList = useCallback((sideListName) => {
    setCurrentSideList(sideListName);
  }, []);

  const updateLists = useCallback(
    (reorderedSideLists) => {
      if (!currentMainList) return;
      setMainLists((prev) =>
        prev.map((ml) =>
          ml.name === currentMainList ? { ...ml, sideLists: reorderedSideLists } : ml
        )
      );
    },
    [currentMainList]
  );

  const moveSideList = useCallback(
    (sideListName, targetMainListName) => {
      if (!currentMainList || !sideListName || !targetMainListName) return false;
      if (currentMainList === targetMainListName) return false;

      const source = mainLists.find((ml) => ml.name === currentMainList);
      const target = mainLists.find((ml) => ml.name === targetMainListName);
      if (!source || !target) return false;
      const sideList = source.sideLists.find((sl) => sl.listName === sideListName);
      if (!sideList) return false;
      if (target.sideLists.some((sl) => sl.listName === sideListName)) return false;

      setMainLists((prev) =>
        prev.map((ml) => {
          if (ml.name === currentMainList) {
            return {
              ...ml,
              sideLists: ml.sideLists.filter((sl) => sl.listName !== sideListName),
            };
          }
          if (ml.name === targetMainListName) {
            return { ...ml, sideLists: [...ml.sideLists, sideList] };
          }
          return ml;
        })
      );

      if (currentSideList === sideListName) setCurrentSideList('');
      return true;
    },
    [mainLists, currentMainList, currentSideList]
  );

  // --- Main list ops ---
  const addMainList = useCallback((name) => {
    if (!name) return;
    setMainLists((prev) => {
      if (prev.some((ml) => ml.name === name)) return prev;
      return [
        ...prev,
        {
          name,
          sideLists: [{ listName: 'Tasks', tasks: [], lastCompletedAt: null }],
          notificationMessages: [],
          notificationIntervalMinutes: 60,
        },
      ];
    });
  }, []);

  const setNotificationMessages = useCallback((mainListName, messages) => {
    setMainLists((prev) =>
      prev.map((ml) =>
        ml.name === mainListName ? { ...ml, notificationMessages: messages } : ml
      )
    );
  }, []);

  const removeMainList = useCallback(
    (name) => {
      setMainLists((prev) => prev.filter((ml) => ml.name !== name));
      if (currentMainList === name) {
        setCurrentMainList('');
        setCurrentSideList('');
      }
    },
    [currentMainList]
  );

  const renameMainList = useCallback(
    (oldName, newName) => {
      if (!newName || oldName === newName) return;
      setMainLists((prev) => {
        if (prev.some((ml) => ml.name === newName)) return prev;
        return prev.map((ml) => (ml.name === oldName ? { ...ml, name: newName } : ml));
      });
      if (currentMainList === oldName) setCurrentMainList(newName);
    },
    [currentMainList]
  );

  const switchMainList = useCallback(
    (name) => {
      const ml = mainLists.find((m) => m.name === name);
      setCurrentMainList(name);
      setCurrentSideList(ml && ml.sideLists.length > 0 ? ml.sideLists[0].listName : '');
    },
    [mainLists]
  );

  const exitToTileGrid = useCallback(() => {
    setCurrentMainList('');
    setCurrentSideList('');
  }, []);

  // --- Derived ---
  const currentMainData = useMemo(
    () => mainLists.find((ml) => ml.name === currentMainList),
    [mainLists, currentMainList]
  );

  const lists = currentMainData?.sideLists ?? [];
  const currentList = currentSideList;

  const currentListData = useMemo(() => {
    const found = lists.find((sl) => sl.listName === currentSideList);
    return found || { listName: '', tasks: [] };
  }, [lists, currentSideList]);

  const contextValue = useMemo(
    () => ({
      mainLists,
      currentMainList,
      currentMainData,
      addMainList,
      removeMainList,
      renameMainList,
      switchMainList,
      exitToTileGrid,
      setNotificationMessages,
      lists,
      currentList,
      currentListData,
      addList,
      removeList,
      switchList,
      updateLists,
      moveSideList,
      addTask,
      removeTask,
      removeTaskByIndex,
      updateTask,
      reorderTasks,
      moveTask,
      completeTask,
      completeTaskByIndex,
      isLoading,
      error,
    }),
    [
      mainLists,
      currentMainList,
      currentMainData,
      addMainList,
      removeMainList,
      renameMainList,
      switchMainList,
      exitToTileGrid,
      setNotificationMessages,
      lists,
      currentList,
      currentListData,
      addList,
      removeList,
      switchList,
      updateLists,
      moveSideList,
      addTask,
      removeTask,
      removeTaskByIndex,
      updateTask,
      reorderTasks,
      moveTask,
      completeTask,
      completeTaskByIndex,
      isLoading,
      error,
    ]
  );

  return <AppStateContext.Provider value={contextValue}>{children}</AppStateContext.Provider>;
};
