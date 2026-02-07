/**
 * Configurable emotion label taxonomy.
 *
 * Allows users to define custom emotion labels with their own
 * dimension and emotion delta mappings. Custom labels are merged
 * with (and can override) the built-in mapping table.
 */

import type { EmotionDimensionDelta } from "../types.js";
import { DIMENSION_NAMES, BASIC_EMOTION_NAMES } from "../types.js";
import { ALL_EMOTION_MAPPINGS, getEmotionMapping } from "./mapping.js";

// ---------------------------------------------------------------------------
// Custom Mapping Creation
// ---------------------------------------------------------------------------

/**
 * Create a validated custom emotion mapping.
 * Filters out invalid dimension/emotion names.
 */
export function createCustomMapping(
  _label: string,
  raw: { dimensions: Record<string, number>; emotions: Record<string, number> },
): EmotionDimensionDelta {
  const dimensions: Record<string, number> = {};
  for (const [key, value] of Object.entries(raw.dimensions)) {
    if ((DIMENSION_NAMES as readonly string[]).includes(key)) {
      dimensions[key] = value;
    }
  }

  const emotions: Record<string, number> = {};
  for (const [key, value] of Object.entries(raw.emotions)) {
    if ((BASIC_EMOTION_NAMES as readonly string[]).includes(key)) {
      emotions[key] = value;
    }
  }

  return { dimensions, emotions };
}

// ---------------------------------------------------------------------------
// Merge Custom Mappings
// ---------------------------------------------------------------------------

/**
 * Merge custom label mappings with the built-in mapping table.
 * Custom entries override built-in ones.
 *
 * @returns A new mapping table with custom entries merged in.
 */
export function mergeCustomMappings(
  customMappings: Record<string, { dimensions: Record<string, number>; emotions: Record<string, number> }>,
): Record<string, EmotionDimensionDelta> {
  const merged: Record<string, EmotionDimensionDelta> = { ...ALL_EMOTION_MAPPINGS };

  for (const [label, raw] of Object.entries(customMappings)) {
    merged[label.toLowerCase()] = createCustomMapping(label, raw);
  }

  return merged;
}

// ---------------------------------------------------------------------------
// Taxonomy Validation
// ---------------------------------------------------------------------------

export interface TaxonomyValidation {
  valid: boolean;
  warnings: string[];
}

/**
 * Validate a custom label taxonomy.
 *
 * Checks:
 * - At least one label is present
 * - No duplicates
 * - Warns about labels without known mappings
 */
export function validateTaxonomy(labels: string[]): TaxonomyValidation {
  const warnings: string[] = [];

  if (labels.length === 0) {
    return { valid: false, warnings: ["Taxonomy must contain at least one label."] };
  }

  // Check for duplicates
  const seen = new Set<string>();
  for (const label of labels) {
    const normalized = label.toLowerCase();
    if (seen.has(normalized)) {
      warnings.push(`Label "${label}" is a duplicate.`);
    }
    seen.add(normalized);
  }

  // Check for labels without mappings
  for (const label of labels) {
    const mapping = getEmotionMapping(label);
    if (!mapping) {
      warnings.push(
        `Label "${label}" has no built-in mapping. It will be treated as neutral unless a custom mapping is provided.`,
      );
    }
  }

  return { valid: true, warnings };
}
