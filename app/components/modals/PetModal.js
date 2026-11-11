import { useMemo, useState } from 'react';
import {
  Alert,
  Modal,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SymbolView } from 'expo-symbols';
import GlassCard from '../GlassCard';
import PetAvatar from '../pet/PetAvatar';
import PetRoom from '../pet/PetRoom';
import { PET_PALETTES } from '../pet/petTheme';
import { SnackBowl, TrickBar, usePetTap } from '../PetCard';
import { usePet } from '../../hooks/usePet';
import { usePetReactions } from '../../hooks/usePetReactions';
import {
  helpingStats,
  PET_COLOR_KEYS,
  petDisplayName,
  placeholderTiles,
  REST_DAYS_PER_WEEK,
} from '../../utils/pet';
import { selection, tapLight } from '../../services/haptics';

const DAY_GLYPH = { care: '🍓', rest: '☾', today: '', open: '', future: '', before: '' };
const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const DAY_STATUS_SPOKEN = {
  care: 'care day',
  rest: 'rest day',
  today: 'today',
  open: 'no tasks',
  future: 'still to come',
  before: 'before hatching',
};
// Glyphs sit in fixed-size dots and tiles; past this they would spill over.
const GLYPH_MAX_SCALE = 1.3;
const TREASURE_COLUMNS = 6;

const formatRate = (n) => (n >= 10 ? n.toFixed(0) : n.toFixed(1));

const StatColumn = ({ title, s }) => (
  <View style={styles.statCol}>
    <Text style={styles.statTitle}>{title}</Text>
    <Text style={styles.statBig}>{formatRate(s.perDay)}</Text>
    <Text style={styles.statUnit}>tasks a day</Text>
    <Text style={styles.statSmall}>{formatRate(s.activePerWeek)} active days a week</Text>
  </View>
);

const SHELF_GAP = 8;

/**
 * Found treasures, then a row's worth of "still to find" tiles. Tiles are
 * sized from the measured width so TREASURE_COLUMNS of them fill a row exactly.
 */
const TreasureShelf = ({ treasures }) => {
  const [width, setWidth] = useState(0);
  const size = width
    ? Math.floor((width - SHELF_GAP * (TREASURE_COLUMNS - 1)) / TREASURE_COLUMNS)
    : 42;
  const tile = { width: size, height: size, borderRadius: Math.round(size * 0.28) };
  const placeholders = placeholderTiles(
    treasures.found.length,
    treasures.total - treasures.foundCount,
    TREASURE_COLUMNS
  );
  return (
    <View style={styles.treasures} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {treasures.found.map((t) => (
        <View key={t.key} style={[styles.treasure, tile, t.dream && styles.treasureDream]}>
          <Text
            style={styles.treasureEmoji}
            maxFontSizeMultiplier={GLYPH_MAX_SCALE}
            accessibilityLabel={t.count > 1 ? `${t.label}, ${t.count} of them` : t.label}
          >
            {t.emoji}
          </Text>
          {t.count > 1 ? (
            <Text
              style={styles.treasureCount}
              maxFontSizeMultiplier={GLYPH_MAX_SCALE}
              accessibilityElementsHidden
            >
              ×{t.count}
            </Text>
          ) : null}
        </View>
      ))}
      {placeholders.map((label, i) => (
        // The section heading already says how many are left; skip the "?" stops.
        <View
          key={`unfound-${i}`}
          style={[styles.treasure, tile, styles.treasureUnfound]}
          accessibilityElementsHidden
        >
          <Text style={styles.treasureUnknown} maxFontSizeMultiplier={GLYPH_MAX_SCALE}>
            {label}
          </Text>
        </View>
      ))}
    </View>
  );
};

/** Two side-by-side numbers: before the pet vs since. */
const HelpingStats = ({ stats, name }) => {
  if (!stats.ready) {
    return (
      <Text style={styles.hint}>
        Check back after your first week together to compare tasks per day before and since {name}{' '}
        arrived.
      </Text>
    );
  }
  if (!stats.before) {
    return <Text style={styles.hint}>No completion history from before {name} to compare.</Text>;
  }
  return (
    <>
      <View style={styles.statRow}>
        <StatColumn title={`${stats.before.days} days before`} s={stats.before} />
        <StatColumn title={`Since ${name}`} s={stats.since} />
      </View>
      <Text style={styles.hint}>
        Before: your completion history up to the day {name} arrived. Novelty fades around week
        four, so the honest read comes around weeks 10 to 14.
      </Text>
    </>
  );
};

