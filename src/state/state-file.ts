/**
 * Atomic state file I/O with file locking.
 *
 * Pattern from emotion-state-1 handler.ts: tmp write + rename for atomicity,
 * exclusive file lock to prevent concurrent corruption.
 */

import fs from "node:fs/promises";
import path from "node:path";
import type { EmotionEngineState } from "../types.js";
import { createDefaultDimensionalState, createDefaultBasicEmotions } from "../model/emotion-model.js";
import { createDefaultPersonality, computeBaseline, computeDimensionDecayRates, computeEmotionDecayRates } from "../model/personality.js";
import { createEmptyRuminationState } from "../model/rumination.js";

/** Default stale lock timeout in ms. */
const DEFAULT_STALE_MS = 10_000;

// ---------------------------------------------------------------------------
// Empty State Factory
// ---------------------------------------------------------------------------

/** Build a fresh, empty EmotionEngineState (v2). */
export function buildEmptyState(): EmotionEngineState {
  const personality = createDefaultPersonality();
  const now = new Date().toISOString();
  return {
    version: 2,
    lastUpdated: now,
    personality,
    dimensions: createDefaultDimensionalState(),
    baseline: computeBaseline(personality),
    decayRates: computeDimensionDecayRates(personality),
    emotionDecayRates: computeEmotionDecayRates(personality),
    basicEmotions: createDefaultBasicEmotions(),
    recentStimuli: [],
    rumination: createEmptyRuminationState(),
    users: {},
    agents: {},
    meta: {
      totalUpdates: 0,
      createdAt: now,
    },
  };
}

// ---------------------------------------------------------------------------
// Read / Write
// ---------------------------------------------------------------------------

/**
 * Read and parse the state file. Returns an empty state if the file
 * does not exist or is corrupted.
 */
export async function readStateFile(filePath: string): Promise<EmotionEngineState> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as EmotionEngineState;
    // Basic sanity check
    if (!parsed || typeof parsed !== "object" || parsed.version !== 2) {
      return buildEmptyState();
    }
    return parsed;
  } catch {
    return buildEmptyState();
  }
}

/**
 * Write state to disk atomically (tmp file + rename).
 * Creates parent directories if they don't exist.
 */
export async function writeStateFile(
  filePath: string,
  state: EmotionEngineState,
): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(state, null, 2), "utf8");
  await fs.rename(tmp, filePath);
}

// ---------------------------------------------------------------------------
// File Locking
// ---------------------------------------------------------------------------

/**
 * Attempt to acquire an exclusive file lock.
 * Uses O_EXCL create as a portable advisory lock.
 *
 * @param lockPath - Path to the lock file
 * @param staleMs - If an existing lock is older than this, treat it as stale
 * @returns true if lock was acquired
 */
export async function acquireLock(
  lockPath: string,
  staleMs: number = DEFAULT_STALE_MS,
): Promise<boolean> {
  try {
    const handle = await fs.open(lockPath, "wx");
    await handle.close();
    return true;
  } catch (err: unknown) {
    if (err && typeof err === "object" && "code" in err && err.code !== "EEXIST") {
      return false;
    }
    // Lock file exists -- check if it's stale
    try {
      const stat = await fs.stat(lockPath);
      if (Date.now() - stat.mtimeMs > staleMs) {
        await fs.unlink(lockPath).catch(() => {});
        const handle = await fs.open(lockPath, "wx");
        await handle.close();
        return true;
      }
    } catch {
      // Race condition with another process -- give up
    }
    return false;
  }
}

/**
 * Release a file lock. Idempotent -- does not throw if lock doesn't exist.
 */
export async function releaseLock(lockPath: string): Promise<void> {
  await fs.unlink(lockPath).catch(() => {});
}
