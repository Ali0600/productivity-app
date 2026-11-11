import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import PetAvatar, { PET_ACTION_TYPES, PET_MOODS, PET_STAGES, PET_TRICKS } from './PetAvatar';
import PetRoom from './PetRoom';
import { DEFAULT_PET_COLOR, PET_PALETTES, ROOM_THEMES } from './petTheme';

const COLORS = Object.keys(PET_PALETTES);
const ROOMS = Object.keys(ROOM_THEMES);
// Derived, so a new action type gets a button; tricks have their own row.
const ACTIONS = PET_ACTION_TYPES.filter((type) => type !== 'trick');
const SNACKS = ['🍓', '🍙', '🍪', '🧁', '🫐', '🍑'];
const GRID_SIZE = 72;
// The sizes the pet must look right at; the smallest are where the size floors
// (minimum line widths, particle fonts, the second eye sparkle) take over.
const SPEC_SIZES = [48, 56, 120, 170];
// Names that must fall back to the defaults, including inherited object keys.
const BAD_KEYS = ['nope', 'constructor', 'toString'];

const Section = ({ title, children }) => (
  <View style={styles.section}>
    <Text style={styles.sectionTitle}>{title}</Text>
    {children}
  </View>
);

const Cell = ({ caption, children }) => (
  <View style={styles.cell}>
    {children}
    <Text style={styles.caption} numberOfLines={1}>
      {caption}
    </Text>
  </View>
);

const GalleryButton = ({ label, onPress, selected }) => (
  <TouchableOpacity
    style={[styles.button, selected && styles.buttonSelected]}
    onPress={onPress}
    accessibilityRole="button"
    accessibilityState={{ selected: !!selected }}
  >
    <Text style={styles.buttonText}>{label}</Text>
  </TouchableOpacity>
);

const ChipRow = ({ label, options, value, onChange }) => (
  <View style={styles.chipBlock}>
    <Text style={styles.chipLabel}>{label}</Text>
    <View style={styles.wrapRow}>
      {options.map((option) => (
        <GalleryButton
          key={option}
          label={option}
          selected={option === value}
          onPress={() => onChange(option)}
        />
      ))}
    </View>
  </View>
);