/** The pet's own page: growth, tricks, this week, treasures and settings. */
function PetModal({ visible, onClose }) {
  const { pet, view, now, rename, setColor, setCalm, setHidden } = usePet();
  const { action, play } = usePetReactions(visible);
  const onPetPress = usePetTap(view, play);

  const stats = useMemo(
    () => (visible && pet ? helpingStats(pet, now) : null),
    [visible, pet, now]
  );

  if (!pet || !view) return null;
  const { growth, trick, treasures } = view;
  const displayName = petDisplayName(pet);

  const handleRename = () => {
    tapLight();
    Alert.prompt(
      'Rename',
      'What should your pet be called?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Save', onPress: (value) => rename(value ?? '') },
      ],
      'plain-text',
      pet.name
    );
  };

  const growthText = !view.hatched
    ? 'Finish any task to hatch.'
    : growth.next
      ? `${growth.remaining} more care day${growth.remaining === 1 ? '' : 's'} until ${growth.next.label}.`
      : `${growth.remaining} more care day${growth.remaining === 1 ? '' : 's'} until a new room.`;

  return (
    <Modal visible={visible} animationType="slide" transparent={true} onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1 }}>
        <GlassCard
          style={styles.modalContent}
          colorScheme="dark"
          tintColor="rgba(46, 46, 80, 0.45)"
        >
          <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
            <PetRoom theme={view.room} style={styles.room}>
              <PetAvatar
                size={150}
                stage={view.stage.key}
                mood={view.mood}
                color={pet.color}
                action={action}
                onPress={onPetPress}
                accessibilityLabel={`${displayName}. ${view.line} Tap to play.`}
              />
            </PetRoom>

            <TouchableOpacity
              style={styles.nameRow}
              onPress={handleRename}
              accessibilityRole="button"
              accessibilityLabel={`Rename ${pet.name}`}
            >
              <Text style={styles.name}>{displayName}</Text>
              <SymbolView name="pencil" size={16} tintColor="rgba(255,255,255,0.6)" />
            </TouchableOpacity>
            <Text style={styles.subtitle}>
              {view.stage.label} · day {view.daysTogether} together · {pet.careDays} care day
              {pet.careDays === 1 ? '' : 's'}
            </Text>
            <Text style={styles.line}>{view.line}</Text>
            {view.hatched ? (
              <View style={styles.center}>
                <SnackBowl count={view.todaySnacks} />
              </View>
            ) : null}

            <Text style={styles.sectionLabel}>Growing</Text>
            <Text style={styles.body}>{growthText}</Text>
            <Text style={styles.hint}>
              A care day is any day with at least one finished task. Days off pause growth; they
              never undo it.
            </Text>

            <Text style={styles.sectionLabel}>Tricks</Text>
            <TrickBar filled={trick.filled} slots={trick.slots} style={styles.wideBar} />
            <Text style={styles.body}>
              {trick.next
                ? `${trick.remaining} more snack${trick.remaining === 1 ? '' : 's'} to learn ${trick.next.label}.`
                : 'Every trick learned. Full bars now turn into encore gifts.'}
            </Text>
            {trick.learned.length > 0 ? (
              <View style={styles.chips}>
                {trick.learned.map((t) => (
                  <TouchableOpacity
                    key={t.key}
                    style={styles.chip}
                    onPress={() => {
                      tapLight();
                      play({ type: 'trick', trick: t.key });
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`Do the ${t.label} trick`}
                  >
                    <Text style={styles.chipText}>{t.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            ) : null}

            <Text style={styles.sectionLabel}>This week</Text>
            <View style={styles.week}>
              {view.week.map((d, i) => (
                <View
                  key={`${d.key}-${i}`}
                  style={styles.dayCol}
                  accessible
                  accessibilityLabel={`${DAY_NAMES[i]}, ${DAY_STATUS_SPOKEN[d.status]}${
                    d.snacks > 0 ? `, ${d.snacks} ${d.snacks === 1 ? 'snack' : 'snacks'}` : ''
                  }`}
                >
                  <Text style={styles.dayLabel} maxFontSizeMultiplier={GLYPH_MAX_SCALE}>
                    {d.label}
                  </Text>
                  <View style={[styles.dayDot, styles[`day_${d.status}`]]}>
                    <Text style={styles.dayGlyph} maxFontSizeMultiplier={GLYPH_MAX_SCALE}>
                      {DAY_GLYPH[d.status]}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
            <Text style={styles.hint}>
              {REST_DAYS_PER_WEEK} rest days a week are built in (☾). Cozy weeks so far:{' '}
              {pet.cozyWeeks}.
            </Text>

            <Text style={styles.sectionLabel}>
              Treasures · {treasures.foundCount} of {treasures.total}
            </Text>
            <TreasureShelf treasures={treasures} />
            <Text style={styles.hint}>{pet.name} finds things now and then while you work.</Text>

            <Text style={styles.sectionLabel}>Is {view.hatched ? pet.name : 'it'} helping?</Text>
            {stats ? <HelpingStats stats={stats} name={pet.name} /> : null}

            <Text style={styles.sectionLabel}>Colour</Text>
            <View style={styles.swatches}>
              {PET_COLOR_KEYS.map((key) => (
                <TouchableOpacity
                  key={key}
                  onPress={() => {
                    selection();
                    setColor(key);
                  }}
                  style={[
                    styles.swatch,
                    { backgroundColor: PET_PALETTES[key]?.top ?? '#ccc' },
                    pet.color === key && styles.swatchActive,
                  ]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: pet.color === key }}
                  accessibilityLabel={`Colour ${key}`}
                />
              ))}
            </View>

            <View style={styles.switchRow}>
              <View style={styles.switchText}>
                <Text style={styles.switchLabel}>Calm mode</Text>
                <Text style={styles.hint}>Always content: never peckish, never napping.</Text>
              </View>
              <Switch
                accessibilityLabel="Calm mode"
                value={pet.calm}
                onValueChange={(v) => {
                  selection();
                  setCalm(v);
                }}
              />
            </View>
            <View style={styles.switchRow}>
              <View style={styles.switchText}>
                <Text style={styles.switchLabel}>Show {pet.name}</Text>
                <Text style={styles.hint}>
                  On the home screen and in your lists. Care days still count while hidden; to bring{' '}
                  {pet.name} back, open any list, then Settings → Pet.
                </Text>
              </View>
              <Switch
                accessibilityLabel={`Show ${pet.name}`}
                value={!pet.hidden}
                onValueChange={(v) => {
                  selection();
                  setHidden(!v);
                }}
              />
            </View>
          </ScrollView>
        </GlassCard>

        <GlassCard
          style={styles.buttonWrapper}
          colorScheme="dark"
          tintColor="rgba(46, 46, 80, 0.45)"
        >
          <TouchableOpacity
            onPress={() => {
              tapLight();
              onClose();
            }}
            accessibilityRole="button"
            accessibilityLabel="Done"
          >
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
  scroll: {
    padding: 16,
    paddingBottom: 28,
  },
  room: {
    height: 200,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 14,
  },
  name: {
    color: 'white',
    fontSize: 26,
    fontWeight: '700',
  },
  subtitle: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 4,
  },
  line: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 15,
    textAlign: 'center',
    marginTop: 10,
  },
  center: {
    alignItems: 'center',
    marginTop: 4,
  },
  sectionLabel: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 1.4,
    marginTop: 22,
    marginBottom: 8,
  },
  body: {
    color: 'white',
    fontSize: 15,
    lineHeight: 20,
  },
  hint: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 12,
    lineHeight: 17,
    marginTop: 6,
  },
  wideBar: {
    marginTop: 0,
    marginBottom: 8,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(165, 180, 252, 0.6)',
    backgroundColor: 'rgba(165, 180, 252, 0.12)',
  },
  chipText: {
    color: '#c7d2fe',
    fontSize: 13,
    fontWeight: '600',
  },
  week: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  dayCol: {
    alignItems: 'center',
    gap: 4,
  },
  dayLabel: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 11,
  },
  dayDot: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayGlyph: {
    fontSize: 15,
    lineHeight: 19,
    color: 'rgba(255,255,255,0.8)',
  },
  day_care: {
    backgroundColor: 'rgba(165, 180, 252, 0.3)',
  },
  day_rest: {
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  day_open: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  day_today: {
    borderWidth: 2,
    borderColor: '#a5b4fc',
  },
  day_future: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  day_before: {},
  treasures: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  treasure: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  treasureDream: {
    backgroundColor: 'rgba(196, 181, 253, 0.22)',
  },
  treasureUnfound: {
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  treasureEmoji: {
    fontSize: 22,
    lineHeight: 27,
  },
  treasureUnknown: {
    color: 'rgba(255,255,255,0.2)',
    fontSize: 16,
    fontWeight: '700',
  },
  treasureCount: {
    position: 'absolute',
    right: 3,
    bottom: 1,
    color: 'rgba(255,255,255,0.7)',
    fontSize: 9,
    fontWeight: '700',
  },
  statRow: {
    flexDirection: 'row',
    gap: 10,
  },
  statCol: {
    flex: 1,
    borderRadius: 12,
    padding: 12,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  statTitle: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12,
  },
  statBig: {
    color: 'white',
    fontSize: 28,
    fontWeight: '700',
    marginTop: 4,
  },
  statUnit: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
  },
  statSmall: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 11,
    marginTop: 6,
  },
  swatches: {
    flexDirection: 'row',
    gap: 12,
  },
  swatch: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  swatchActive: {
    borderColor: 'white',
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 18,
    gap: 12,
  },
  switchText: {
    flex: 1,
  },
  switchLabel: {
    color: 'white',
    fontSize: 16,
  },
  buttonWrapper: {
    position: 'relative',
    width: '100%',
    paddingBottom: 35,
    paddingTop: 10,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default PetModal;
