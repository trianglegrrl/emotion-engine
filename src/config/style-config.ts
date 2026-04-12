/**
 * Configuration for user style profiling.
 *
 * Controls how often profiling runs, sample sizes, staleness thresholds,
 * and EMA (exponential moving average) weighting parameters.
 */

export interface StyleProfileConfig {
  /** Number of messages between profiling runs. */
  profilingInterval: number;
  /** Maximum number of samples retained for profiling. */
  maxSampleSize: number;
  /** Days before a profile is considered stale. */
  stalenessThresholdDays: number;
  /** Sample size to reset to when a stale profile is refreshed. */
  stalenessResetSampleSize: number;
  /** Minimum sample size before profile is considered mature. */
  profileMaturityThreshold: number;
  /** Maximum tokens per source excerpt. */
  excerptTokenLimit: number;
  /** EMA base weight (controls how quickly new samples influence the average). */
  emaBaseWeight: number;
  /** EMA maximum weight cap (0-1). */
  emaMaxWeight: number;
}

export const DEFAULT_STYLE_CONFIG: StyleProfileConfig = {
  profilingInterval: 10,
  maxSampleSize: 100,
  stalenessThresholdDays: 30,
  stalenessResetSampleSize: 30,
  profileMaturityThreshold: 10,
  excerptTokenLimit: 200,
  emaBaseWeight: 5,
  emaMaxWeight: 0.5,
};
