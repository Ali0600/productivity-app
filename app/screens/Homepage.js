import { useState, useCallback, useEffect, useMemo } from "react";
import { View, StyleSheet, Text, Modal, SafeAreaView, TouchableOpacity, TextInput, KeyboardAvoidingView, FlatList, ScrollView, ActivityIndicator, ActionSheetIOS, Alert, Switch } from "react-native";
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withRepeat,
    withTiming,
    interpolateColor,
    Easing,
} from 'react-native-reanimated';
import NotificationService from "../services/notificationService";
import * as Sharing from 'expo-sharing';
import { Paths, File } from 'expo-file-system';
import * as Clipboard from 'expo-clipboard';
import Task from "../components/Task";
import List from "../components/List";
import GlassCard from "../components/GlassCard";
import IntervalSlider, { formatTimeOfDay } from "../components/IntervalSlider";

const TIME_OF_DAY_VALUES = Array.from({ length: 48 }, (_, i) => i * 30);

const isRuleTargetMissing = (rule, mainData) => {
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

const isRuleCurrentlyActive = (rule, mainData) => {
    if (!rule || !mainData) return false;
    const now = Date.now();
    const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
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

const rulesEqual = (a, b) => {
    if (!a && !b) return true;
    if (!a || !b) return false;
    if (a.type !== b.type) return false;
    if (a.type === 'task') return a.taskId === b.taskId && a.sideListName === b.sideListName;
    if (a.type === 'sideList') return a.sideListName === b.sideListName;
    if (a.type === 'mainList') return true;
    return false;
};

const formatRuleChip = (rule, mainData) => {
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
import { SymbolView } from 'expo-symbols';
import moment from "moment";
import DraggableFlatList, { ScaleDecorator } from 'react-native-draggable-flatlist';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { LinearGradient } from 'expo-linear-gradient';
import { useAppState, useLists, useListTasks, useAppLoading, useMainLists } from '../hooks/useAppState';
import { tapLight, selection, warning, success } from '../services/haptics';

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
    const [completionLogger, setCompletionLogger] = useState({
        visible: false,
        taskId: null,
        taskName: '',
        drafts: [],
    });

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

    // Use our custom hooks
    const { isLoading, error } = useAppLoading();
    const { lists, currentList, currentListData, addList, removeList, switchList, updateLists, moveSideList } = useLists();
    const { mainLists, currentMainList, currentMainData, exitToTileGrid, setNotificationMessages } = useMainLists();
    const {
        addTaskToList,
        reorderTasksInList,
        removeTaskFromList,
        updateTaskInList,
        moveTaskFromList,
        completeTaskInList,
    } = useListTasks(currentList);

    const handleAddTask = () => {
        if (!task.trim()) return;

        const newTask = {
            id: `task-${Date.now()}`, // Create a reliable unique ID
            taskName: task,
            creationTime: new Date()
        };

        console.log("Adding new task:", newTask);
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
        console.log("Handling list reorder:", reorderedLists.map(l => l.listName));
        // Update the entire lists array in the context
        updateLists(reorderedLists);
    };

    const handleAddNewList = () => {
        if (!newListName.trim()) return;

        tapLight();
        addList(newListName);
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

    const availableTags = useMemo(() => {
        const seen = new Map();
        for (const task of currentListData?.tasks ?? []) {
            for (const t of task.tags ?? []) {
                const key = (t ?? '').toLowerCase();
                if (!key || seen.has(key)) continue;
                seen.set(key, t);
            }
        }
        return [...seen.values()].sort((a, b) => a.localeCompare(b));
    }, [currentListData?.tasks]);

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
        completeTaskInList(taskId);
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
                    <ActivityIndicator size="large" color="#0000ff" />
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
                                        console.log("Reordering lists:", data.map(l => l.listName));
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

                            <TouchableOpacity onPress={handleExport} style={styles.settingsRow}>
                                <Text style={styles.settingsRowLabel}>Export Data</Text>
                                <SymbolView name="square.and.arrow.up" size={20} tintColor="white" />
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

                    <Modal visible={messagesModalVisible} animationType="slide" transparent={true}>
                        <SafeAreaView style={{ flex: 1 }}>
                            <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
                                <GlassCard
                                    style={styles.modalContent}
                                    colorScheme="dark"
                                    tintColor="rgba(46, 46, 80, 0.45)"
                                >
                                    <Text style={styles.settingsTitle}>
                                        Messages for "{currentMainList}"
                                    </Text>
                                    <Text style={styles.messagesSubtitle}>
                                        Reminders cycle through these in order.
                                    </Text>

                                    <FlatList
                                        data={currentMessages}
                                        keyExtractor={(_, i) => `msg-${i}`}
                                        renderItem={({ item, index }) => {
                                            const body = typeof item === 'string' ? item : item?.body;
                                            const rule = typeof item === 'string' ? null : item?.rule;
                                            const chip = formatRuleChip(rule, currentMainData);
                                            const active = isRuleCurrentlyActive(rule, currentMainData);
                                            const chipStyle = [
                                                styles.ruleChipText,
                                                chip.tone === 'dim' && styles.ruleChipDim,
                                                chip.tone === 'warn' && styles.ruleChipWarn,
                                                active && styles.ruleChipActive,
                                            ];
                                            return (
                                                <View style={styles.messageRow}>
                                                    <TouchableOpacity
                                                        style={styles.messageRowLeft}
                                                        onPress={() => handleOpenMessageEditor(index)}
                                                        activeOpacity={0.7}
                                                    >
                                                        <Text style={styles.messageText} numberOfLines={2}>
                                                            {body}
                                                        </Text>
                                                        <Text style={chipStyle} numberOfLines={1}>
                                                            {active ? '● ' : ''}{chip.label}
                                                        </Text>
                                                    </TouchableOpacity>
                                                    <TouchableOpacity onPress={() => handleDeleteMessage(index)}>
                                                        <SymbolView name="trash.fill" size={22} tintColor="rgba(255,180,180,0.9)" />
                                                    </TouchableOpacity>
                                                </View>
                                            );
                                        }}
                                        ListEmptyComponent={
                                            <Text style={styles.messagesEmpty}>
                                                No messages yet. Add one below to start receiving reminders.
                                            </Text>
                                        }
                                    />

                                    <View style={styles.messageInputRow}>
                                        <TextInput
                                            value={newMessageText}
                                            onChangeText={setNewMessageText}
                                            placeholder="New reminder…"
                                            placeholderTextColor="rgba(255,255,255,0.5)"
                                            style={styles.messageInput}
                                            onSubmitEditing={handleAddMessage}
                                            returnKeyType="done"
                                        />
                                        <TouchableOpacity onPress={handleAddMessage}>
                                            <SymbolView name="plus.circle.fill" size={32} tintColor="white" />
                                        </TouchableOpacity>
                                    </View>
                                </GlassCard>

                                <GlassCard
                                    style={styles.buttonWrapper}
                                    colorScheme="dark"
                                    tintColor="rgba(46, 46, 80, 0.45)"
                                >
                                    <TouchableOpacity onPress={handleCloseMessages}>
                                        <SymbolView name="checkmark.circle.fill" size={60} tintColor="white" />
                                    </TouchableOpacity>
                                </GlassCard>
                            </KeyboardAvoidingView>
                        </SafeAreaView>

                    <Modal visible={messageEditor.visible} animationType="slide" transparent={true}>
                        <SafeAreaView style={{ flex: 1 }}>
                            <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
                            <GlassCard
                                style={styles.modalContent}
                                colorScheme="dark"
                                tintColor="rgba(46, 46, 80, 0.45)"
                            >
                                <Text style={styles.settingsTitle}>Edit message</Text>

                                <Text style={styles.ruleSectionLabel}>Message</Text>
                                <TextInput
                                    style={styles.messageEditorInput}
                                    value={messageEditor.draftBody}
                                    onChangeText={(text) =>
                                        setMessageEditor((r) => ({ ...r, draftBody: text }))
                                    }
                                    placeholder="Reminder text"
                                    placeholderTextColor="rgba(255,255,255,0.5)"
                                    multiline
                                />

                                <Text style={styles.ruleSectionLabel}>Reminder interval</Text>
                                <IntervalSlider
                                    key={`msg-interval-${messageEditor.messageIndex}-${messageEditor.draftInterval}`}
                                    value={messageEditor.draftInterval ?? 60}
                                    onChangeComplete={(mins) =>
                                        setMessageEditor((r) => ({ ...r, draftInterval: mins }))
                                    }
                                />

                                <Text style={styles.ruleSectionLabel}>Pause rule</Text>
                                <View style={styles.ruleSegments}>
                                    {[
                                        { key: 'none', label: 'None' },
                                        { key: 'task', label: 'Task' },
                                        { key: 'sideList', label: 'Side list' },
                                        { key: 'mainList', label: 'Main list' },
                                    ].map((opt) => {
                                        const active = (messageEditor.draftRule?.type ?? 'none') === opt.key;
                                        return (
                                            <TouchableOpacity
                                                key={opt.key}
                                                style={[styles.ruleSegment, active && styles.ruleSegmentActive]}
                                                onPress={() => {
                                                    selection();
                                                    setMessageEditor((r) => ({
                                                        ...r,
                                                        draftRule: opt.key === 'none' ? null : { type: opt.key },
                                                    }));
                                                }}
                                            >
                                                <Text style={[styles.ruleSegmentText, active && styles.ruleSegmentTextActive]}>
                                                    {opt.label}
                                                </Text>
                                            </TouchableOpacity>
                                        );
                                    })}
                                </View>

                                <View style={styles.ruleEditorBody}>
                                    {(() => {
                                        const draft = messageEditor.draftRule;
                                        if (!draft) {
                                            return (
                                                <Text style={styles.ruleHelpText}>
                                                    This message will always cycle on schedule.
                                                </Text>
                                            );
                                        }
                                        if (draft.type === 'mainList') {
                                            return (
                                                <Text style={styles.ruleHelpText}>
                                                    Pauses for the rest of today whenever any task in
                                                    {' "'}{currentMainList}{'" '}is completed.
                                                </Text>
                                            );
                                        }
                                        if (draft.type === 'sideList') {
                                            return (
                                                <FlatList
                                                    data={currentMainData?.sideLists ?? []}
                                                    keyExtractor={(s) => s.listName}
                                                    renderItem={({ item }) => {
                                                        const selected = draft.sideListName === item.listName;
                                                        return (
                                                            <TouchableOpacity
                                                                style={styles.rulePickerRow}
                                                                onPress={() => {
                                                                    selection();
                                                                    setMessageEditor((r) => ({
                                                                        ...r,
                                                                        draftRule: { type: 'sideList', sideListName: item.listName },
                                                                    }));
                                                                }}
                                                            >
                                                                <Text style={styles.rulePickerText} numberOfLines={1}>
                                                                    {item.listName}
                                                                </Text>
                                                                {selected ? (
                                                                    <SymbolView name="checkmark" size={20} tintColor="#a5b4fc" />
                                                                ) : null}
                                                            </TouchableOpacity>
                                                        );
                                                    }}
                                                    ListEmptyComponent={
                                                        <Text style={styles.ruleHelpText}>No side lists in this main list.</Text>
                                                    }
                                                />
                                            );
                                        }
                                        if (draft.type === 'task') {
                                            const rows = (currentMainData?.sideLists ?? []).flatMap((sl) => {
                                                const header = [{ kind: 'header', listName: sl.listName }];
                                                const tasks = sl.tasks.map((t) => ({ kind: 'task', task: t, listName: sl.listName }));
                                                return [...header, ...tasks];
                                            });
                                            return (
                                                <FlatList
                                                    data={rows}
                                                    keyExtractor={(item, i) =>
                                                        item.kind === 'task'
                                                            ? `t-${item.listName}-${item.task.id}`
                                                            : `h-${item.listName}-${i}`
                                                    }
                                                    renderItem={({ item }) => {
                                                        if (item.kind === 'header') {
                                                            return <Text style={styles.rulePickerHeader}>{item.listName}</Text>;
                                                        }
                                                        const selected =
                                                            draft.taskId === item.task.id &&
                                                            draft.sideListName === item.listName;
                                                        return (
                                                            <TouchableOpacity
                                                                style={styles.rulePickerRow}
                                                                onPress={() => {
                                                                    selection();
                                                                    setMessageEditor((r) => ({
                                                                        ...r,
                                                                        draftRule: {
                                                                            type: 'task',
                                                                            taskId: item.task.id,
                                                                            sideListName: item.listName,
                                                                        },
                                                                    }));
                                                                }}
                                                            >
                                                                <Text style={styles.rulePickerText} numberOfLines={1}>
                                                                    {item.task.taskName}
                                                                </Text>
                                                                {selected ? (
                                                                    <SymbolView name="checkmark" size={20} tintColor="#a5b4fc" />
                                                                ) : null}
                                                            </TouchableOpacity>
                                                        );
                                                    }}
                                                    ListEmptyComponent={
                                                        <Text style={styles.ruleHelpText}>No tasks in this main list.</Text>
                                                    }
                                                />
                                            );
                                        }
                                        return null;
                                    })()}
                                </View>
                            </GlassCard>

                            <GlassCard
                                style={styles.buttonWrapper}
                                colorScheme="dark"
                                tintColor="rgba(46, 46, 80, 0.45)"
                            >
                                {(() => {
                                    const canSave = (messageEditor.draftBody ?? '').trim().length > 0;
                                    return (
                                        <TouchableOpacity
                                            onPress={handleSaveMessage}
                                            disabled={!canSave}
                                            style={!canSave && { opacity: 0.4 }}
                                        >
                                            <SymbolView name="checkmark.circle.fill" size={60} tintColor="white" />
                                        </TouchableOpacity>
                                    );
                                })()}
                            </GlassCard>
                            </KeyboardAvoidingView>
                        </SafeAreaView>
                    </Modal>
                    </Modal>

                    <Modal visible={taskEditor.visible} animationType="slide" transparent={true}>
                        <SafeAreaView style={{ flex: 1 }}>
                            <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
                                <GlassCard
                                    style={styles.modalContent}
                                    colorScheme="dark"
                                    tintColor="rgba(46, 46, 80, 0.45)"
                                >
                                    <ScrollView
                                        keyboardShouldPersistTaps="handled"
                                        contentContainerStyle={{ paddingBottom: 16 }}
                                        showsVerticalScrollIndicator={false}
                                    >
                                    <Text style={styles.settingsTitle}>Edit task</Text>

                                    <Text style={styles.ruleSectionLabel}>Name</Text>
                                    <TextInput
                                        style={styles.taskEditorNameInput}
                                        value={taskEditor.draftName}
                                        onChangeText={(text) =>
                                            setTaskEditor((r) => ({ ...r, draftName: text }))
                                        }
                                        placeholder="Task name"
                                        placeholderTextColor="rgba(255,255,255,0.5)"
                                        returnKeyType="done"
                                    />

                                    <Text style={styles.ruleSectionLabel}>Notes</Text>
                                    <TextInput
                                        style={styles.messageEditorInput}
                                        value={taskEditor.draftNotes}
                                        onChangeText={(text) =>
                                            setTaskEditor((r) => ({ ...r, draftNotes: text }))
                                        }
                                        placeholder="Optional notes"
                                        placeholderTextColor="rgba(255,255,255,0.5)"
                                        multiline
                                    />

                                    <Text style={styles.ruleSectionLabel}>Variables</Text>
                                    {taskEditor.draftVariables.map((v, idx) => (
                                        <View style={styles.variableRow} key={`var-${idx}`}>
                                            <TextInput
                                                style={styles.variableNameInput}
                                                value={v.name}
                                                onChangeText={(text) =>
                                                    setTaskEditor((r) => ({
                                                        ...r,
                                                        draftVariables: r.draftVariables.map((x, i) =>
                                                            i === idx ? { ...x, name: text } : x
                                                        ),
                                                    }))
                                                }
                                                placeholder="Name"
                                                placeholderTextColor="rgba(255,255,255,0.5)"
                                            />
                                            <TextInput
                                                style={styles.variableValueInput}
                                                value={v.lastValue}
                                                onChangeText={(text) =>
                                                    setTaskEditor((r) => ({
                                                        ...r,
                                                        draftVariables: r.draftVariables.map((x, i) =>
                                                            i === idx ? { ...x, lastValue: text } : x
                                                        ),
                                                    }))
                                                }
                                                placeholder="Value"
                                                placeholderTextColor="rgba(255,255,255,0.5)"
                                            />
                                            <TouchableOpacity
                                                onPress={() => {
                                                    tapLight();
                                                    setTaskEditor((r) => ({
                                                        ...r,
                                                        draftVariables: r.draftVariables.filter((_, i) => i !== idx),
                                                    }));
                                                }}
                                            >
                                                <SymbolView name="minus.circle.fill" size={22} tintColor="rgba(255,180,180,0.9)" />
                                            </TouchableOpacity>
                                        </View>
                                    ))}
                                    <TouchableOpacity
                                        style={styles.addVariableRow}
                                        onPress={() => {
                                            tapLight();
                                            setTaskEditor((r) => ({
                                                ...r,
                                                draftVariables: [...r.draftVariables, { name: '', lastValue: '' }],
                                            }));
                                        }}
                                    >
                                        <SymbolView name="plus.circle.fill" size={22} tintColor="white" />
                                        <Text style={styles.addVariableText}>Add variable</Text>
                                    </TouchableOpacity>

                                    <Text style={styles.ruleSectionLabel}>Tags</Text>
                                    {taskEditor.draftTags.length > 0 ? (
                                        <View style={styles.tagChipsWrap}>
                                            {taskEditor.draftTags.map((t, idx) => (
                                                <View style={styles.tagChip} key={`tag-${idx}`}>
                                                    <Text style={styles.tagChipText} numberOfLines={1}>{t}</Text>
                                                    <TouchableOpacity
                                                        onPress={() => {
                                                            tapLight();
                                                            setTaskEditor((r) => ({
                                                                ...r,
                                                                draftTags: r.draftTags.filter((_, i) => i !== idx),
                                                            }));
                                                        }}
                                                    >
                                                        <SymbolView name="xmark.circle.fill" size={16} tintColor="rgba(255,255,255,0.7)" />
                                                    </TouchableOpacity>
                                                </View>
                                            ))}
                                        </View>
                                    ) : null}
                                    <View style={styles.tagInputRow}>
                                        <TextInput
                                            style={styles.tagInput}
                                            value={tagInputDraft}
                                            onChangeText={setTagInputDraft}
                                            placeholder="New tag"
                                            placeholderTextColor="rgba(255,255,255,0.5)"
                                            onSubmitEditing={addTagFromInput}
                                            returnKeyType="done"
                                            autoCapitalize="none"
                                            autoCorrect={false}
                                        />
                                        <TouchableOpacity onPress={addTagFromInput}>
                                            <SymbolView name="plus.circle.fill" size={28} tintColor="white" />
                                        </TouchableOpacity>
                                    </View>

                                    {(taskEditor.creationTime || taskEditor.completedAt) ? (
                                        <View style={styles.taskEditorMeta}>
                                            {taskEditor.creationTime ? (
                                                <Text style={styles.taskEditorMetaText}>
                                                    Added {moment(taskEditor.creationTime).fromNow()}
                                                </Text>
                                            ) : null}
                                            {taskEditor.completedAt ? (
                                                <Text style={styles.taskEditorMetaText}>
                                                    Last completed {moment(taskEditor.completedAt).fromNow()}
                                                </Text>
                                            ) : null}
                                        </View>
                                    ) : null}

                                    {(() => {
                                        const others = (currentMainData?.sideLists ?? []).filter(
                                            (s) => s.listName !== currentList
                                        );
                                        if (others.length === 0) return null;
                                        return (
                                            <>
                                                <Text style={styles.ruleSectionLabel}>Move to</Text>
                                                {others.map((item) => (
                                                    <TouchableOpacity
                                                        key={item.listName}
                                                        style={styles.rulePickerRow}
                                                        onPress={() => handleMoveTaskTo(item.listName)}
                                                    >
                                                        <Text style={styles.rulePickerText} numberOfLines={1}>
                                                            {item.listName}
                                                        </Text>
                                                        <SymbolView
                                                            name="arrow.right.circle.fill"
                                                            size={22}
                                                            tintColor="rgba(255,255,255,0.6)"
                                                        />
                                                    </TouchableOpacity>
                                                ))}
                                            </>
                                        );
                                    })()}
                                    </ScrollView>
                                </GlassCard>

                                <GlassCard
                                    style={styles.buttonWrapper}
                                    colorScheme="dark"
                                    tintColor="rgba(46, 46, 80, 0.45)"
                                >
                                    <TouchableOpacity onPress={handleCloseTaskEditor}>
                                        <SymbolView name="xmark.circle.fill" size={60} tintColor="white" />
                                    </TouchableOpacity>
                                    {(() => {
                                        const canSave = (taskEditor.draftName ?? '').trim().length > 0;
                                        return (
                                            <TouchableOpacity
                                                onPress={handleSaveTask}
                                                disabled={!canSave}
                                                style={!canSave && { opacity: 0.4 }}
                                            >
                                                <SymbolView name="checkmark.circle.fill" size={60} tintColor="white" />
                                            </TouchableOpacity>
                                        );
                                    })()}
                                </GlassCard>
                            </KeyboardAvoidingView>
                        </SafeAreaView>
                    </Modal>

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

                    {availableTags.length > 0 ? (
                        <View style={styles.tagFilterStrip}>
                            <FlatList
                                data={availableTags}
                                keyExtractor={(t) => t}
                                horizontal
                                showsHorizontalScrollIndicator={false}
                                contentContainerStyle={styles.tagFilterContent}
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
                                taskId={item.id || `task-${currentList}-${index}`}
                                creationTime={moment(item.completedAt ?? item.creationTime).fromNow()}
                                onRemove={() => removeTaskFromList(item.id)}
                                onComplete={() => handleCompleteTask(item)}
                                onUpdate={updateTaskInList}
                                onPress={() => handleOpenTaskEditor(item)}
                                variables={item.variables}
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
        borderRadius: 1,
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
    messageRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 10,
        paddingHorizontal: 16,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: 'rgba(255,255,255,0.15)',
    },
    messageRowLeft: {
        flex: 1,
        marginRight: 12,
    },
    messageText: {
        color: 'white',
    },
    ruleChipText: {
        color: '#a5b4fc',
        fontSize: 12,
        marginTop: 4,
    },
    ruleChipDim: {
        color: 'rgba(255,255,255,0.45)',
    },
    ruleChipWarn: {
        color: 'rgba(255, 200, 120, 0.95)',
    },
    ruleChipActive: {
        color: '#86efac',
    },
    ruleSegments: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginHorizontal: 16,
        marginBottom: 12,
        gap: 6,
    },
    ruleSegment: {
        flex: 1,
        paddingVertical: 8,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.25)',
        alignItems: 'center',
    },
    ruleSegmentActive: {
        backgroundColor: 'rgba(165, 180, 252, 0.25)',
        borderColor: '#a5b4fc',
    },
    ruleSegmentText: {
        color: 'rgba(255,255,255,0.7)',
        fontSize: 13,
    },
    ruleSegmentTextActive: {
        color: 'white',
        fontWeight: '600',
    },
    ruleEditorBody: {
        flex: 1,
        marginHorizontal: 16,
        marginBottom: 16,
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
    messageEditorInput: {
        color: 'white',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.4)',
        borderRadius: 10,
        paddingHorizontal: 12,
        paddingVertical: 10,
        marginHorizontal: 16,
        marginBottom: 12,
        minHeight: 44,
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
    taskEditorMeta: {
        marginHorizontal: 16,
        marginTop: 4,
        marginBottom: 12,
        gap: 4,
    },
    taskEditorMetaText: {
        color: 'rgba(255,255,255,0.55)',
        fontSize: 12,
    },
    variableRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginHorizontal: 16,
        marginBottom: 8,
        gap: 10,
    },
    variableNameInput: {
        flex: 1.4,
        color: 'white',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.4)',
        borderRadius: 10,
        paddingHorizontal: 12,
        paddingVertical: 8,
    },
    variableValueInput: {
        flex: 1,
        color: 'white',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.4)',
        borderRadius: 10,
        paddingHorizontal: 12,
        paddingVertical: 8,
    },
    addVariableRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginHorizontal: 16,
        marginBottom: 12,
        gap: 8,
        paddingVertical: 6,
    },
    addVariableText: {
        color: 'white',
        fontSize: 14,
    },
    tagChipsWrap: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 6,
        marginHorizontal: 16,
        marginBottom: 8,
    },
    tagChip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: 'rgba(255,255,255,0.12)',
        borderRadius: 14,
        paddingHorizontal: 10,
        paddingVertical: 6,
    },
    tagChipText: {
        color: 'white',
        fontSize: 13,
    },
    tagInputRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginHorizontal: 16,
        marginBottom: 12,
        gap: 10,
    },
    tagInput: {
        flex: 1,
        color: 'white',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.4)',
        borderRadius: 10,
        paddingHorizontal: 12,
        paddingVertical: 8,
    },
    tagFilterStrip: {
        paddingVertical: 8,
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
    ruleHelpText: {
        color: 'rgba(255,255,255,0.7)',
        textAlign: 'center',
        paddingVertical: 24,
        fontSize: 13,
    },
    rulePickerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 12,
        paddingHorizontal: 12,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: 'rgba(255,255,255,0.12)',
    },
    rulePickerText: {
        color: 'white',
        flex: 1,
        marginRight: 12,
    },
    rulePickerHeader: {
        color: 'rgba(255,255,255,0.55)',
        fontSize: 11,
        textTransform: 'uppercase',
        letterSpacing: 1.2,
        marginTop: 14,
        marginBottom: 4,
        paddingHorizontal: 12,
    },
    messagesEmpty: {
        color: 'rgba(255,255,255,0.6)',
        textAlign: 'center',
        paddingVertical: 24,
        fontStyle: 'italic',
    },
    messageInputRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 12,
        marginHorizontal: 16,
        marginBottom: 16,
        gap: 10,
    },
    messageInput: {
        flex: 1,
        color: 'white',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.4)',
        borderRadius: 10,
        paddingHorizontal: 12,
        paddingVertical: 8,
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