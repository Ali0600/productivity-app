import { useState, useMemo } from 'react';
import {
  StyleSheet,
  Text,
  View,
  SafeAreaView,
  TouchableOpacity,
  ScrollView,
  Modal,
  TextInput,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SymbolView } from 'expo-symbols';
import Tile from '../components/Tile';
import GlassCard from '../components/GlassCard';
import { useMainLists, useAppLoading } from '../hooks/useAppState';
import { tapLight } from '../services/haptics';
import { computeStreak } from '../utils/streaks';

const LONG_NAME_THRESHOLD = 5;
const isLongName = (name) => (name?.length ?? 0) > LONG_NAME_THRESHOLD;

function TileGrid() {
  const { isLoading, error } = useAppLoading();
  const {
    mainLists,
    addMainList,
    removeMainList,
    renameMainList,
    switchMainList,
  } = useMainLists();

  const [addVisible, setAddVisible] = useState(false);
  const [newName, setNewName] = useState('');

  const hero = mainLists[0];
  const rest = mainLists.slice(1);

  const streaks = useMemo(() => {
    const byName = new Map();
    for (const ml of mainLists) byName.set(ml.name, computeStreak(ml));
    return byName;
  }, [mainLists]);

  const handleAdd = () => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    if (mainLists.some((ml) => ml.name === trimmed)) {
      Alert.alert('Duplicate', `A list called "${trimmed}" already exists.`);
      return;
    }
    tapLight();
    addMainList(trimmed);
    setNewName('');
    setAddVisible(false);
  };

  // renameMainList silently no-ops on a taken name; surface that instead.
  const handleRename = (oldName, newName) => {
    if (mainLists.some((ml) => ml.name === newName)) {
      Alert.alert('Duplicate', `A list called "${newName}" already exists.`);
      return;
    }
    renameMainList(oldName, newName);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.topBar}>
        <Text style={styles.title}>ADHDone</Text>
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#fff" />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scrollContent}>
          {hero && (
            <View style={styles.heroItem}>
              <Tile
                name={hero.name}
                streak={streaks.get(hero.name) ?? 0}
                onPress={switchMainList}
                onRename={handleRename}
                onDelete={removeMainList}
              />
            </View>
          )}

          <View style={styles.grid}>
            {rest.map((ml) => (
              <View
                key={ml.name}
                style={isLongName(ml.name) ? styles.wideItem : styles.gridItem}
              >
                <Tile
                  name={ml.name}
                  streak={streaks.get(ml.name) ?? 0}
                  onPress={switchMainList}
                  onRename={handleRename}
                  onDelete={removeMainList}
                />
              </View>
            ))}
            <View style={styles.gridItem}>
              <Tile isPlus onPress={() => setAddVisible(true)} />
            </View>
          </View>
        </ScrollView>
      )}

      <Modal visible={addVisible} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <GlassCard style={styles.modalCard} colorScheme="dark" tintColor="rgba(46, 46, 80, 0.45)">
            <Text style={styles.modalTitle}>New List</Text>
            <TextInput
              style={styles.input}
              onChangeText={setNewName}
              value={newName}
              placeholder="List name"
              placeholderTextColor="rgba(255,255,255,0.5)"
              autoFocus
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                onPress={() => {
                  setNewName('');
                  setAddVisible(false);
                }}
              >
                <SymbolView name="minus.circle.fill" size={50} tintColor="white" />
              </TouchableOpacity>
              <TouchableOpacity onPress={handleAdd}>
                <SymbolView name="plus.circle.fill" size={50} tintColor="white" />
              </TouchableOpacity>
            </View>
          </GlassCard>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const GAP = 6;

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: 'white',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    color: 'red',
    textAlign: 'center',
    padding: 20,
  },
  scrollContent: {
    padding: GAP,
    paddingBottom: 40,
  },
  heroItem: {
    width: '100%',
    aspectRatio: 2,
    padding: GAP,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  gridItem: {
    width: '33.3333%',
    aspectRatio: 1,
    padding: GAP,
  },
  wideItem: {
    width: '66.6666%',
    aspectRatio: 2,
    padding: GAP,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalCard: {
    width: '85%',
    borderRadius: 16,
    padding: 20,
    overflow: 'hidden',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 16,
    textAlign: 'center',
    color: 'white',
  },
  input: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
    borderRadius: 8,
    padding: 10,
    marginBottom: 20,
    color: 'white',
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
});

export default TileGrid;
