import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withTiming,
    Easing,
    interpolate,
} from 'react-native-reanimated';

// Palette pulled from the app's accent colors so the burst feels native
// to the dark cool-dusk gradient.
const COLORS = ['#a5b4fc', '#86efac', '#c7d2fe', '#ffffff'];
const DOT_COUNT = 12;
const RADIUS = 90;
const DURATION_MS = 650;

const Dot = ({ progress, angle, color }) => {
    const style = useAnimatedStyle(() => {
        const dist = interpolate(progress.value, [0, 1], [12, RADIUS]);
        return {
            opacity: interpolate(progress.value, [0, 0.6, 1], [1, 0.9, 0]),
            transform: [
                { translateX: Math.cos(angle) * dist },
                { translateY: Math.sin(angle) * dist },
                { scale: interpolate(progress.value, [0, 1], [1, 0.4]) },
            ],
        };
    });
    return <Animated.View style={[styles.dot, { backgroundColor: color }, style]} />;
};

/**
 * One-shot radial celebration burst. Plays once on mount and fades out —
 * remount (e.g. via a changing `key`) to play again.
 */
const CompletionBurst = () => {
    const progress = useSharedValue(0);

    useEffect(() => {
        progress.value = withTiming(1, {
            duration: DURATION_MS,
            easing: Easing.out(Easing.quad),
        });
    }, [progress]);

    const ringStyle = useAnimatedStyle(() => ({
        opacity: interpolate(progress.value, [0, 0.5, 1], [0.7, 0.35, 0]),
        transform: [{ scale: interpolate(progress.value, [0, 1], [0.3, 1.6]) }],
    }));

    return (
        <View pointerEvents="none" style={styles.overlay}>
            <Animated.View style={[styles.ring, ringStyle]} />
            {Array.from({ length: DOT_COUNT }, (_, i) => (
                <Dot
                    key={i}
                    progress={progress}
                    angle={(i / DOT_COUNT) * Math.PI * 2}
                    color={COLORS[i % COLORS.length]}
                />
            ))}
        </View>
    );
};

const styles = StyleSheet.create({
    overlay: {
        ...StyleSheet.absoluteFillObject,
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 10,
    },
    dot: {
        position: 'absolute',
        width: 10,
        height: 10,
        borderRadius: 5,
    },
    ring: {
        position: 'absolute',
        width: 120,
        height: 120,
        borderRadius: 60,
        borderWidth: 2,
        borderColor: '#a5b4fc',
    },
});

export default CompletionBurst;
