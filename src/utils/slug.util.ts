/**
 * Slug Utility Functions
 * Generate, validate, and check URL-friendly slugs for locations
 */

import prisma from '../config/database';

/**
 * Generate a URL-friendly slug from a string
 * @param text - The text to convert to slug
 * @returns URL-friendly slug
 */
export const generateSlug = (text: string): string => {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '') // Remove special characters
    .replace(/[\s_-]+/g, '-') // Replace spaces, underscores with single hyphen
    .replace(/^-+|-+$/g, ''); // Remove leading/trailing hyphens
};

/**
 * Validate slug format
 * Rules:
 * - Lowercase only
 * - Alphanumeric + hyphens
 * - 3-50 characters
 * - Must start/end with alphanumeric
 * - No consecutive hyphens
 * 
 * @param slug - The slug to validate
 * @returns true if valid, false otherwise
 */
export const validateSlug = (slug: string): boolean => {
  // Check length
  if (slug.length < 3 || slug.length > 50) {
    return false;
  }

  // Check format: lowercase alphanumeric + hyphens
  const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
  return slugRegex.test(slug);
};

/**
 * Check if slug is available (not already taken)
 * @param slug - The slug to check
 * @param excludeLocationId - Optional location ID to exclude (for updates)
 * @returns true if available, false if taken
 */
export const isSlugAvailable = async (
  slug: string,
  excludeLocationId?: string
): Promise<boolean> => {
  const existing = await prisma.location.findUnique({
    where: { slug },
    select: { id: true },
  });

  // If no existing location, slug is available
  if (!existing) {
    return true;
  }

  // If updating and it's the same location, slug is available
  if (excludeLocationId && existing.id === excludeLocationId) {
    return true;
  }

  return false;
};

/**
 * Generate a unique slug by appending numbers if needed
 * @param baseSlug - The base slug to start with
 * @param excludeLocationId - Optional location ID to exclude (for updates)
 * @returns A unique slug
 */
export const generateUniqueSlug = async (
  baseSlug: string,
  excludeLocationId?: string
): Promise<string> => {
  let slug = generateSlug(baseSlug);
  let counter = 1;

  // Keep trying with incrementing numbers until we find an available slug
  while (!(await isSlugAvailable(slug, excludeLocationId))) {
    slug = `${generateSlug(baseSlug)}-${counter}`;
    counter++;

    // Safety check to prevent infinite loop
    if (counter > 100) {
      throw new Error('Unable to generate unique slug');
    }
  }

  return slug;
};

/**
 * Get slug validation error message
 * @param slug - The slug to validate
 * @returns Error message or null if valid
 */
export const getSlugValidationError = (slug: string): string | null => {
  if (!slug) {
    return 'Slug is required';
  }

  if (slug.length < 3) {
    return 'Slug must be at least 3 characters long';
  }

  if (slug.length > 50) {
    return 'Slug must be at most 50 characters long';
  }

  if (!/^[a-z0-9-]+$/.test(slug)) {
    return 'Slug can only contain lowercase letters, numbers, and hyphens';
  }

  if (!/^[a-z0-9]/.test(slug)) {
    return 'Slug must start with a letter or number';
  }

  if (!/[a-z0-9]$/.test(slug)) {
    return 'Slug must end with a letter or number';
  }

  if (/--/.test(slug)) {
    return 'Slug cannot contain consecutive hyphens';
  }

  return null;
};

