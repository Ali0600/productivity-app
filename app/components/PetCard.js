import { useCallback } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { SymbolView } from 'expo-symbols';
import GlassCard from './GlassCard';
import PetAvatar from './pet/PetAvatar';
import PetRoom from './pet/PetRoom';
import { usePet, useWakeOnView } from '../hooks/usePet';
import { usePetReactions } from '../hooks/usePetReactions';
import { FULL_AT, petDisplayName } from '../utils/pet';
import { tapLight } from '../services/haptics';

/** Today's snacks as FULL_AT bowl slots. One accessibility element, not three strawberries. */
export const SnackBowl = ({ count }) => (
  <View
    accessible
    accessibilityRole="text"
    accessibilityLabel={`${count} ${count === 1 ? 'snack' : 'snacks'} today`}
    style={styles.bowl}
  >
    {Array.from({ length: FULL_AT }, (_, i) => (
      <Text
        key={i}
        maxFontSizeMultiplier={1.3}
        style={[styles.bowlSlot, i >= count && styles.bowlSlotEmpty]}
      >
        🍓
      </Text>
    ))}
    {count > FULL_AT ? (
      <Text maxFontSizeMultiplier={1.3} style={styles.bowlExtra}>
        +{count - FULL_AT}
      </Text>
    ) : null}
  </View>
);

/** The trick-practice bar: one segment per slot. */
export const TrickBar = ({ filled, slots, style }) => (
  <View style={[styles.trickBar, style]}>
    {Array.from({ length: slots }, (_, i) => (
      <View key={i} style={[styles.trickSlot, i < filled && styles.trickSlotFilled]} />
    ))}
  </View>
);

/** Pick what a tap does: a learned trick most of the time, otherwise a pat. */
export const tapReaction = (view) => {
  const learned = view?.trick?.learned ?? [];
  if (view?.hatched && learned.length > 0 && Math.random() < 0.6) {
    return { type: 'trick', trick: learned[Math.floor(Math.random() * learned.length)].key };
  }
  return { type: 'pet' };
};

/**
 * A tap handler for an on-screen pet that keeps its identity between renders
 * (until the pet's view changes), so the memoized PetAvatar can skip renders.
 */
export const usePetTap = (view, play) =>
  useCallback(() => {
    tapLight();
    play(tapReaction(view));
  }, [view, play]);

/** The pet's spot at the top of the home screen. Tap the pet to play; tap the rest to open its page. */
function PetCard({ onOpen, style }) {
  const { visible, pet, view } = usePet();
  const { action, message, play } = usePetReactions(visible);
  const onPetPress = usePetTap(view, play);
  // The first look after a nap wakes the pet; the wake batch plays the animation.
  useWakeOnView(visible);

  if (!visible || !view) return null;
  const { trick } = view;

  return (
    <View style={style}>
      <GlassCard style={styles.card} colorScheme="dark" tintColor="rgba(46, 46, 80, 0.45)">
        <View style={styles.row}>
          <PetRoom theme={view.room} style={styles.room}>
            <PetAvatar
              size={100}
              stage={view.stage.key}
              mood={view.mood}
              color={pet.color}
              action={action}
              onPress={onPetPress}
              accessibilityLabel={`${petDisplayName(pet)}. ${view.line} Tap to play.`}
            />
          </PetRoom>

          <TouchableOpacity
            style={styles.info}
            activeOpacity={0.7}
            onPress={() => {
              tapLight();
              onOpen?.();
            }}
            accessibilityRole="button"
            accessibilityLabel={`Open ${pet.name}'s page`}
          >
            <View style={styles.titleRow}>
              <Text style={styles.name} numberOfLines={1}>
                {petDisplayName(pet)}
              </Text>
              <View style={styles.stageChip}>
                <Text style={styles.stageText}>{view.stage.label}</Text>
              </View>
              <SymbolView name="chevron.right" size={14} tintColor="rgba(255,255,255,0.55)" />
            </View>

            <Animated.Text
              key={message ? `m${message.id}` : 'line'}
              entering={FadeIn.duration(220)}
              style={[styles.line, message && styles.lineEvent]}
              numberOfLines={2}
            >
              {message ? message.text : view.line}
            </Animated.Text>

            {view.hatched ? (
              <>
                <SnackBowl count={view.todaySnacks} />
                <TrickBar filled={trick.filled} slots={trick.slots} />
                <Text style={styles.caption} numberOfLines={1}>
                  {trick.next
                    ? `${trick.remaining} more snack${trick.remaining === 1 ? '' : 's'} to learn ${trick.next.label}`
                    : 'Every trick learned!'}
                </Text>
              </>
            ) : (
              <Text style={styles.caption}>Something is wiggling in there…</Text>
            )}
          </TouchableOpacity>
        </View>
      </GlassCard>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    overflow: 'hidden',
    padding: 10,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  room: {
    width: 120,
    height: 120,
  },
  info: {
    flex: 1,
    paddingLeft: 12,
    justifyContent: 'center',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  name: {
    color: 'white',
    fontSize: 19,
    fontWeight: '700',
    flexShrink: 1,
  },
  stageChip: {
    backgroundColor: 'rgba(165, 180, 252, 0.2)',
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  stageText: {
    color: '#c7d2fe',
    fontSize: 11,
    fontWeight: '600',
  },
  line: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 13,
    lineHeight: 18,
    marginTop: 4,
    minHeight: 36,
  },
  lineEvent: {
    color: '#fbcfe8',
    fontWeight: '600',
  },
  bowl: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    marginTop: 4,
  },
  bowlSlot: {
    fontSize: 15,
    lineHeight: 19,
  },
  bowlSlotEmpty: {
    opacity: 0.22,
  },
  bowlExtra: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 11,
    marginLeft: 4,
  },
  trickBar: {
    flexDirection: 'row',
    gap: 2,
    marginTop: 8,
  },
  trickSlot: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  trickSlotFilled: {
    backgroundColor: '#a5b4fc',
  },
  caption: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 11,
    marginTop: 5,
  },
});

export default PetCard;
