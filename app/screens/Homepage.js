import { useState, useCallback, useEffect, useMemo } from "react";
import { View, StyleSheet, Text, Modal, SafeAreaView, TouchableOpacity, TextInput, KeyboardAvoidingView, FlatList, ActivityIndicator, ActionSheetIOS, Alert, Switch, AppState } from "react-native";
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withRepeat,
    withTiming,
    interpolateColor,
    Easing,
} from 'react-native-reanimated';
import NotificationService from "../services/notificationService";
import StorageService from "../services/storageService";
import * as Sharing from 'expo-sharing';
import { Paths, File } from 'expo-file-system';
import * as Clipboard from 'expo-clipboard';
import Task from "../components/Task";
import List from "../components/List";
import GlassCard from "../components/GlassCard";
import IntervalSlider, { formatTimeOfDay } from "../components/IntervalSlider";
import { SymbolView } from 'expo-symbols';
import moment from "moment";
import DraggableFlatList, { ScaleDecorator } from 'react-native-draggable-flatlist';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { LinearGradient } from 'expo-linear-gradient';
import { useLists, useListTasks, useAppLoading, useMainLists } from '../hooks/useAppState';
import { tapLight, selection, warning, success } from '../services/haptics';
import { log } from '../services/logger';
import { makeId } from '../utils/id';
import { rulesEqual } from '../utils/notificationRules';
import { computeTagRecovery } from '../utils/tagStats';
import TagRecovery from '../components/TagRecovery';
import CompletionBurst from '../components/CompletionBurst';
import MessagesModal from '../components/modals/MessagesModal';
import TaskEditorModal from '../components/modals/TaskEditorModal';
import FocusGateModal from '../components/modals/FocusGateModal';
import { evaluateGate, hasAnySelection, DEFAULT_GATE_CONFIG } from '../utils/focusGate';
import * as FocusGate from '../services/focusGateService';

const TIME_OF_DAY_VALUES = Array.from({ length: 48 }, (_, i) => i * 30);

// Returns a human-readable problem string for an import payload, or null if valid.
const validateBackupPayload = (payload) => {
    if (!payload || typeof payload !== 'object') return 'Not a backup object.';
    if (payload.app !== 'ADHDone') return 'Missing the ADHDone marker — is this a backup export?';
    if (payload.version !== 1) return `Unsupported backup version: ${String(payload.version)}.`;
    if (!Array.isArray(payload.mainLists)) return 'Backup contains no lists array.';
    const mainNames = new Set();
    for (const ml of payload.mainLists) {
        if (typeof ml?.name !== 'string' || !Array.isArray(ml?.sideLists)) {
            return 'A main list entry is malformed.';
        }
        if (mainNames.has(ml.name)) return `Duplicate main list name: "${ml.name}".`;
        mainNames.add(ml.name);
        const sideNames = new Set();
        for (const sl of ml.sideLists) {
            if (typeof sl?.listName !== 'string' || !Array.isArray(sl?.tasks)) {
                return 'A side list entry is malformed.';
            }
            if (sideNames.has(sl.listName)) {
                return `Duplicate side list name "${sl.listName}" in "${ml.name}".`;
            }
            sideNames.add(sl.listName);
        }
    }
    return null;
};

