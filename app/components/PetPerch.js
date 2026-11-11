import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeOut, ZoomIn } from 'react-native-reanimated';
import PetAvatar from './pet/PetAvatar';
import { tapReaction } from './PetCard';
import { usePet, useWakeOnView } from '../hooks/usePet';
import { usePetReactions } from '../hooks/usePetReactions';
import { tapLight } from '../services/haptics';
import { petDisplayName } from '../utils/pet';

export const PERCH_SIZE = 58;
const BUBBLE_MAX_WIDTH = 230;

/**
 * A speech bubble pointing right, at the pet beside it. The fixed-width,
 * right-aligned slot gives the text a real width to lay out in (an absolute
 * child of the 58pt perch would otherwise wrap at 58pt); the bubble inside
 * shrinks to its text and grows with Dynamic Type.
 */
const PetBubble = ({ text }) => (
  // It floats over the task list; taps go through to the tasks underneath.
  <View pointerEvents="none" style={styles.bubbleSlot}>
    <Animated.View
      // Timed, not springy: a spring entrance overshot to ~2x and back on device.
      entering={ZoomIn.duration(200)}
      exiting={FadeOut.duration(180)}
      style={styles.bubble}
    >
      <Text style={styles.bubbleText} numberOfLines={4} maxFontSizeMultiplier={1.6}>
        {text}
      </Text>
      <View style={styles.bubbleTail} />
    </Animated.View>
  </View>
);

/**
 * The pet sitting on top of the list view's bottom bar, so the reward lands
 * right where the swipe happens. Render it inside a wrapper around the bar;
 * it positions itself on the bar's top edge.
 */
function PetPerch() {
  const { visible, pet, view } = usePet();
  const { action, message, play } = usePetReactions(visible);
  // iOS often resumes the app straight into a list, so this pet wakes too.
  useWakeOnView(visible);
  if (!visible || !view) return null;

  return (
    <View pointerEvents="box-none" style={styles.perch}>
      {message ? <PetBubble key={message.id} text={message.text} /> : null}
      <PetAvatar
        size={PERCH_SIZE}
        stage={view.stage.key}
        mood={view.mood}
        color={pet.color}
        action={action}
        onPress={() => {
          tapLight();
          play(tapReaction(view));
        }}
        accessibilityLabel={`${petDisplayName(pet)}. ${view.line} Tap to play.`}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  perch: {
    position: 'absolute',
    right: 26,
    top: -PERCH_SIZE + 8,
    width: PERCH_SIZE,
    height: PERCH_SIZE,
    zIndex: 5,
  },
  bubbleSlot: {
    position: 'absolute',
    right: PERCH_SIZE + 6,
    bottom: PERCH_SIZE * 0.35,
    width: BUBBLE_MAX_WIDTH,
    alignItems: 'flex-end',
  },
  bubble: {
    maxWidth: BUBBLE_MAX_WIDTH,
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: 14,
    paddingHorizontal: 11,
    paddingVertical: 7,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  bubbleText: {
    color: '#1e1b4b',
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 17,
  },
  bubbleTail: {
    position: 'absolute',
    right: -5,
    bottom: 10,
    width: 12,
    height: 12,
    backgroundColor: 'rgba(255,255,255,0.95)',
    transform: [{ rotate: '45deg' }],
  },
});

export default PetPerch;
