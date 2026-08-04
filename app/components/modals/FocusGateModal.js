import { View, StyleSheet, Text, Modal, SafeAreaView, TouchableOpacity, ScrollView, Switch } from "react-native";
import GlassCard from "../GlassCard";
import IntervalSlider, { formatTimeOfDay } from "../IntervalSlider";
import { SymbolView } from 'expo-symbols';
import { tapLight, selection } from '../../services/haptics';
import { gateProgress, isGateTargetMissing } from '../../utils/focusGate';
import {
    AUTH_STATUS,
    DeviceActivitySelectionView,
    unsupportedReason,
} from '../../services/focusGateService';

// Re-arm hour picker reuses the notification time-of-day slider (30-min steps),
// but the schedule only takes whole hours, so offer hour marks only.
const HOUR_VALUES = Array.from({ length: 24 }, (_, i) => i * 60);

/**
 * Focus Gate settings: authorize Screen Time, choose which apps to gate, pick
 * the list that unlocks them, and set the daily re-arm hour. Controlled
 * component — all state lives in Homepage.
 */
function FocusGateModal({
    visible,
    onClose,
    supported,
    authStatus,
    onRequestAuthorization,
    config,
    onChangeConfig,
    hasSelection,
    onSelectionChange,
    sideLists,
    mainLists,
    currentMainList,
    shieldActive,
}) {
    const authorized = authStatus === AUTH_STATUS.approved;
    const targetMissing = isGateTargetMissing(config, mainLists);
    const progress = gateProgress(config, mainLists);
    const reason = supported ? null : unsupportedReason();

    const setConfig = (patch) => onChangeConfig({ ...config, ...patch });

    return (
        <Modal visible={visible} animationType="slide" transparent={true}>
            <SafeAreaView style={{ flex: 1 }}>
                <GlassCard
                    style={styles.modalContent}
                    colorScheme="dark"
                    tintColor="rgba(46, 46, 80, 0.45)"
                >
                    <ScrollView
                        contentContainerStyle={{ paddingBottom: 16 }}
                        showsVerticalScrollIndicator={false}
                    >
                        <Text style={styles.settingsTitle}>Focus Gate</Text>
                        <Text style={styles.subtitle}>
                            Blocks the apps you choose until a list is finished for the day.
                        </Text>

                        {!supported ? (
                            <Text style={styles.warningText}>{reason}</Text>
                        ) : (
                            <>
                                {/* Step 1 — Screen Time authorization */}
                                <Text style={styles.sectionLabel}>Screen Time access</Text>
                                {authorized ? (
                                    <View style={styles.statusRow}>
                                        <SymbolView name="checkmark.circle.fill" size={20} tintColor="#86efac" />
                                        <Text style={styles.statusText}>Authorized</Text>
                                    </View>
                                ) : (
                                    <>
                                        <TouchableOpacity
                                            style={styles.primaryRow}
                                            onPress={onRequestAuthorization}
                                        >
                                            <Text style={styles.primaryRowText}>
                                                {authStatus === AUTH_STATUS.denied
                                                    ? 'Denied — open Settings to allow'
                                                    : 'Grant Screen Time access'}
                                            </Text>
                                            <SymbolView name="chevron.right" size={18} tintColor="white" />
                                        </TouchableOpacity>
                                        {authStatus === AUTH_STATUS.denied ? (
                                            <Text style={styles.hintText}>
                                                Settings → Screen Time → App &amp; Website Activity.
                                            </Text>
                                        ) : null}
                                    </>
                                )}

                                {/* Step 2 — which apps to gate */}
                                {authorized ? (
                                    <>
                                        <Text style={styles.sectionLabel}>Apps to block</Text>
                                        <Text style={styles.hintText}>
                                            Apple keeps your picks private — ADHDone never sees which
                                            apps you chose.
                                        </Text>
                                        {DeviceActivitySelectionView ? (
                                            <View style={styles.pickerWrap}>
                                                <DeviceActivitySelectionView
                                                    style={styles.picker}
                                                    onSelectionChange={onSelectionChange}
                                                />
                                            </View>
                                        ) : null}

                                        {/* Step 3 — what unlocks them */}
                                        <Text style={styles.sectionLabel}>Unlocked by finishing</Text>
                                        {sideLists.length === 0 ? (
                                            <Text style={styles.hintText}>
                                                No lists in &quot;{currentMainList}&quot; yet.
                                            </Text>
                                        ) : (
                                            sideLists.map((sl) => {
                                                const active =
                                                    config.mainListName === currentMainList &&
                                                    config.sideListName === sl.listName;
                                                return (
                                                    <TouchableOpacity
                                                        key={sl.listName}
                                                        style={styles.pickerRow}
                                                        onPress={() => {
                                                            selection();
                                                            setConfig({
                                                                mainListName: currentMainList,
                                                                sideListName: sl.listName,
                                                            });
                                                        }}
                                                    >
                                                        <Text style={styles.pickerText} numberOfLines={1}>
                                                            {sl.listName}
                                                        </Text>
                                                        <Text style={styles.pickerCount}>
                                                            {sl.tasks?.length ?? 0} task
                                                            {(sl.tasks?.length ?? 0) === 1 ? '' : 's'}
                                                        </Text>
                                                        {active ? (
                                                            <SymbolView name="checkmark" size={20} tintColor="#a5b4fc" />
                                                        ) : null}
                                                    </TouchableOpacity>
                                                );
                                            })
                                        )}

                                        {/* Step 4 — daily re-arm hour */}
                                        <Text style={styles.sectionLabel}>Re-block each day at</Text>
                                        <IntervalSlider
                                            key={`rearm-${config.rearmHour}`}
                                            value={(config.rearmHour ?? 6) * 60}
                                            onChangeComplete={(mins) =>
                                                setConfig({ rearmHour: Math.floor(mins / 60) })
                                            }
                                            values={HOUR_VALUES}
                                            formatter={formatTimeOfDay}
                                            showPrefix={false}
                                        />

                                        {/* Step 5 — arm it */}
                                        <View style={styles.enableRow}>
                                            <Text style={styles.enableLabel}>Enable Focus Gate</Text>
                                            <Switch
                                                value={!!config.enabled}
                                                onValueChange={(next) => {
                                                    selection();
                                                    setConfig({ enabled: next });
                                                }}
                                                disabled={!hasSelection || !config.sideListName}
                                            />
                                        </View>
                                        {!hasSelection || !config.sideListName ? (
                                            <Text style={styles.hintText}>
                                                Pick at least one app and a list to enable.
                                            </Text>
                                        ) : null}

                                        {targetMissing ? (
                                            <Text style={styles.warningText}>
                                                ⚠ The list this gate points at no longer exists — blocking
                                                is paused. Pick another list above.
                                            </Text>
                                        ) : config.enabled ? (
                                            <Text style={styles.progressText}>
                                                {progress.remaining === 0
                                                    ? `✓ ${progress.total}/${progress.total} done — apps unlocked for today.`
                                                    : `${progress.done}/${progress.total} done — ${progress.remaining} left to unlock.`}
                                                {shieldActive ? ' Shield is active.' : ''}
                                            </Text>
                                        ) : null}
                                    </>
                                ) : null}
                            </>
                        )}
                    </ScrollView>
                </GlassCard>

                <GlassCard
                    style={styles.buttonWrapper}
                    colorScheme="dark"
                    tintColor="rgba(46, 46, 80, 0.45)"
                >
                    <TouchableOpacity onPress={() => { tapLight(); onClose(); }}>
                        <SymbolView name="checkmark.circle.fill" size={60} tintColor="white" />
                    </TouchableOpacity>
                </GlassCard>
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
        marginBottom: 8,
        marginTop: 10,
        color: 'white',
    },
    subtitle: {
        color: 'rgba(255,255,255,0.7)',
        textAlign: 'center',
        marginBottom: 12,
        marginHorizontal: 24,
        fontSize: 13,
    },
    sectionLabel: {
        color: 'rgba(255,255,255,0.55)',
        fontSize: 11,
        textTransform: 'uppercase',
        letterSpacing: 1.4,
        marginHorizontal: 16,
        marginTop: 18,
        marginBottom: 8,
    },
    statusRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginHorizontal: 16,
    },
    statusText: {
        color: 'white',
        fontSize: 15,
    },
    primaryRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginHorizontal: 16,
        paddingVertical: 12,
        paddingHorizontal: 14,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.25)',
    },
    primaryRowText: {
        color: 'white',
        fontSize: 15,
    },
    hintText: {
        color: 'rgba(255,255,255,0.55)',
        fontSize: 12,
        marginHorizontal: 16,
        marginTop: 6,
        lineHeight: 17,
    },
    warningText: {
        color: 'rgba(255, 200, 120, 0.95)',
        fontSize: 13,
        marginHorizontal: 16,
        marginTop: 12,
        lineHeight: 18,
    },
    progressText: {
        color: '#86efac',
        fontSize: 13,
        marginHorizontal: 16,
        marginTop: 12,
        lineHeight: 18,
    },
    pickerWrap: {
        marginHorizontal: 16,
        height: 260,
        borderRadius: 10,
        overflow: 'hidden',
    },
    picker: {
        flex: 1,
    },
    pickerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 10,
        marginHorizontal: 16,
        paddingVertical: 12,
        paddingHorizontal: 12,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: 'rgba(255,255,255,0.12)',
    },
    pickerText: {
        color: 'white',
        flex: 1,
    },
    pickerCount: {
        color: 'rgba(255,255,255,0.5)',
        fontSize: 12,
    },
    enableRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginHorizontal: 16,
        marginTop: 20,
    },
    enableLabel: {
        color: 'white',
        fontSize: 17,
    },
});

export default FocusGateModal;
