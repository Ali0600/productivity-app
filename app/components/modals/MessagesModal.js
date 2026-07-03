import { View, StyleSheet, Text, Modal, SafeAreaView, TouchableOpacity, TextInput, KeyboardAvoidingView, FlatList } from "react-native";
import GlassCard from "../GlassCard";
import IntervalSlider from "../IntervalSlider";
import { SymbolView } from 'expo-symbols';
import { selection } from '../../services/haptics';
import { isRuleCurrentlyActive, formatRuleChip } from '../../utils/notificationRules';

/**
 * Reminder-messages manager for a main list, including the nested per-message
 * editor (body, interval, pause rule). All state stays in Homepage; this is a
 * controlled component.
 */
function MessagesModal({
    visible,
    mainListName,
    mainData,
    messages,
    newMessageText,
    onChangeNewMessageText,
    onAddMessage,
    onDeleteMessage,
    onOpenEditor,
    onClose,
    editor,
    setEditor,
    onSaveEditor,
}) {
    return (
        <Modal visible={visible} animationType="slide" transparent={true}>
            <SafeAreaView style={{ flex: 1 }}>
                <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
                    <GlassCard
                        style={styles.modalContent}
                        colorScheme="dark"
                        tintColor="rgba(46, 46, 80, 0.45)"
                    >
                        <Text style={styles.settingsTitle}>
                            {`Messages for "${mainListName}"`}
                        </Text>
                        <Text style={styles.messagesSubtitle}>
                            Reminders cycle through these in order.
                        </Text>

                        <FlatList
                            data={messages}
                            keyExtractor={(_, i) => `msg-${i}`}
                            renderItem={({ item, index }) => {
                                const body = typeof item === 'string' ? item : item?.body;
                                const rule = typeof item === 'string' ? null : item?.rule;
                                const chip = formatRuleChip(rule, mainData);
                                const active = isRuleCurrentlyActive(rule, mainData);
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
                                            onPress={() => onOpenEditor(index)}
                                            activeOpacity={0.7}
                                        >
                                            <Text style={styles.messageText} numberOfLines={2}>
                                                {body}
                                            </Text>
                                            <Text style={chipStyle} numberOfLines={1}>
                                                {active ? '● ' : ''}{chip.label}
                                            </Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity onPress={() => onDeleteMessage(index)}>
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
                                onChangeText={onChangeNewMessageText}
                                placeholder="New reminder…"
                                placeholderTextColor="rgba(255,255,255,0.5)"
                                style={styles.messageInput}
                                onSubmitEditing={onAddMessage}
                                returnKeyType="done"
                            />
                            <TouchableOpacity onPress={onAddMessage}>
                                <SymbolView name="plus.circle.fill" size={32} tintColor="white" />
                            </TouchableOpacity>
                        </View>
                    </GlassCard>

                    <GlassCard
                        style={styles.buttonWrapper}
                        colorScheme="dark"
                        tintColor="rgba(46, 46, 80, 0.45)"
                    >
                        <TouchableOpacity onPress={onClose}>
                            <SymbolView name="checkmark.circle.fill" size={60} tintColor="white" />
                        </TouchableOpacity>
                    </GlassCard>
                </KeyboardAvoidingView>
            </SafeAreaView>

            <Modal visible={editor.visible} animationType="slide" transparent={true}>
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
                                value={editor.draftBody}
                                onChangeText={(text) =>
                                    setEditor((r) => ({ ...r, draftBody: text }))
                                }
                                placeholder="Reminder text"
                                placeholderTextColor="rgba(255,255,255,0.5)"
                                multiline
                            />

                            <Text style={styles.ruleSectionLabel}>Reminder interval</Text>
                            <IntervalSlider
                                key={`msg-interval-${editor.messageIndex}-${editor.draftInterval}`}
                                value={editor.draftInterval ?? 60}
                                onChangeComplete={(mins) =>
                                    setEditor((r) => ({ ...r, draftInterval: mins }))
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
                                    const active = (editor.draftRule?.type ?? 'none') === opt.key;
                                    return (
                                        <TouchableOpacity
                                            key={opt.key}
                                            style={[styles.ruleSegment, active && styles.ruleSegmentActive]}
                                            onPress={() => {
                                                selection();
                                                setEditor((r) => ({
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
                                    const draft = editor.draftRule;
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
                                                {' "'}{mainListName}{'" '}is completed.
                                            </Text>
                                        );
                                    }
                                    if (draft.type === 'sideList') {
                                        return (
                                            <FlatList
                                                data={mainData?.sideLists ?? []}
                                                keyExtractor={(s) => s.listName}
                                                renderItem={({ item }) => {
                                                    const selected = draft.sideListName === item.listName;
                                                    return (
                                                        <TouchableOpacity
                                                            style={styles.rulePickerRow}
                                                            onPress={() => {
                                                                selection();
                                                                setEditor((r) => ({
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
                                        const rows = (mainData?.sideLists ?? []).flatMap((sl) => {
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
                                                                setEditor((r) => ({
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
                                const canSave = (editor.draftBody ?? '').trim().length > 0;
                                return (
                                    <TouchableOpacity
                                        onPress={onSaveEditor}
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
    );
}

const styles = StyleSheet.create({
    modalContent: {
        flex: 1,
        margin: 20,
        marginTop: 40,
        borderRadius: 10,
        overflow: 'hidden',
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
    settingsTitle: {
        fontSize: 24,
        fontWeight: "bold",
        textAlign: "center",
        marginBottom: 20,
        marginTop: 10,
        color: 'white',
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
});

export default MessagesModal;
