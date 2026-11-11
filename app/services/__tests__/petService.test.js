import AsyncStorage from '@react-native-async-storage/async-storage';
import { loadPet, savePet, PET_STORAGE_KEY, PET_CORRUPT_KEY } from '../petService';
import { createPet } from '../../utils/pet';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

const T0 = new Date(2026, 10, 2, 9, 0).getTime();

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

test('nothing stored yet → a new egg', async () => {
  const result = await loadPet(T0);
  expect(result.created).toBe(true);
  expect(result.pet).toEqual(createPet(T0));
});

test('a saved pet loads back as it was', async () => {
  const pet = { ...createPet(T0), name: 'Pudding', snacks: 4, careDays: 2 };
  expect(await savePet(pet)).toBe(true);
  const result = await loadPet(T0 + 1000);
  expect(result.pet).toEqual(pet);
  expect(result.created).toBeUndefined();
});

test.each([
  ['broken JSON', '{"name": "Pud'],
  ['valid JSON that is not a pet', '[1, 2, 3]'],
])('%s is parked, and stays parked after the next save', async (_, bytes) => {
  await AsyncStorage.setItem(PET_STORAGE_KEY, bytes);
  const result = await loadPet(T0);
  expect(result.recovered).toBe(true);
  expect(result.pet).toEqual(createPet(T0));
  expect(await AsyncStorage.getItem(PET_CORRUPT_KEY)).toBe(bytes);
  await savePet(result.pet);
  expect(await AsyncStorage.getItem(PET_CORRUPT_KEY)).toBe(bytes);
});

test('a failed read gives no pet, so the caller cannot save a fallback over it', async () => {
  await AsyncStorage.setItem(PET_STORAGE_KEY, JSON.stringify({ ...createPet(T0), name: 'Bean' }));
  AsyncStorage.getItem.mockRejectedValueOnce(new Error('disk on fire'));
  const result = await loadPet(T0);
  expect(result.pet).toBeNull();
  expect(result.error).toBeInstanceOf(Error);
});

test('if the unreadable record cannot be parked, loading fails closed', async () => {
  await AsyncStorage.setItem(PET_STORAGE_KEY, 'not json');
  AsyncStorage.setItem.mockRejectedValueOnce(new Error('disk full'));
  const result = await loadPet(T0);
  expect(result.pet).toBeNull();
  expect(await AsyncStorage.getItem(PET_STORAGE_KEY)).toBe('not json');
});

test('savePet reports a failed write instead of throwing', async () => {
  AsyncStorage.setItem.mockRejectedValueOnce(new Error('disk full'));
  expect(await savePet(createPet(T0))).toBe(false);
});
