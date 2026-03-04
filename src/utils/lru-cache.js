'use strict';

/**
 * A simple Least Recently Used (LRU) cache implementation.
 */
class LRUCache {
    /**
     * @param {number} [maxSize=500] - Maximum number of items in the cache.
     */
    constructor(maxSize = 500) {
        this.maxSize = maxSize;
        this.cache = new Map();
    }

    /**
     * Gets an item from the cache.
     * 
     * @param {string} key - The key to retrieve.
     * @returns {*} The cached value, or undefined if not found.
     */
    get(key) {
        if (!this.cache.has(key)) return undefined;

        // Refresh position (move to most recently used)
        const val = this.cache.get(key);
        this.cache.delete(key);
        this.cache.set(key, val);
        return val;
    }

    /**
     * Sets an item in the cache.
     * 
     * @param {string} key - The key to store.
     * @param {*} value - The value to store.
     */
    set(key, value) {
        if (this.cache.has(key)) {
            this.cache.delete(key);
        } else if (this.cache.size >= this.maxSize) {
            // Evict least recently used (first item in Map iterator)
            const firstKey = this.cache.keys().next().value;
            this.cache.delete(firstKey);
        }
        this.cache.set(key, value);
    }

    /**
     * Checks if a key exists in the cache.
     * 
     * @param {string} key - The key to check.
     * @returns {boolean}
     */
    has(key) {
        return this.cache.has(key);
    }

    /**
     * Clears the cache.
     */
    clear() {
        this.cache.clear();
    }
}

module.exports = LRUCache;
