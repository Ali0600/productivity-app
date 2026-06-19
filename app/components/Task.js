import { memo, useRef } from "react";
import { StyleSheet, Text, View, TouchableOpacity, Alert } from "react-native";
import Swipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import Animated, { useAnimatedStyle, useAnimatedReaction, runOnJS } from 'react-native-reanimated';
import { SymbolView } from 'expo-symbols';
import GlassCard from './GlassCard';
import { tapMedium, success, warning } from '../services/haptics';

const useThresholdHaptic = (progress) => {
    useAnimatedReaction(
        () => progress.value >= 1,
        (isPast, wasPast) => {
            if (isPast && !wasPast) runOnJS(tapMedium)();
        }
    );
};

const RightAction = ({ progress, onPress }) => {
    useThresholdHaptic(progress);
    const animatedStyle = useAnimatedStyle(() => {
        const p = Math.min(progress.value, 1);
        return {
            opacity: p,
            transform: [{ scale: 0.7 + 0.3 * p }],
        };
    });
    return (
        <Animated.View style={[styles.deleteBox, animatedStyle]}>
            <TouchableOpacity style={styles.actionTouch} onPress={onPress}>
                <SymbolView name="trash.fill" size={28} tintColor="white" />
            </TouchableOpacity>
        </Animated.View>
    );
};

const LeftAction = ({ progress, onPress }) => {
    useThresholdHaptic(progress);
    const animatedStyle = useAnimatedStyle(() => {
        const p = Math.min(progress.value, 1);
        return {
            opacity: p,
            transform: [{ scale: 0.7 + 0.3 * p }],
        };
    });
    return (
        <Animated.View style={[styles.completeBox, animatedStyle]}>
            <TouchableOpacity style={styles.actionTouch} onPress={onPress}>
                <SymbolView name="checkmark.circle.fill" size={28} tintColor="white" />
            </TouchableOpacity>
        </Animated.View>
    );
};

const Task = ({ text, creationTime, index, taskId, onRemove, onComplete, onUpdate, onPress, variables, tags }) => {
    const swipeableRef = useRef(null);

    const closeSwipe = () => {
        if (swipeableRef.current) {
            swipeableRef.current.close();
        }
    };

    const handleRemove = () => {
        Alert.alert(
            "Delete Task",
            `Are you sure you want to delete "${text}"?`,
            [
                {
                    text: "Cancel",
                    style: "cancel",
                    onPress: closeSwipe
                },
                {
                    text: "Delete",
                    style: "destructive",
                    onPress: () => {
                        warning();
                        onRemove(index);
                        closeSwipe();
                    }
                }
            ]
        );
    };

    const handleComplete = () => {
        if (variables && variables.length > 0) {
            onComplete(index);
            closeSwipe();
            return;
        }
        Alert.alert(
            "Complete Task",
            `Marking "${text}" as complete and moving to bottom of list`,
            [
                {
                    text: "Cancel",
                    style: "cancel",
                    onPress: closeSwipe
                },
                {
                    text: "Complete",
                    style: "default",
                    onPress: () => {
                        success();
                        onComplete(index);
                        closeSwipe();
                    }
                }
            ]
        );
    };

    const handleEdit = () => {
        tapMedium();
        Alert.prompt(
            "Edit Task",
            "Enter new task name:",
            [
                {
                    text: "Cancel",
                    style: "cancel"
                },
                {
                    text: "Save",
                    onPress: (newText) => {
                        if (newText && newText.trim()) {
                            onUpdate(taskId, {
                                text: newText.trim(),
                                taskName: newText.trim()
                            });
                        }
                    }
                }
            ],
            "plain-text",
            text
        );
    };

    return (
        <Swipeable
            ref={swipeableRef}
            leftThreshold={100}
            rightThreshold={100}
            onSwipeableOpen={(direction) => {
                if (direction === 'right') {
                    handleComplete();
                } else if (direction === 'left') {
                    handleRemove();
                }
            }}
            renderRightActions={(progress) => (
                <RightAction progress={progress} onPress={handleRemove} />
            )}
            renderLeftActions={(progress) => (
                <LeftAction progress={progress} onPress={handleComplete} />
            )}
        >
            <GlassCard
                style={styles.taskCard}
                colorScheme="dark"
                tintColor="rgba(46, 46, 80, 0.35)"
            >
                <TouchableOpacity
                    style={styles.taskContainer}
                    onPress={onPress}
                    onLongPress={handleEdit}
                    delayLongPress={500}
                >
                    <View style={styles.taskMain}>
                        <Text style={styles.taskText}>{text}</Text>
                        {tags && tags.length > 0 ? (
                            <View style={styles.tagRow}>
                                {tags.map((tag, i) => (
                                    <View style={styles.tagChip} key={`${tag}-${i}`}>
                                        <Text style={styles.tagChipText} numberOfLines={1}>{tag}</Text>
                                    </View>
                                ))}
                            </View>
                        ) : null}
                    </View>
                    <Text style={styles.taskTime}>{creationTime.toString()}</Text>
                </TouchableOpacity>
            </GlassCard>
        </Swipeable>
    );
}

const styles = StyleSheet.create({
    taskCard: {
        borderRadius: 20,
        overflow: 'hidden',
    },
    taskContainer: {
        flexDirection: "row",
        padding: 20,
        justifyContent: "space-between"
    },
    taskMain: {
        flex: 1,
        marginRight: 12,
    },
    taskText: {
        color: 'white',
    },
    tagRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 6,
        marginTop: 8,
    },
    tagChip: {
        backgroundColor: 'rgba(165, 180, 252, 0.18)',
        borderRadius: 10,
        paddingHorizontal: 8,
        paddingVertical: 3,
    },
    tagChipText: {
        color: '#c7d2fe',
        fontSize: 11,
        fontWeight: '500',
    },
    taskTime: {
        color: 'rgba(255,255,255,0.7)',
    },
    deleteBox: {
        width: 80,
        backgroundColor: 'rgba(200, 60, 60, 0.85)',
        justifyContent: 'center',
        alignItems: 'center',
        borderRadius: 20,
        marginVertical: 2,
        marginLeft: 8,
    },
    completeBox: {
        width: 80,
        backgroundColor: 'rgba(60, 160, 95, 0.85)',
        justifyContent: 'center',
        alignItems: 'center',
        borderRadius: 20,
        marginVertical: 2,
        marginRight: 8,
    },
    actionTouch: {
        flex: 1,
        width: '100%',
        justifyContent: 'center',
        alignItems: 'center',
    },
})

export default memo(Task);