function Homepage(props){
    const [modalVisible, setModalVisible] = useState(false);
    const [menuVisible, setMenuPanalVisible] = useState(false);
    const [taskListVisible, setTaskListVisible] = useState(false);
    const [settingsVisible, setSettingsVisible] = useState(false);
    const [notificationsEnabled, setNotificationsEnabled] = useState(true);
    const [task, setTask] = useState('');
    const [newListName, setNewListName] = useState('');
    const [messagesModalVisible, setMessagesModalVisible] = useState(false);
    const [newMessageText, setNewMessageText] = useState('');
    const [scheduledModalVisible, setScheduledModalVisible] = useState(false);
    const [scheduledList, setScheduledList] = useState([]);
    const [quietHoursModalVisible, setQuietHoursModalVisible] = useState(false);
    const [quietHoursEnabled, setQuietHoursEnabled] = useState(false);
    const [quietHoursStart, setQuietHoursStart] = useState(0);
    const [quietHoursEnd, setQuietHoursEnd] = useState(480);
    const [messageEditor, setMessageEditor] = useState({ visible: false, messageIndex: -1, draftBody: '', draftRule: null, draftInterval: 60 });
    const [taskEditor, setTaskEditor] = useState({
        visible: false,
        taskId: null,
        draftName: '',
        draftNotes: '',
        draftVariables: [],
        draftTags: [],
        creationTime: null,
        completedAt: null,
    });
    const [tagInputDraft, setTagInputDraft] = useState('');
    const [activeTags, setActiveTags] = useState(() => new Set());
    const [recoveryVisible, setRecoveryVisible] = useState(false);
    const [completionLogger, setCompletionLogger] = useState({
        visible: false,
        taskId: null,
        taskName: '',
        drafts: [],
    });
    // Incremented per completion; keys a remount of the one-shot burst animation.
    const [burstCount, setBurstCount] = useState(0);
    const [focusGateVisible, setFocusGateVisible] = useState(false);
    const [gateConfig, setGateConfig] = useState(DEFAULT_GATE_CONFIG);
    const [gateSupported, setGateSupported] = useState(false);
    const [gateAuthStatus, setGateAuthStatus] = useState(FocusGate.AUTH_STATUS.notDetermined);
    const [gateSelectionMeta, setGateSelectionMeta] = useState(null);
    const [gateShieldActive, setGateShieldActive] = useState(false);

    useEffect(() => {
        NotificationService.getNotificationsEnabled().then(setNotificationsEnabled);
        NotificationService.getQuietHours().then(({ enabled, startMinutes, endMinutes }) => {
            setQuietHoursEnabled(enabled);
            setQuietHoursStart(startMinutes);
            setQuietHoursEnd(endMinutes);
        });
    }, []);

    const handleToggleNotifications = useCallback(async (next) => {
        setNotificationsEnabled(next);
        await NotificationService.setNotificationsEnabled(next);
    }, []);

    // --- Focus Gate ---------------------------------------------------------

    useEffect(() => {
        const supported = FocusGate.isSupported();
        setGateSupported(supported);
        FocusGate.loadGateConfig().then(setGateConfig);
        if (!supported) return undefined;

        setGateSelectionMeta(FocusGate.getSelectionMetadata());

        // Screen Time reports notDetermined for a moment after launch even when
        // the user already approved, so a plain read here would leave the gate
        // asking for access it already has for the whole session — the AppState
        // listener below cannot correct it, since 'change' never fires for the
        // active state the app launches into. Poll until it settles.
        const abortController = new AbortController();
        FocusGate.pollAuthorizationStatus(abortController).then((status) => {
            if (!abortController.signal.aborted) setGateAuthStatus(status);
        });
        return () => abortController.abort();
    }, []);

    // Use our custom hooks
    const { isLoading, error } = useAppLoading();
    const { lists, currentList, currentListData, addList, removeList, switchList, updateLists, moveSideList } = useLists();
    const { mainLists, currentMainList, currentMainData, exitToTileGrid, replaceMainLists, setNotificationMessages } = useMainLists();
    const {
        addTaskToList,
        removeTaskFromList,
        updateTaskInList,
        moveTaskFromList,
        completeTaskInList,
    } = useListTasks(currentList);

    // Apply the gate's decision. Idempotent, so it is safe to run on every
    // completion, foreground and config change.
    const syncGate = useCallback((config) => {
        if (!FocusGate.isSupported()) return;
        const { shouldBlock, reason } = evaluateGate(config ?? gateConfig, mainLists);
        FocusGate.applyBlock(shouldBlock, reason);
        setGateShieldActive(FocusGate.isShieldActive());
    }, [gateConfig, mainLists]);

    // Re-evaluate whenever the data or the config changes. This single effect
    // covers task completion, task/list deletion, and a backup import — all of
    // which land as a new mainLists reference.
    useEffect(() => {
        syncGate();
    }, [syncGate]);

    // The day rolling over past midnight changes the answer without changing
    // any data, so re-evaluate when the app returns to the foreground.
    useEffect(() => {
        const sub = AppState.addEventListener('change', (next) => {
            if (next === 'active') {
                if (FocusGate.isSupported()) {
                    setGateAuthStatus(FocusGate.getAuthorizationStatus());
                }
                syncGate();
            }
        });
        return () => sub.remove();
    }, [syncGate]);

    const handleOpenFocusGate = useCallback(() => {
        tapLight();
        // The modal is a controlled component that never re-checks anything, so
        // refresh here rather than let it render a snapshot taken at launch. By
        // now Screen Time has long settled, so the synchronous reads are sound.
        if (FocusGate.isSupported()) {
            setGateAuthStatus(FocusGate.getAuthorizationStatus());
            setGateSelectionMeta(FocusGate.getSelectionMetadata());
        }
        setFocusGateVisible(true);
        setSettingsVisible(false);
    }, []);

    const handleRequestGateAuth = useCallback(async () => {
        tapLight();
        const status = await FocusGate.requestAuthorization();
        setGateAuthStatus(status);
    }, []);

    // The picker sheet persists the selection natively under SELECTION_ID; the
    // event carries only counts, never the selection token itself.
    const handleGateSelectionChange = useCallback((event) => {
        setGateSelectionMeta(event?.nativeEvent ?? null);
        syncGate();
    }, [syncGate]);

    const handleGateConfigChange = useCallback(async (next) => {
        setGateConfig(next);
        await FocusGate.saveGateConfig(next);
        if (next.enabled) {
            await FocusGate.scheduleDailyRearm(next.rearmHour);
        } else {
            // Stop the daily schedule AND lift any live shield, so disabling
            // never strands the user behind a block nothing will clear.
            FocusGate.teardown();
        }
        syncGate(next);
    }, [syncGate]);

    const handleAddTask = () => {
        if (!task.trim()) return;

        const newTask = {
            id: makeId(),
            taskName: task,
            creationTime: new Date()
        };

        log("Adding new task:", newTask);
        tapLight();
        addTaskToList(newTask);
        setTask(''); // Clear input
        setModalVisible(false);
    };

    const handleSwitchList = useCallback((listName) => {
        switchList(listName);
        setMenuPanalVisible(false);
    }, [switchList]);
    
    const handleReorderLists = (reorderedLists) => {
        log("Handling list reorder:", reorderedLists.map(l => l.listName));
        // Update the entire lists array in the context
        updateLists(reorderedLists);
    };

    const handleAddNewList = () => {
        const trimmed = newListName.trim();
        if (!trimmed) return;

        if (lists.some((l) => l.listName === trimmed)) {
            warning();
            Alert.alert('Duplicate', `A list called "${trimmed}" already exists.`);
            return;
        }

        tapLight();
        addList(trimmed);
        setNewListName(''); // Clear input
        setTaskListVisible(false);
    };

    const handleMoveList = useCallback((sideListName) => {
        const targets = mainLists.filter((ml) => ml.name !== currentMainList);
        if (targets.length === 0) {
            Alert.alert('No destination', 'Create another main list before moving.');
            return;
        }
        const options = [...targets.map((ml) => ml.name), 'Cancel'];
        const cancelButtonIndex = options.length - 1;

        ActionSheetIOS.showActionSheetWithOptions(
            {
                title: `Move "${sideListName}" to...`,
                options,
                cancelButtonIndex,
            },
            (idx) => {
                if (idx === cancelButtonIndex) return;
                const target = targets[idx];
                if (!target) return;
                const ok = moveSideList(sideListName, target.name);
                if (!ok) {
                    Alert.alert(
                        'Move failed',
                        `"${target.name}" already has a list named "${sideListName}".`
                    );
                }
            }
        );
    }, [mainLists, currentMainList, moveSideList]);

    const currentMessages = useMemo(() => {
        const ml = mainLists.find((m) => m.name === currentMainList);
        return ml?.notificationMessages ?? [];
    }, [mainLists, currentMainList]);

    // Ordering (oldest completion first) is independent of "now", so this only
    // needs to recompute when the underlying tasks change.
    const tagRecovery = useMemo(
        () => computeTagRecovery(currentMainData?.sideLists),
        [currentMainData?.sideLists]
    );

    // Tags present in the current side list, ordered to match the recovery view
    // (never-worked first, then longest-since-completed) instead of alphabetically.
    const availableTags = useMemo(() => {
        const present = new Set();
        for (const task of currentListData?.tasks ?? []) {
            for (const t of task.tags ?? []) {
                const key = (t ?? '').trim().toLowerCase();
                if (key) present.add(key);
            }
        }
        return tagRecovery
            .filter((r) => present.has(r.tag.toLowerCase()))
            .map((r) => r.tag);
    }, [currentListData?.tasks, tagRecovery]);

    const visibleTasks = useMemo(() => {
        const tasks = currentListData?.tasks ?? [];
        if (activeTags.size === 0) return tasks;
        const lowered = new Set([...activeTags].map((t) => t.toLowerCase()));
        return tasks.filter((task) =>
            (task.tags ?? []).some((t) => lowered.has((t ?? '').toLowerCase()))
        );
    }, [currentListData?.tasks, activeTags]);

    useEffect(() => {
        setActiveTags(new Set());
    }, [currentList]);

    // If a filtered tag is removed from its last task it vanishes from the strip,
    // leaving no chip to deselect. Prune active filters down to tags that still
    // exist so the view never gets stuck — clearing back to "All" when none remain.
    useEffect(() => {
        setActiveTags((prev) => {
            if (prev.size === 0) return prev;
            const available = new Set(availableTags.map((t) => t.toLowerCase()));
            const next = new Set([...prev].filter((t) => available.has(t.toLowerCase())));
            return next.size === prev.size ? prev : next;
        });
    }, [availableTags]);

    const handleOpenMessages = useCallback(() => {
        setNewMessageText('');
        setMessagesModalVisible(true);
        setSettingsVisible(false);
        tapLight();
    }, []);

    const handleCloseMessages = useCallback(() => {
        tapLight();
        setMessagesModalVisible(false);
        setSettingsVisible(true);
    }, []);

    const persistAndReschedule = useCallback(async (next) => {
        setNotificationMessages(currentMainList, next);
    }, [currentMainList, setNotificationMessages]);

    const persistQuietHours = useCallback(async (next) => {
        await NotificationService.setQuietHours(next);
        await NotificationService.scheduleAllMainListsNotifications();
    }, []);

    const handleOpenQuietHours = useCallback(() => {
        tapLight();
        setQuietHoursModalVisible(true);
        setSettingsVisible(false);
    }, []);

    const handleCloseQuietHours = useCallback(() => {
        tapLight();
        setQuietHoursModalVisible(false);
        setSettingsVisible(true);
    }, []);

    const handleQuietToggle = useCallback(async (next) => {
        setQuietHoursEnabled(next);
        selection();
        await persistQuietHours({
            enabled: next,
            startMinutes: quietHoursStart,
            endMinutes: quietHoursEnd,
        });
    }, [quietHoursStart, quietHoursEnd, persistQuietHours]);

    const handleQuietStartChange = useCallback(async (mins) => {
        setQuietHoursStart(mins);
        selection();
        await persistQuietHours({
            enabled: quietHoursEnabled,
            startMinutes: mins,
            endMinutes: quietHoursEnd,
        });
    }, [quietHoursEnabled, quietHoursEnd, persistQuietHours]);

    const handleQuietEndChange = useCallback(async (mins) => {
        setQuietHoursEnd(mins);
        selection();
        await persistQuietHours({
            enabled: quietHoursEnabled,
            startMinutes: quietHoursStart,
            endMinutes: mins,
        });
    }, [quietHoursEnabled, quietHoursStart, persistQuietHours]);

    const handleAddMessage = useCallback(async () => {
        const trimmed = newMessageText.trim();
        if (!trimmed) return;
        tapLight();
        setNewMessageText('');
        const defaultInterval = currentMainData?.notificationIntervalMinutes ?? 60;
        await persistAndReschedule([
            ...currentMessages,
            { body: trimmed, rule: null, armedAt: Date.now(), intervalMinutes: defaultInterval },
        ]);
    }, [newMessageText, currentMessages, persistAndReschedule, currentMainData]);

    const handleDeleteMessage = useCallback(async (idx) => {
        warning();
        await persistAndReschedule(currentMessages.filter((_, i) => i !== idx));
    }, [currentMessages, persistAndReschedule]);

    const handleOpenMessageEditor = useCallback((index) => {
        tapLight();
        const msg = currentMessages[index];
        const body = typeof msg === 'string' ? msg : msg?.body ?? '';
        const rule = typeof msg === 'string' ? null : msg?.rule ?? null;
        const interval = (typeof msg === 'string' ? null : msg?.intervalMinutes)
            ?? currentMainData?.notificationIntervalMinutes ?? 60;
        setMessageEditor({ visible: true, messageIndex: index, draftBody: body, draftRule: rule, draftInterval: interval });
    }, [currentMessages, currentMainData]);

    const handleCloseMessageEditor = useCallback(() => {
        setMessageEditor({ visible: false, messageIndex: -1, draftBody: '', draftRule: null, draftInterval: 60 });
    }, []);

    const handleSaveMessage = useCallback(async () => {
        const { messageIndex, draftBody, draftRule, draftInterval } = messageEditor;
        if (messageIndex < 0) {
            handleCloseMessageEditor();
            return;
        }
        const trimmed = (draftBody ?? '').trim();
        if (!trimmed) return;
        tapLight();
        let cleanRule = draftRule;
        if (cleanRule?.type === 'task' && (!cleanRule.taskId || !cleanRule.sideListName)) cleanRule = null;
        else if (cleanRule?.type === 'sideList' && !cleanRule.sideListName) cleanRule = null;

        const prev = currentMessages[messageIndex];
        const prevRule = typeof prev === 'string' ? null : prev?.rule ?? null;
        const prevArmedAt = typeof prev === 'string' ? null : prev?.armedAt ?? null;
        const ruleChanged = !rulesEqual(prevRule, cleanRule);
        const nextArmedAt = ruleChanged ? Date.now() : prevArmedAt;

        const next = currentMessages.map((m, i) =>
            i === messageIndex
                ? { body: trimmed, rule: cleanRule, armedAt: nextArmedAt, intervalMinutes: draftInterval }
                : m
        );
        handleCloseMessageEditor();
        await persistAndReschedule(next);
    }, [messageEditor, currentMessages, persistAndReschedule, handleCloseMessageEditor]);

    const handleOpenTaskEditor = useCallback((task) => {
        if (!task) return;
        tapLight();
        setTaskEditor({
            visible: true,
            taskId: task.id,
            draftName: task.taskName ?? '',
            draftNotes: task.notes ?? '',
            draftVariables: (task.variables ?? []).map((v) => ({
                name: v.name ?? '',
                lastValue: v.lastValue ?? '',
            })),
            draftTags: [...(task.tags ?? [])],
            creationTime: task.creationTime ?? null,
            completedAt: task.completedAt ?? null,
        });
        setTagInputDraft('');
    }, []);

    const handleCloseTaskEditor = useCallback(() => {
        setTaskEditor((r) => ({ ...r, visible: false }));
    }, []);

    const cleanVariables = (vars) =>
        (vars ?? [])
            .map((v) => ({ name: (v.name ?? '').trim(), lastValue: v.lastValue ?? '' }))
            .filter((v) => v.name.length > 0);

    const cleanTags = (tags) => {
        const seen = new Set();
        const out = [];
        for (const t of tags ?? []) {
            const trimmed = (t ?? '').trim();
            if (!trimmed) continue;
            const key = trimmed.toLowerCase();
            if (seen.has(key)) continue;
            seen.add(key);
            out.push(trimmed);
        }
        return out;
    };

    const addTagFromInput = useCallback(() => {
        const trimmed = tagInputDraft.trim();
        if (!trimmed) return;
        tapLight();
        setTaskEditor((r) => {
            const exists = r.draftTags.some((t) => t.toLowerCase() === trimmed.toLowerCase());
            if (exists) return r;
            return { ...r, draftTags: [...r.draftTags, trimmed] };
        });
        setTagInputDraft('');
    }, [tagInputDraft]);

    const tagsWithPending = (draftTags) => {
        const pending = (tagInputDraft ?? '').trim();
        return pending ? [...(draftTags ?? []), pending] : (draftTags ?? []);
    };

    const handleSaveTask = useCallback(() => {
        const { taskId, draftName, draftNotes, draftVariables, draftTags } = taskEditor;
        if (!taskId) {
            handleCloseTaskEditor();
            return;
        }
        const trimmed = (draftName ?? '').trim();
        if (!trimmed) return;
        tapLight();
        updateTaskInList(taskId, {
            taskName: trimmed,
            notes: draftNotes ?? '',
            variables: cleanVariables(draftVariables),
            tags: cleanTags(tagsWithPending(draftTags)),
        });
        handleCloseTaskEditor();
    }, [taskEditor, tagInputDraft, updateTaskInList, handleCloseTaskEditor]);

    const handleMoveTaskTo = useCallback((toListName) => {
        const { taskId, draftName, draftNotes, draftVariables, draftTags } = taskEditor;
        if (!taskId || !toListName || toListName === currentList) return;
        selection();
        const trimmed = (draftName ?? '').trim();
        if (trimmed) {
            updateTaskInList(taskId, {
                taskName: trimmed,
                notes: draftNotes ?? '',
                variables: cleanVariables(draftVariables),
                tags: cleanTags(tagsWithPending(draftTags)),
            });
        }
        moveTaskFromList(toListName, taskId);
        handleCloseTaskEditor();
    }, [taskEditor, tagInputDraft, currentList, updateTaskInList, moveTaskFromList, handleCloseTaskEditor]);

    const handleCompleteTask = useCallback((task) => {
        if (!task?.id) return;
        if (task.variables?.length > 0) {
            tapLight();
            setCompletionLogger({
                visible: true,
                taskId: task.id,
                taskName: task.taskName ?? '',
                drafts: task.variables.map((v) => ({ name: v.name, value: v.lastValue ?? '' })),
            });
            return;
        }
        completeTaskInList(task.id);
        setActiveTags((prev) => (prev.size > 0 ? new Set() : prev));
        setBurstCount((c) => c + 1);
    }, [completeTaskInList]);

    const handleCloseCompletionLogger = useCallback(() => {
        setCompletionLogger((r) => ({ ...r, visible: false }));
    }, []);

    const handleSaveCompletion = useCallback(() => {
        const { taskId, drafts } = completionLogger;
        if (!taskId) {
            handleCloseCompletionLogger();
            return;
        }
        success();
        updateTaskInList(taskId, {
            variables: drafts.map((d) => ({ name: d.name, lastValue: d.value ?? '' })),
        });
        completeTaskInList(
            taskId,
            Object.fromEntries(drafts.map((d) => [d.name, d.value ?? '']))
        );
        setActiveTags((prev) => (prev.size > 0 ? new Set() : prev));
        setBurstCount((c) => c + 1);
        handleCloseCompletionLogger();
    }, [completionLogger, updateTaskInList, completeTaskInList, handleCloseCompletionLogger]);

    const handleOpenScheduled = useCallback(async () => {
        tapLight();
        const list = await NotificationService.getUpcomingNotifications();
        setScheduledList(list);
        setScheduledModalVisible(true);
        setSettingsVisible(false);
    }, []);

    const handleRefreshScheduled = useCallback(async () => {
        tapLight();
        const list = await NotificationService.getUpcomingNotifications();
        setScheduledList(list);
    }, []);

    const handleExport = useCallback(() => {
        tapLight();
        const payload = {
            app: 'ADHDone',
            version: 1,
            exportedAt: new Date().toISOString(),
            mainLists,
        };
        const json = JSON.stringify(payload, null, 2);
        ActionSheetIOS.showActionSheetWithOptions(
            {
                title: 'Export ADHDone Data',
                options: ['Copy as JSON', 'Save Backup File…', 'Cancel'],
                cancelButtonIndex: 2,
            },
            async (idx) => {
                if (idx === 0) {
                    try {
                        await Clipboard.setStringAsync(json);
                        success();
                        Alert.alert('Copied', 'Backup JSON copied to clipboard.');
                    } catch (err) {
                        console.error('Copy export failed:', err);
                        Alert.alert('Copy failed', 'Could not copy backup to clipboard.');
                    }
                } else if (idx === 1) {
                    try {
                        const dateStamp = new Date().toISOString().slice(0, 10);
                        const filename = `adhdone-backup-${dateStamp}.json`;
                        const file = new File(Paths.cache, filename);
                        if (file.exists) file.delete();
                        file.create();
                        file.write(json);
                        if (!(await Sharing.isAvailableAsync())) {
                            Alert.alert('Sharing unavailable', 'This device cannot share files.');
                            return;
                        }
                        await Sharing.shareAsync(file.uri, {
                            mimeType: 'application/json',
                            UTI: 'public.json',
                            dialogTitle: 'ADHDone Backup',
                        });
                    } catch (err) {
                        console.error('File export failed:', err);
                        Alert.alert('Export failed', 'Could not create backup file.');
                    }
                }
            }
        );
    }, [mainLists]);

    const handleImport = useCallback(async () => {
        tapLight();
        let payload;
        try {
            const raw = await Clipboard.getStringAsync();
            if (!raw?.trim()) {
                Alert.alert(
                    'Clipboard empty',
                    'Copy an ADHDone backup first (Export Data → Copy as JSON).'
                );
                return;
            }
            payload = JSON.parse(raw);
        } catch {
            Alert.alert('Invalid backup', 'The clipboard does not contain valid JSON.');
            return;
        }
        const problem = validateBackupPayload(payload);
        if (problem) {
            Alert.alert('Invalid backup', problem);
            return;
        }
        const listCount = payload.mainLists.length;
        const taskCount = payload.mainLists.reduce(
            (sum, ml) => sum + ml.sideLists.reduce((s, sl) => s + sl.tasks.length, 0),
            0
        );
        Alert.alert(
            'Replace all data?',
            `Import ${listCount} main list${listCount === 1 ? '' : 's'} with ${taskCount} task${taskCount === 1 ? '' : 's'}? This replaces everything currently in the app.`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Replace',
                    style: 'destructive',
                    onPress: async () => {
                        // Safety hatch: stash the outgoing data before overwriting.
                        const snapshotOk = await StorageService.storeData(
                            'mainListsPreImportBackup',
                            { savedAt: new Date().toISOString(), mainLists }
                        );
                        if (!snapshotOk) {
                            Alert.alert(
                                'Import cancelled',
                                'Could not snapshot the current data first, so nothing was changed.'
                            );
                            return;
                        }
                        success();
                        replaceMainLists(payload.mainLists);
                    },
                },
            ]
        );
    }, [mainLists, replaceMainLists]);

    const pulse = useSharedValue(0);
    useEffect(() => {
        pulse.value = withRepeat(
            withTiming(1, { duration: 2500, easing: Easing.inOut(Easing.sin) }),
            -1,
            true
        );
    }, [pulse]);

    const titleAnimatedStyle = useAnimatedStyle(() => ({
        color: interpolateColor(pulse.value, [0, 1], ['#ffffff', '#a5b4fc']),
        textShadowColor: interpolateColor(
            pulse.value,
            [0, 1],
            ['rgba(165, 180, 252, 0)', 'rgba(165, 180, 252, 0.6)']
        ),
    }));

    const cycleList = useCallback((direction) => {
        if (!lists || lists.length <= 1) return;
        const idx = lists.findIndex(l => l.listName === currentList);
        if (idx === -1) return;
        const nextIdx = (idx + direction + lists.length) % lists.length;
        selection();
        switchList(lists[nextIdx].listName);
    }, [lists, currentList, switchList]);

    return(
        <View style={styles.container}>
            {isLoading ? (
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color="#fff" />
                    <Text style={styles.loadingText}>Loading...</Text>
                </View>
            ) : error ? (
                <View style={styles.errorContainer}>
                    <Text style={styles.errorText}>Error: {error}</Text>
                </View>
            ) : (
                <>
                    <Modal visible={modalVisible} animationType="slide" transparent={true}>
                        <GlassCard
                            style={styles.modalContent}
                            colorScheme="dark"
                            tintColor="rgba(46, 46, 80, 0.45)"
                        >
                            <TextInput
                                style={styles.inputForms}
                                onChangeText={text => setTask(text)}
                                placeholder={'Task Name'}
                                placeholderTextColor="rgba(255,255,255,0.5)"
                                value={task}
                            />
                        </GlassCard>

                        <GlassCard
                            style={styles.buttonWrapper}
                            colorScheme="dark"
                            tintColor="rgba(46, 46, 80, 0.45)"
                        >
                            <TouchableOpacity onPress={() => setModalVisible(false)}>
                                <SymbolView name="minus.circle.fill" size={60} tintColor="white" />
                            </TouchableOpacity>

                            <TouchableOpacity onPress={handleAddTask}>
                                <SymbolView name="plus.circle.fill" size={60} tintColor="white" />
                            </TouchableOpacity>
                        </GlassCard>
                    </Modal>

                    <Modal visible={menuVisible} animationType="slide" transparent={true}>
                      <GestureHandlerRootView style={{ flex: 1 }}>
                        <LinearGradient
                          style={{ flex: 1 }}
                          colors={['#1a1a3a', '#0f0f24', '#070712', '#000000']}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 0, y: 1 }}
                        >
                          <SafeAreaView style={styles.menuContainer}>
                            <GlassCard
                                style={styles.topBar}
                                colorScheme="dark"
                                tintColor="rgba(46, 46, 80, 0.45)"
                            >
                                <TouchableOpacity onPress={() => setMenuPanalVisible(false)}>
                                    <SymbolView name="xmark.circle.fill" size={40} tintColor="white" />
                                </TouchableOpacity>

                                <Text style={styles.drawerTitle}>Lists</Text>

                                <TouchableOpacity onPress={() => setTaskListVisible(true)}>
                                    <SymbolView name="plus.circle.fill" size={40} tintColor="white" />
                                </TouchableOpacity>
                            </GlassCard>

                            <View style={styles.menuLists}>
                                <DraggableFlatList
                                    data={lists}
                                    keyExtractor={(item) => item.listName}
                                    onDragEnd={({ data }) => {
                                        log("Reordering lists:", data.map(l => l.listName));
                                        // Update the lists state directly in context
                                        // We need to add a function to handle this
                                        handleReorderLists(data);
                                    }}
                                    renderItem={({ item, drag, isActive }) => (
                                        <ScaleDecorator>
                                            <List
                                                text={item.listName}
                                                drag={drag}
                                                isActive={isActive}
                                                onSelect={handleSwitchList}
                                                onRemove={removeList}
                                                onMove={handleMoveList}
                                            />
                                        </ScaleDecorator>
                                    )}
                                />
                            </View>
                          </SafeAreaView>
                        </LinearGradient>
                      </GestureHandlerRootView>

                        <Modal visible={taskListVisible} animationType="slide" transparent={true}>
                            <GlassCard
                                style={styles.modalContent}
                                colorScheme="dark"
                                tintColor="rgba(46, 46, 80, 0.45)"
                            >
                                <TextInput
                                    style={styles.inputForms}
                                    onChangeText={text => setNewListName(text)}
                                    value={newListName}
                                    placeholder={'Task List Name'}
                                    placeholderTextColor="rgba(255,255,255,0.5)"
                                />
                            </GlassCard>

                            <GlassCard
                                style={styles.buttonWrapper}
                                colorScheme="dark"
                                tintColor="rgba(46, 46, 80, 0.45)"
                            >
                                <TouchableOpacity onPress={() => setTaskListVisible(false)}>
                                    <SymbolView name="minus.circle.fill" size={60} tintColor="white" />
                                </TouchableOpacity>

                                <TouchableOpacity onPress={handleAddNewList}>
                                    <SymbolView name="plus.circle.fill" size={60} tintColor="white" />
                                </TouchableOpacity>
                            </GlassCard>
                        </Modal>
                    </Modal>

                    <Modal visible={settingsVisible} animationType="slide" transparent={true}>
                        <GlassCard
                            style={styles.modalContent}
                            colorScheme="dark"
                            tintColor="rgba(46, 46, 80, 0.45)"
                        >
                            <Text style={styles.settingsTitle}>Notification Settings</Text>

                            <View style={styles.settingsRow}>
                                <Text style={styles.settingsRowLabel}>Notifications</Text>
                                <Switch
                                    value={notificationsEnabled}
                                    onValueChange={handleToggleNotifications}
                                />
                            </View>

                            {currentMainList ? (
                                <TouchableOpacity onPress={handleOpenMessages} style={styles.settingsRow}>
                                    <Text style={styles.settingsRowLabel}>Manage Messages</Text>
                                    <SymbolView name="chevron.right" size={20} tintColor="white" />
                                </TouchableOpacity>
                            ) : null}

                            <TouchableOpacity onPress={handleOpenQuietHours} style={styles.settingsRow}>
                                <Text style={styles.settingsRowLabel}>Quiet Hours</Text>
                                <View style={styles.settingsRowValue}>
                                    <Text style={styles.settingsValueText}>
                                        {quietHoursEnabled
                                            ? `${formatTimeOfDay(quietHoursStart)} – ${formatTimeOfDay(quietHoursEnd)}`
                                            : 'Off'}
                                    </Text>
                                    <SymbolView name="chevron.right" size={20} tintColor="white" />
                                </View>
                            </TouchableOpacity>

                            <TouchableOpacity onPress={handleOpenScheduled} style={styles.settingsRow}>
                                <Text style={styles.settingsRowLabel}>View Scheduled</Text>
                                <SymbolView name="chevron.right" size={20} tintColor="white" />
                            </TouchableOpacity>

                            <TouchableOpacity onPress={handleOpenFocusGate} style={styles.settingsRow}>
                                <Text style={styles.settingsRowLabel}>Focus Gate</Text>
                                <View style={styles.settingsRowValue}>
                                    <Text style={styles.settingsValueText}>
                                        {gateConfig.enabled ? 'On' : 'Off'}
                                    </Text>
                                    <SymbolView name="chevron.right" size={20} tintColor="white" />
                                </View>
                            </TouchableOpacity>

                            <TouchableOpacity onPress={handleExport} style={styles.settingsRow}>
                                <Text style={styles.settingsRowLabel}>Export Data</Text>
                                <SymbolView name="square.and.arrow.up" size={20} tintColor="white" />
                            </TouchableOpacity>

                            <TouchableOpacity onPress={handleImport} style={styles.settingsRow}>
                                <Text style={styles.settingsRowLabel}>Import Data</Text>
                                <SymbolView name="square.and.arrow.down" size={20} tintColor="white" />
                            </TouchableOpacity>
                        </GlassCard>

                        <GlassCard
                            style={styles.buttonWrapper}
                            colorScheme="dark"
                            tintColor="rgba(46, 46, 80, 0.45)"
                        >
                            <TouchableOpacity onPress={() => { tapLight(); setSettingsVisible(false); }}>
                                <SymbolView name="checkmark.circle.fill" size={60} tintColor="white" />
                            </TouchableOpacity>
                        </GlassCard>
                    </Modal>

                    <MessagesModal
                        visible={messagesModalVisible}
                        mainListName={currentMainList}
                        mainData={currentMainData}
                        messages={currentMessages}
                        newMessageText={newMessageText}
                        onChangeNewMessageText={setNewMessageText}
                        onAddMessage={handleAddMessage}
                        onDeleteMessage={handleDeleteMessage}
                        onOpenEditor={handleOpenMessageEditor}
                        onClose={handleCloseMessages}
                        editor={messageEditor}
                        setEditor={setMessageEditor}
                        onSaveEditor={handleSaveMessage}
                    />

                    <TaskEditorModal
                        editor={taskEditor}
                        setEditor={setTaskEditor}
                        tagInputDraft={tagInputDraft}
                        onChangeTagInput={setTagInputDraft}
                        onAddTag={addTagFromInput}
                        onClose={handleCloseTaskEditor}
                        onSave={handleSaveTask}
                        onMoveTo={handleMoveTaskTo}
                        sideLists={currentMainData?.sideLists ?? []}
                        currentList={currentList}
                    />

                    <Modal visible={completionLogger.visible} animationType="slide" transparent={true}>
                        <SafeAreaView style={{ flex: 1 }}>
                            <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
                                <GlassCard
                                    style={styles.modalContent}
                                    colorScheme="dark"
                                    tintColor="rgba(46, 46, 80, 0.45)"
                                >
                                    <Text style={styles.settingsTitle}>{completionLogger.taskName}</Text>
                                    <Text style={styles.messagesSubtitle}>Log values for this completion</Text>

                                    {completionLogger.drafts.map((d, idx) => (
                                        <View key={`logger-${idx}`}>
                                            <Text style={styles.ruleSectionLabel}>{d.name}</Text>
                                            <TextInput
                                                style={styles.taskEditorNameInput}
                                                value={d.value}
                                                onChangeText={(text) =>
                                                    setCompletionLogger((r) => ({
                                                        ...r,
                                                        drafts: r.drafts.map((x, i) =>
                                                            i === idx ? { ...x, value: text } : x
                                                        ),
                                                    }))
                                                }
                                                placeholder={`Enter ${d.name}`}
                                                placeholderTextColor="rgba(255,255,255,0.5)"
                                                returnKeyType={idx === completionLogger.drafts.length - 1 ? 'done' : 'next'}
                                                autoFocus={idx === 0}
                                            />
                                        </View>
                                    ))}
                                </GlassCard>

                                <GlassCard
                                    style={styles.buttonWrapper}
                                    colorScheme="dark"
                                    tintColor="rgba(46, 46, 80, 0.45)"
                                >
                                    <TouchableOpacity onPress={handleCloseCompletionLogger}>
                                        <SymbolView name="xmark.circle.fill" size={60} tintColor="white" />
                                    </TouchableOpacity>
                                    <TouchableOpacity onPress={handleSaveCompletion}>
                                        <SymbolView name="checkmark.circle.fill" size={60} tintColor="white" />
                                    </TouchableOpacity>
                                </GlassCard>
                            </KeyboardAvoidingView>
                        </SafeAreaView>
                    </Modal>

                    <Modal visible={scheduledModalVisible} animationType="slide" transparent={true}>
                        <SafeAreaView style={{ flex: 1 }}>
                            <GlassCard
                                style={styles.modalContent}
                                colorScheme="dark"
                                tintColor="rgba(46, 46, 80, 0.45)"
                            >
                                <View style={styles.scheduledHeader}>
                                    <Text style={styles.settingsTitle}>Scheduled Notifications</Text>
                                    <TouchableOpacity onPress={handleRefreshScheduled} style={styles.refreshButton}>
                                        <SymbolView name="arrow.clockwise.circle.fill" size={28} tintColor="white" />
                                    </TouchableOpacity>
                                </View>
                                <Text style={styles.messagesSubtitle}>
                                    {scheduledList.length} pending — soonest first.
                                </Text>

                                <FlatList
                                    data={scheduledList}
                                    keyExtractor={(item) => item.id}
                                    renderItem={({ item }) => (
                                        <View style={styles.scheduledRow}>
                                            <Text style={styles.scheduledTime}>
                                                {moment(item.fireTime).fromNow()}
                                            </Text>
                                            <Text style={styles.scheduledAbsolute}>
                                                {moment(item.fireTime).format('ddd h:mm A')}
                                            </Text>
                                            <Text style={styles.scheduledBody} numberOfLines={2}>
                                                {item.body}
                                            </Text>
                                        </View>
                                    )}
                                    ListEmptyComponent={
                                        <Text style={styles.messagesEmpty}>
                                            No notifications scheduled.
                                        </Text>
                                    }
                                />
                            </GlassCard>

                            <GlassCard
                                style={styles.buttonWrapper}
                                colorScheme="dark"
                                tintColor="rgba(46, 46, 80, 0.45)"
                            >
                                <TouchableOpacity onPress={() => setScheduledModalVisible(false)}>
                                    <SymbolView name="xmark.circle.fill" size={60} tintColor="white" />
                                </TouchableOpacity>
                            </GlassCard>
                        </SafeAreaView>
                    </Modal>

                    <Modal visible={quietHoursModalVisible} animationType="slide" transparent={true}>
                        <SafeAreaView style={{ flex: 1 }}>
                            <GlassCard
                                style={styles.modalContent}
                                colorScheme="dark"
                                tintColor="rgba(46, 46, 80, 0.45)"
                            >
                                <Text style={styles.settingsTitle}>Quiet Hours</Text>
                                <Text style={styles.messagesSubtitle}>
                                    No notifications fire during this window.
                                </Text>

                                <View style={styles.settingsRow}>
                                    <Text style={styles.settingsRowLabel}>Enabled</Text>
                                    <Switch value={quietHoursEnabled} onValueChange={handleQuietToggle} />
                                </View>

                                {quietHoursEnabled ? (
                                    <>
                                        <Text style={styles.quietHeading}>Start</Text>
                                        <IntervalSlider
                                            key={`start-${quietHoursStart}`}
                                            value={quietHoursStart}
                                            onChangeComplete={handleQuietStartChange}
                                            values={TIME_OF_DAY_VALUES}
                                            formatter={formatTimeOfDay}
                                            showPrefix={false}
                                        />
                                        <Text style={styles.quietHeading}>End</Text>
                                        <IntervalSlider
                                            key={`end-${quietHoursEnd}`}
                                            value={quietHoursEnd}
                                            onChangeComplete={handleQuietEndChange}
                                            values={TIME_OF_DAY_VALUES}
                                            formatter={formatTimeOfDay}
                                            showPrefix={false}
                                        />
                                    </>
                                ) : null}
                            </GlassCard>

                            <GlassCard
                                style={styles.buttonWrapper}
                                colorScheme="dark"
                                tintColor="rgba(46, 46, 80, 0.45)"
                            >
                                <TouchableOpacity onPress={handleCloseQuietHours}>
                                    <SymbolView name="checkmark.circle.fill" size={60} tintColor="white" />
                                </TouchableOpacity>
                            </GlassCard>
                        </SafeAreaView>
                    </Modal>

                    <Modal visible={recoveryVisible} animationType="slide" transparent={true}>
                        <SafeAreaView style={{ flex: 1 }}>
                            <GlassCard
                                style={styles.modalContent}
                                colorScheme="dark"
                                tintColor="rgba(46, 46, 80, 0.45)"
                            >
                                <Text style={styles.settingsTitle}>Muscle Recovery</Text>
                                <Text style={styles.messagesSubtitle}>
                                    Longest since worked, top first.
                                </Text>
                                <TagRecovery rows={tagRecovery} />
                            </GlassCard>

                            <GlassCard
                                style={styles.buttonWrapper}
                                colorScheme="dark"
                                tintColor="rgba(46, 46, 80, 0.45)"
                            >
                                <TouchableOpacity
                                    onPress={() => {
                                        tapLight();
                                        setRecoveryVisible(false);
                                    }}
                                >
                                    <SymbolView name="xmark.circle.fill" size={60} tintColor="white" />
                                </TouchableOpacity>
                            </GlassCard>
                        </SafeAreaView>
                    </Modal>

                    <FocusGateModal
                        visible={focusGateVisible}
                        onClose={() => setFocusGateVisible(false)}
                        supported={gateSupported}
                        authStatus={gateAuthStatus}
                        onRequestAuthorization={handleRequestGateAuth}
                        config={gateConfig}
                        onChangeConfig={handleGateConfigChange}
                        hasSelection={hasAnySelection(gateSelectionMeta)}
                        selectionMeta={gateSelectionMeta}
                        onSelectionChange={handleGateSelectionChange}
                        sideLists={lists}
                        mainLists={mainLists}
                        currentMainList={currentMainList}
                        shieldActive={gateShieldActive}
                    />

                    <SafeAreaView style={styles.productName}>
                        <GlassCard
                            style={styles.topBar}
                            tintColor="rgba(46, 46, 80, 0.45)"
                            colorScheme="dark"
                        >
                            <TouchableOpacity onPress={exitToTileGrid}>
                               <SymbolView name="house.fill" size={40} tintColor="white" />
                            </TouchableOpacity>

                            <TouchableOpacity onPress={() => setMenuPanalVisible(true)}>
                                <Animated.Text
                                    style={[styles.textFont, styles.titleGlow, titleAnimatedStyle]}
                                    numberOfLines={1}
                                >
                                    {currentList || currentMainList}
                                </Animated.Text>
                            </TouchableOpacity>

                            <TouchableOpacity onPress={() => setSettingsVisible(true)}>
                               <SymbolView name="gearshape" size={40} tintColor="white" />
                            </TouchableOpacity>
                        </GlassCard>
                    </SafeAreaView>

                    {tagRecovery.length > 0 ? (
                        <View style={styles.tagFilterStrip}>
                            <TouchableOpacity
                                onPress={() => {
                                    tapLight();
                                    setRecoveryVisible(true);
                                }}
                                style={styles.recoveryButton}
                            >
                                <SymbolView name="chart.bar.xaxis" size={24} tintColor="white" />
                            </TouchableOpacity>
                            <FlatList
                                data={availableTags}
                                keyExtractor={(t) => t}
                                horizontal
                                showsHorizontalScrollIndicator={false}
                                contentContainerStyle={styles.tagFilterContent}
                                style={styles.tagFilterList}
                                renderItem={({ item }) => {
                                    const active = activeTags.has(item);
                                    return (
                                        <TouchableOpacity
                                            onPress={() => {
                                                selection();
                                                setActiveTags((prev) => {
                                                    const next = new Set(prev);
                                                    if (next.has(item)) next.delete(item);
                                                    else next.add(item);
                                                    return next;
                                                });
                                            }}
                                            style={[styles.tagFilterChip, active && styles.tagFilterChipActive]}
                                        >
                                            <Text style={[styles.tagFilterChipText, active && styles.tagFilterChipTextActive]}>
                                                {item}
                                            </Text>
                                        </TouchableOpacity>
                                    );
                                }}
                            />
                        </View>
                    ) : null}

                    <FlatList
                        data={visibleTasks}
                        keyExtractor={(item, index) => item.id || `task-${currentList}-${index}`}
                        renderItem={({ item, index }) => (
                            <Task
                                text={item.taskName}
                                index={index}
                                creationTime={moment(item.completedAt ?? item.creationTime).fromNow()}
                                onRemove={() => removeTaskFromList(item.id)}
                                onComplete={() => handleCompleteTask(item)}
                                onPress={() => handleOpenTaskEditor(item)}
                                variables={item.variables}
                                tags={item.tags}
                            />
                        )}
                        ListEmptyComponent={
                            <Text style={{color: 'white', padding: 20, textAlign: 'center'}}>
                                {activeTags.size > 0 ? 'No tasks match the selected tags' : 'No tasks in this list'}
                            </Text>
                        }
                    />

                    <GlassCard
                        style={styles.bottomNav}
                        tintColor="rgba(46, 46, 80, 0.45)"
                        colorScheme="dark"
                    >
                        <TouchableOpacity onPress={() => cycleList(-1)}>
                            <SymbolView name="chevron.left.circle.fill" size={50} tintColor="white" />
                        </TouchableOpacity>

                        <TouchableOpacity onPress={() => setModalVisible(true)}>
                            <SymbolView name="plus.circle.fill" size={60} tintColor="white" />
                        </TouchableOpacity>

                        <TouchableOpacity onPress={() => cycleList(1)}>
                            <SymbolView name="chevron.right.circle.fill" size={50} tintColor="white" />
                        </TouchableOpacity>
                    </GlassCard>

                    <KeyboardAvoidingView behavior="padding" />

                    {burstCount > 0 ? <CompletionBurst key={burstCount} /> : null}
                </>
            )}
        </View>
    )
}

