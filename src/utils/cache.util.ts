/**
 * Cache Utility
 * Provides functions to clear cache when admin makes changes
 */

import redis from '../config/redis';

/**
 * Clear all cache entries for a specific location
 * @param locationId - Location ID
 * @param slug - Location slug (optional, used for slug-based cache keys)
 */
export const clearLocationCache = async (locationId: string, slug?: string): Promise<void> => {
  try {
    // Clear menu cache
    await redis.del(`menu:${locationId}`);
    
    // Clear slug-based menu cache if slug is provided
    if (slug) {
      await redis.del(`menu:slug:${slug}`);
      await redis.del(`about:slug:${slug}`);
      await redis.del(`contact:slug:${slug}`);
    }
    
    // Clear all cache keys that start with menu: or about: or contact: for this location
    // Using pattern matching (note: KEYS is blocking, but acceptable for cache invalidation)
    const patterns = [
      `menu:*${locationId}*`,
      `about:*${locationId}*`,
      `contact:*${locationId}*`,
    ];
    
    for (const pattern of patterns) {
      const keys = await redis.keys(pattern);
      if (keys.length > 0) {
        await redis.del(...keys);
      }
    }
  } catch (error) {
    // Log error but don't throw - cache clearing is non-critical
    console.error('Error clearing location cache:', error);
  }
};

/**
 * Clear all cache entries for all locations of a business
 * @param _businessId - Business ID (currently clears all cache, parameter kept for API consistency)
 */
export const clearBusinessCache = async (_businessId: string): Promise<void> => {
  try {
    // We need to get all locations for this business to clear their caches
    // But we'll use a simpler approach: clear all menu/about/contact caches
    // The cache will be repopulated on next request
    // This is acceptable since admin changes are infrequent
    
    // Note: This is a broad cache clear, but it's safe and ensures consistency
    const patterns = ['menu:*', 'about:*', 'contact:*'];
    
    for (const pattern of patterns) {
      const keys = await redis.keys(pattern);
      if (keys.length > 0) {
        await redis.del(...keys);
      }
    }
  } catch (error) {
    // Log error but don't throw - cache clearing is non-critical
    console.error('Error clearing business cache:', error);
  }
};

/**
 * Clear about page cache for a specific location
 * @param slug - Location slug
 */
export const clearAboutPageCache = async (slug: string): Promise<void> => {
  try {
    await redis.del(`about:slug:${slug}`);
  } catch (error) {
    console.error('Error clearing about page cache:', error);
  }
};

/**
 * Clear menu cache for a specific location
 * @param locationId - Location ID
 * @param slug - Location slug (optional)
 */
export const clearMenuCache = async (locationId: string, slug?: string): Promise<void> => {
  try {
    await redis.del(`menu:${locationId}`);
    if (slug) {
      await redis.del(`menu:slug:${slug}`);
    }
  } catch (error) {
    console.error('Error clearing menu cache:', error);
  }
};

/**
 * Clear all public caches (use with caution - only for admin operations)
 */
export const clearAllPublicCache = async (): Promise<void> => {
  try {
    const patterns = ['menu:*', 'about:*', 'contact:*'];
    
    for (const pattern of patterns) {
      const keys = await redis.keys(pattern);
      if (keys.length > 0) {
        await redis.del(...keys);
      }
    }
  } catch (error) {
    console.error('Error clearing all public cache:', error);
  }
};

/**
 * Clear featured section cache for a specific location
 * @param locationId - Location ID
 * @param slug - Location slug (optional)
 */
export const clearFeaturedSectionCache = async (locationId: string, slug?: string): Promise<void> => {
  try {
    // Featured sections are included in menu cache, so clear menu cache
    await clearMenuCache(locationId, slug);
  } catch (error) {
    console.error('Error clearing featured section cache:', error);
  }
};

