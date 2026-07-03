import { View, StyleSheet, Text, Modal, SafeAreaView, TouchableOpacity, TextInput, KeyboardAvoidingView, ScrollView } from "react-native";
import GlassCard from "../GlassCard";
import { SymbolView } from 'expo-symbols';
import moment from "moment";
import { tapLight } from '../../services/haptics';

/**
 * Full task editor: name, notes, variables, tags, metadata, and move-to-list.
 * Controlled component — the draft state (`editor`) lives in Homepage.
 */
function TaskEditorModal({
    editor,
    setEditor,
    tagInputDraft,
    onChangeTagInput,
    onAddTag,
    onClose,
    onSave,
    onMoveTo,
    sideLists,
    currentList,
}) {
    return (
        <Modal visible={editor.visible} animationType="slide" transparent={true}>
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
                            value={editor.draftName}
                            onChangeText={(text) =>
                                setEditor((r) => ({ ...r, draftName: text }))
                            }
                            placeholder="Task name"
                            placeholderTextColor="rgba(255,255,255,0.5)"
                            returnKeyType="done"
                        />

                        <Text style={styles.ruleSectionLabel}>Notes</Text>
                        <TextInput
                            style={styles.messageEditorInput}
                            value={editor.draftNotes}
                            onChangeText={(text) =>
                                setEditor((r) => ({ ...r, draftNotes: text }))
                            }
                            placeholder="Optional notes"
                            placeholderTextColor="rgba(255,255,255,0.5)"
                            multiline
                        />

                        <Text style={styles.ruleSectionLabel}>Variables</Text>
                        {editor.draftVariables.map((v, idx) => (
                            <View style={styles.variableRow} key={`var-${idx}`}>
                                <TextInput
                                    style={styles.variableNameInput}
                                    value={v.name}
                                    onChangeText={(text) =>
                                        setEditor((r) => ({
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
                                        setEditor((r) => ({
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
                                        setEditor((r) => ({
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
                                setEditor((r) => ({
                                    ...r,
                                    draftVariables: [...r.draftVariables, { name: '', lastValue: '' }],
                                }));
                            }}
                        >
                            <SymbolView name="plus.circle.fill" size={22} tintColor="white" />
                            <Text style={styles.addVariableText}>Add variable</Text>
                        </TouchableOpacity>

                        <Text style={styles.ruleSectionLabel}>Tags</Text>
                        {editor.draftTags.length > 0 ? (
                            <View style={styles.tagChipsWrap}>
                                {editor.draftTags.map((t, idx) => (
                                    <View style={styles.tagChip} key={`tag-${idx}`}>
                                        <Text style={styles.tagChipText} numberOfLines={1}>{t}</Text>
                                        <TouchableOpacity
                                            onPress={() => {
                                                tapLight();
                                                setEditor((r) => ({
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
                                onChangeText={onChangeTagInput}
                                placeholder="New tag"
                                placeholderTextColor="rgba(255,255,255,0.5)"
                                onSubmitEditing={onAddTag}
                                returnKeyType="done"
                                autoCapitalize="none"
                                autoCorrect={false}
                            />
                            <TouchableOpacity onPress={onAddTag}>
                                <SymbolView name="plus.circle.fill" size={28} tintColor="white" />
                            </TouchableOpacity>
                        </View>

                        {(editor.creationTime || editor.completedAt) ? (
                            <View style={styles.taskEditorMeta}>
                                {editor.creationTime ? (
                                    <Text style={styles.taskEditorMetaText}>
                                        Added {moment(editor.creationTime).fromNow()}
                                    </Text>
                                ) : null}
                                {editor.completedAt ? (
                                    <Text style={styles.taskEditorMetaText}>
                                        Last completed {moment(editor.completedAt).fromNow()}
                                    </Text>
                                ) : null}
                            </View>
                        ) : null}

                        {(() => {
                            const others = (sideLists ?? []).filter(
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
                                            onPress={() => onMoveTo(item.listName)}
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
                        <TouchableOpacity onPress={onClose}>
                            <SymbolView name="xmark.circle.fill" size={60} tintColor="white" />
                        </TouchableOpacity>
                        {(() => {
                            const canSave = (editor.draftName ?? '').trim().length > 0;
                            return (
                                <TouchableOpacity
                                    onPress={onSave}
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
});

export default TaskEditorModal;
