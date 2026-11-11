import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ROOM_THEMES } from './petTheme';

const FALLBACK_THEME = 'nursery';

// Decor goes in the corners only, so it never sits behind the pet in the middle.
// Slot order is top-left, bottom-right, top-right, bottom-left: two items still
// balance on a diagonal, and petTheme lists ground-friendly emoji 2nd and 4th.
const DECOR_SLOTS = [
  { place: { top: '6%', left: '6%' }, rotate: '-12deg', opacity: 0.42 },
  { place: { bottom: '5%', right: '6%' }, rotate: '9deg', opacity: 0.5 },
  { place: { top: '9%', right: '7%' }, rotate: '10deg', opacity: 0.38 },
  { place: { bottom: '7%', left: '6%' }, rotate: '-7deg', opacity: 0.46 },
];

/**
 * A rounded backdrop for the pet: a dusky sky, two soft hills of ground and a
 * few faint corner decorations. Children are centred and stand on the ground.
 * Purely presentational; give it a size through `style`.
 */
export default function PetRoom({ theme, style, children }) {
  const room = ROOM_THEMES[theme] || ROOM_THEMES[FALLBACK_THEME];
  // Decor scales with the room, so it waits for the first layout.
  const [decorSize, setDecorSize] = useState(0);
  const onLayout = useCallback((event) => {
    const { width, height } = event.nativeEvent.layout;
    const next = Math.round(Math.min(28, Math.max(10, Math.min(width, height) * 0.12)));
    setDecorSize((prev) => (prev === next ? prev : next));
  }, []);

  return (
    <View style={[styles.room, style]} onLayout={onLayout}>
      <LinearGradient colors={room.sky} style={StyleSheet.absoluteFill} />
      <View pointerEvents="none" style={[styles.hillBack, { backgroundColor: room.ground }]} />
      <View pointerEvents="none" style={[styles.hillFront, { backgroundColor: room.ground }]} />
      {decorSize > 0 ? (
        <View
          pointerEvents="none"
          style={StyleSheet.absoluteFill}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          {room.decor.slice(0, DECOR_SLOTS.length).map((emoji, i) => {
            const slot = DECOR_SLOTS[i];
            return (
              <Text
                key={`${emoji}-${i}`}
                allowFontScaling={false}
                style={[
                  styles.decor,
                  slot.place,
                  {
                    fontSize: decorSize,
                    lineHeight: decorSize * 1.2,
                    opacity: slot.opacity,
                    transform: [{ rotate: slot.rotate }],
                  },
                ]}
              >
                {emoji}
              </Text>
            );
          })}
        </View>
      ) : null}
      <View pointerEvents="box-none" style={styles.stage}>
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  room: {
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: '#1a1a3a',
  },
  // Circles far wider than the room (aspectRatio 1, radius clamped to half the
  // side), so only a gentle curve of each shows: a far hill on the left and a
  // near one across the bottom.
  hillBack: {
    position: 'absolute',
    width: '190%',
    aspectRatio: 1,
    left: '-85%',
    top: '66%',
    borderRadius: 9999,
    opacity: 0.55,
  },
  hillFront: {
    position: 'absolute',
    width: '230%',
    aspectRatio: 1,
    left: '-65%',
    top: '74%',
    borderRadius: 9999,
  },
  decor: {
    position: 'absolute',
  },
  // In normal flow (not absolute) so a room with no explicit size wraps its pet.
  stage: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: '6%',
  },
});
