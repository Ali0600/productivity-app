import { View, Text, ScrollView, StyleSheet } from 'react-native';
import moment from 'moment';

// Staleness gradient stops: fresh green -> amber -> overdue red.
// Mirrors the status colors already used elsewhere (#86efac green,
// rgba(255,200,120) amber) so the view feels native to the app.
const FRESH = [134, 239, 172];
const MID = [255, 200, 120];
const STALE = [230, 90, 90];

const lerp = (a, b, t) => Math.round(a + (b - a) * t);

const staleColor = (ratio) => {
  const r = Math.min(1, Math.max(0, ratio));
  if (r <= 0.5) {
    const t = r / 0.5;
    return `rgb(${lerp(FRESH[0], MID[0], t)}, ${lerp(FRESH[1], MID[1], t)}, ${lerp(FRESH[2], MID[2], t)})`;
  }
  const t = (r - 0.5) / 0.5;
  return `rgb(${lerp(MID[0], STALE[0], t)}, ${lerp(MID[1], STALE[1], t)}, ${lerp(MID[2], STALE[2], t)})`;
};

const MIN_PCT = 6; // keep a visible sliver even for just-completed tags

/**
 * Horizontal-bar list of tags ranked by how long since they were last completed.
 * Tags sit on the y-axis (top = longest since worked); bar length and color
 * encode staleness. Expects `rows` from computeTagRecovery().
 */
const TagRecovery = ({ rows = [] }) => {
  if (rows.length === 0) {
    return (
      <View style={styles.emptyWrap}>
        <Text style={styles.emptyText}>
          Tag your exercises with muscle groups to see recovery here.
        </Text>
      </View>
    );
  }

  // Longest elapsed time among tags that have been completed at least once.
  const maxSince = rows.reduce(
    (max, r) => (r.neverCompleted || r.msSince == null ? max : Math.max(max, r.msSince)),
    0
  );

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      {rows.map((row) => {
        const ratio = row.neverCompleted ? 1 : maxSince > 0 ? row.msSince / maxSince : 0;
        const pct = row.neverCompleted
          ? 100
          : maxSince > 0
            ? Math.max(MIN_PCT, (row.msSince / maxSince) * 100)
            : MIN_PCT;
        const label = row.neverCompleted ? 'Never' : moment(row.lastCompletedAt).fromNow();

        return (
          <View style={styles.row} key={row.tag}>
            <View style={styles.rowHeader}>
              <Text style={styles.tagName} numberOfLines={1}>
                {row.tag}
              </Text>
              <Text style={styles.since}>{label}</Text>
            </View>
            <View style={styles.track}>
              <View
                style={[styles.fill, { width: `${pct}%`, backgroundColor: staleColor(ratio) }]}
              />
            </View>
          </View>
        );
      })}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: 4,
    paddingBottom: 16,
  },
  row: {
    marginHorizontal: 16,
    marginBottom: 16,
  },
  rowHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  tagName: {
    color: 'white',
    fontSize: 15,
    fontWeight: '600',
    flex: 1,
    marginRight: 10,
  },
  since: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12,
  },
  track: {
    height: 12,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 6,
  },
  emptyWrap: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  emptyText: {
    color: 'rgba(255,255,255,0.6)',
    textAlign: 'center',
    fontSize: 14,
    fontStyle: 'italic',
    lineHeight: 20,
  },
});

export default TagRecovery;