const styles = StyleSheet.create({
    container: {
      flex: 1,
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: '#000',
    },
    loadingText: {
      color: '#fff',
      marginTop: 10,
    },
    errorContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: '#000',
      padding: 20,
    },
    errorText: {
      color: 'red',
      textAlign: 'center',
    },
    productName: {
        backgroundColor: "transparent",
    },
    textFont: {
        fontSize: 24,
        fontWeight: "bold",
        textAlign: "center",
        paddingTop: 4,
        color: 'white',
    },
    titleGlow: {
        textShadowOffset: { width: 0, height: 0 },
        textShadowRadius: 8,
    },
    buttonWrapper: {
        position: "relative",
        width: "100%",
        paddingBottom: 35,
        paddingTop: 10,
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
    },
    topBar: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginHorizontal: 12,
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 28,
        overflow: 'hidden',
    },
    bottomNav: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        alignItems: 'center',
        marginHorizontal: 12,
        marginBottom: 35,
        paddingHorizontal: 20,
        paddingVertical: 12,
        borderRadius: 32,
        overflow: 'hidden',
    },
    modalContent:{
        flex: 1,
        margin: 20,
        marginTop: 40,
        borderRadius: 10,
        overflow: 'hidden',
    },
    inputForms: {
        padding: 10,
        borderRadius: 8,
        borderColor: "rgba(255,255,255,0.4)",
        borderWidth: 1,
        color: 'white',
    },
    menuContainer: {
        flexDirection: "column",
        flex: 1,
        justifyContent: "flex-start"
    },
    menuLists: {
        flex: 1,
    },
    drawerTitle: {
        fontSize: 20,
        fontWeight: '600',
        color: 'white',
    },
    settingsTitle: {
        fontSize: 24,
        fontWeight: "bold",
        textAlign: "center",
        marginBottom: 20,
        marginTop: 10,
        color: 'white',
    },
    settingsRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingVertical: 12,
    },
    settingsRowLabel: {
        fontSize: 18,
        color: 'white',
    },
    settingsRowValue: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    settingsValueText: {
        fontSize: 16,
        color: 'rgba(255,255,255,0.7)',
    },
    quietHeading: {
        color: 'rgba(255,255,255,0.7)',
        fontSize: 13,
        textTransform: 'uppercase',
        letterSpacing: 1.5,
        marginTop: 16,
        marginBottom: 4,
        textAlign: 'center',
    },
    messagesSubtitle: {
        color: 'rgba(255,255,255,0.7)',
        textAlign: 'center',
        marginBottom: 12,
        fontSize: 13,
    },
    ruleSectionLabel: {
        color: 'rgba(255,255,255,0.55)',
        fontSize: 11,
        textTransform: 'uppercase',
        letterSpacing: 1.4,
        marginHorizontal: 16,
        marginTop: 8,
        marginBottom: 8,
    },
    taskEditorNameInput: {
        color: 'white',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.4)',
        borderRadius: 10,
        paddingHorizontal: 12,
        paddingVertical: 10,
        marginHorizontal: 16,
        marginBottom: 12,
    },
    tagFilterStrip: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 8,
    },
    tagFilterList: {
        flex: 1,
    },
    recoveryButton: {
        paddingLeft: 12,
        paddingRight: 8,
        paddingVertical: 4,
    },
    tagFilterContent: {
        paddingHorizontal: 12,
        gap: 8,
    },
    tagFilterChip: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.4)',
        backgroundColor: 'rgba(255,255,255,0.05)',
    },
    tagFilterChipActive: {
        backgroundColor: 'rgba(165, 180, 252, 0.85)',
        borderColor: 'rgba(165, 180, 252, 0.85)',
    },
    tagFilterChipText: {
        color: 'rgba(255,255,255,0.85)',
        fontSize: 13,
    },
    tagFilterChipTextActive: {
        color: 'rgba(15, 15, 36, 0.95)',
        fontWeight: '600',
    },
    messagesEmpty: {
        color: 'rgba(255,255,255,0.6)',
        textAlign: 'center',
        paddingVertical: 24,
        fontStyle: 'italic',
    },
    scheduledHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
    },
    refreshButton: {
        position: 'absolute',
        right: 16,
    },
    scheduledRow: {
        paddingVertical: 10,
        paddingHorizontal: 16,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: 'rgba(255,255,255,0.15)',
    },
    scheduledTime: {
        color: '#a5b4fc',
        fontSize: 13,
        fontWeight: '600',
    },
    scheduledAbsolute: {
        color: 'rgba(255,255,255,0.5)',
        fontSize: 11,
        marginTop: 2,
    },
    scheduledBody: {
        color: 'white',
        fontSize: 15,
        marginTop: 4,
    },
  })

export default Homepage;