function Gallery() {
  const reduced = useReducedMotion();
  const [stage, setStage] = useState('kid');
  const [mood, setMood] = useState('fed');
  const [color, setColor] = useState(DEFAULT_PET_COLOR);
  const [room, setRoom] = useState('nursery');
  const [action, setAction] = useState(null);
  const [snackIndex, setSnackIndex] = useState(0);

  // Every tap bumps the id, so the same action can be replayed.
  const fire = (type, extra) =>
    setAction((prev) => ({ id: (prev ? prev.id : 0) + 1, type, ...extra }));

  const onAction = (type) => {
    if (type === 'hatch') {
      // The pet passes a hatched stage together with the hatch action.
      setStage('baby');
      fire('hatch');
    } else if (type === 'wake') {
      if (mood === 'napping') setMood('fed');
      fire('wake');
    } else if (type === 'eat') {
      fire('eat', { snack: SNACKS[snackIndex % SNACKS.length] });
      setSnackIndex((i) => i + 1);
    } else {
      fire(type);
    }
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
    >
      <Text style={styles.title}>Pet gallery</Text>
      <Text style={styles.note}>
        Dev only. Reduce Motion is {reduced ? 'ON' : 'off'} (read at app start).
      </Text>

      <Section title="Stages × moods">
        {PET_STAGES.map((s) => (
          <View key={s} style={styles.gridBlock}>
            <Text style={styles.rowLabel}>{s}</Text>
            <View style={styles.row}>
              {PET_MOODS.map((m) => (
                <Cell key={m} caption={m}>
                  <PetAvatar size={GRID_SIZE} stage={s} mood={m} color={DEFAULT_PET_COLOR} />
                </Cell>
              ))}
            </View>
          </View>
        ))}
      </Section>

      <Section title="Sizes (fed)">
        {PET_STAGES.map((s) => (
          <View key={s} style={styles.gridBlock}>
            <Text style={styles.rowLabel}>{s}</Text>
            <View style={[styles.wrapRow, styles.bottomRow]}>
              {SPEC_SIZES.map((px) => (
                <Cell key={px} caption={`${px}`}>
                  <PetAvatar size={px} stage={s} mood="fed" color={DEFAULT_PET_COLOR} />
                </Cell>
              ))}
            </View>
          </View>
        ))}
      </Section>

      <Section title="Colours (kid, fed)">
        <View style={styles.wrapRow}>
          {COLORS.map((c) => (
            <Cell key={c} caption={c}>
              <PetAvatar size={GRID_SIZE} stage="kid" mood="fed" color={c} />
            </Cell>
          ))}
        </View>
      </Section>

      <Section title="Fallbacks (default colour, Nursery room)">
        <View style={styles.wrapRow}>
          {BAD_KEYS.map((key) => (
            <Cell key={`colour-${key}`} caption={`colour "${key}"`}>
              <PetAvatar size={GRID_SIZE} stage="kid" mood="fed" color={key} />
            </Cell>
          ))}
          {BAD_KEYS.map((key) => (
            <Cell key={`room-${key}`} caption={`room "${key}"`}>
              <PetRoom theme={key} style={styles.smallRoom}>
                <PetAvatar size={64} stage="kid" mood="fed" color={color} />
              </PetRoom>
            </Cell>
          ))}
        </View>
      </Section>

      <Section title="Rooms">
        <View style={styles.wrapRow}>
          {ROOMS.map((r) => (
            <Cell key={r} caption={ROOM_THEMES[r].label}>
              <PetRoom theme={r} style={styles.smallRoom}>
                <PetAvatar size={64} stage="kid" mood="fed" color={color} />
              </PetRoom>
            </Cell>
          ))}
        </View>
      </Section>

      <Section title="Actions">
        <PetRoom theme={room} style={styles.bigRoom}>
          <PetAvatar
            size={170}
            stage={stage}
            mood={mood}
            color={color}
            action={action}
            onPress={() => fire('pet')}
            accessibilityLabel="Gallery pet. Tap to pet."
          />
        </PetRoom>
        <Text style={styles.status}>
          {action
            ? `#${action.id} ${action.type}${action.trick ? ` · ${action.trick}` : ''}${
                action.snack ? ` ${action.snack}` : ''
              }`
            : 'Tap a button, or the pet.'}
        </Text>

        <Text style={styles.chipLabel}>Action</Text>
        <View style={styles.wrapRow}>
          {ACTIONS.map((a) => (
            <GalleryButton key={a} label={a} onPress={() => onAction(a)} />
          ))}
        </View>
        <Text style={styles.chipLabel}>Trick</Text>
        <View style={styles.wrapRow}>
          {PET_TRICKS.map((t) => (
            <GalleryButton key={t} label={t} onPress={() => fire('trick', { trick: t })} />
          ))}
          <GalleryButton label="nope (→ hop)" onPress={() => fire('trick', { trick: 'nope' })} />
        </View>

        <ChipRow label="Stage" options={PET_STAGES} value={stage} onChange={setStage} />
        <ChipRow label="Mood" options={PET_MOODS} value={mood} onChange={setMood} />
        <ChipRow label="Colour" options={COLORS} value={color} onChange={setColor} />
        <ChipRow label="Room" options={ROOMS} value={room} onChange={setRoom} />
      </Section>
    </ScrollView>
  );
}

/**
 * DEV-ONLY screen for eyeballing every pet state in a simulator: each stage and
 * mood, each colour, each room, and a playground that fires every action and
 * trick. Renders nothing in a production build.
 */
export default function PetGallery() {
  return __DEV__ ? <Gallery /> : null;
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#0f0f24',
  },
  content: {
    padding: 16,
    paddingBottom: 48,
  },
  title: {
    color: 'white',
    fontSize: 24,
    fontWeight: '700',
  },
  note: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12,
    marginTop: 4,
  },
  section: {
    marginTop: 24,
  },
  sectionTitle: {
    color: 'white',
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 10,
  },
  gridBlock: {
    marginBottom: 6,
  },
  rowLabel: {
    color: '#c7d2fe',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 2,
  },
  row: {
    flexDirection: 'row',
    gap: 8,
  },
  wrapRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  // Mixed sizes stand on one baseline, as they would in the app.
  bottomRow: {
    alignItems: 'flex-end',
  },
  cell: {
    alignItems: 'center',
    marginBottom: 8,
  },
  caption: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 11,
    marginTop: 2,
    maxWidth: 104,
  },
  smallRoom: {
    width: 104,
    height: 104,
  },
  bigRoom: {
    height: 240,
  },
  status: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    marginTop: 8,
    marginBottom: 4,
  },
  chipBlock: {
    marginTop: 4,
  },
  chipLabel: {
    color: '#c7d2fe',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 10,
    marginBottom: 6,
  },
  button: {
    backgroundColor: 'rgba(165, 180, 252, 0.18)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  buttonSelected: {
    backgroundColor: 'rgba(165, 180, 252, 0.5)',
  },
  buttonText: {
    color: 'white',
    fontSize: 13,
    fontWeight: '600',
  },
});
