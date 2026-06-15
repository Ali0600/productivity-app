import AsyncStorage from '@react-native-async-storage/async-storage';
import { log } from './logger';

/**
 * Storage service for handling AsyncStorage operations
 * Provides methods for reading and writing data with.
 */
export default class StorageService {
  /**
   * Get data from AsyncStorage
   * @param {string} key - Storage key
   * @param {any} defaultValue - Default value if key doesn't exist
   * @returns {Promise<any>} - Parsed data or default value
   */
  static async getData(key, defaultValue = null) {
    try {
      log(`Getting data for key: ${key}`);
      const jsonValue = await AsyncStorage.getItem(key);
      const result = jsonValue != null ? JSON.parse(jsonValue) : defaultValue;
      log(`Retrieved data for ${key}:`, result);
      return result;
    } catch (error) {
      console.error(`Error reading ${key} from storage:`, error);
      return defaultValue;
    }
  }

  /**
   * Store data in AsyncStorage
   * @param {string} key - Storage key
   * @param {any} value - Value to store
   * @returns {Promise<boolean>} - Success status
   */
  static async storeData(key, value) {
    try {
      log(`Storing data for key: ${key}`, value);
      const jsonValue = JSON.stringify(value);
      await AsyncStorage.setItem(key, jsonValue);
      return true;
    } catch (error) {
      console.error(`Error storing ${key} to storage:`, error);
      return false;
    }
  }

  /**
   * Remove data from AsyncStorage
   * @param {string} key - Storage key to remove
   * @returns {Promise<boolean>} - Success status
   */
  static async removeData(key) {
    try {
      await AsyncStorage.removeItem(key);
      return true;
    } catch (error) {
      console.error(`Error removing ${key} from storage:`, error);
      return false;
    }
  }
  
  /**
   * Clear all data (for debugging)
   * @returns {Promise<boolean>} - Success status
   */
  static async clearAll() {
    try {
      await AsyncStorage.clear();
      log('Storage cleared successfully');
      return true;
    } catch (error) {
      console.error('Error clearing storage:', error);
      return false;
    }
  }

  static async getMainLists() {
    return this.getData('mainLists', null);
  }

  static async saveMainLists(mainLists) {
    return this.storeData('mainLists', mainLists);
  }

  static async getCurrentMainList() {
    return this.getData('currentMainList', '');
  }

  static async saveCurrentMainList(name) {
    return this.storeData('currentMainList', name);
  }

  static async getCurrentSideList() {
    return this.getData('currentSideList', '');
  }

  static async saveCurrentSideList(name) {
    return this.storeData('currentSideList', name);
  }
}