import AsyncStorage from '@react-native-async-storage/async-storage';
import { createPet, normalizePet } from '../utils/pet';

export const PET_STORAGE_KEY = 'pet';
// Where an unreadable pet record is parked before a new egg replaces it.
export const PET_CORRUPT_KEY = 'pet:corrupt';

/**
 * Load the pet. The outcomes are kept apart on purpose:
 * - `{ pet, created: true }` — nothing stored yet, so a new egg.
 * - `{ pet }` — the stored pet, normalized to the current shape.
 * - `{ pet, recovered: true }` — the stored record was unreadable; its raw
 *   bytes were parked under PET_CORRUPT_KEY first, then a new egg was made.
 * - `{ pet: null, error }` — storage could not be read (or the bad record could
 *   not be parked). The caller must not save this session: a fallback written
 *   now would overwrite a pet it never saw.
 *
 * Deliberately not StorageService.getData, which returns its default on a
 * failed read and so cannot tell "nothing stored" from "could not read".
 * @param {number} now
 */
export const loadPet = async (now = Date.now()) => {
  let raw;
  try {
    raw = await AsyncStorage.getItem(PET_STORAGE_KEY);
  } catch (error) {
    console.error('Error reading the pet from storage:', error);
    return { pet: null, error };
  }
  if (raw == null) return { pet: createPet(now), created: true };

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = undefined;
  }
  const pet = normalizePet(parsed, now);
  if (pet) return { pet };

  try {
    await AsyncStorage.setItem(PET_CORRUPT_KEY, raw);
  } catch (error) {
    console.error('Could not park the unreadable pet record:', error);
    return { pet: null, error };
  }
  console.warn(`The stored pet was unreadable; kept its bytes under "${PET_CORRUPT_KEY}".`);
  return { pet: createPet(now), recovered: true };
};

/** @returns {Promise<boolean>} whether the write landed */
export const savePet = async (pet) => {
  try {
    await AsyncStorage.setItem(PET_STORAGE_KEY, JSON.stringify(pet));
    return true;
  } catch (error) {
    console.error('Error saving the pet:', error);
    return false;
  }
};
