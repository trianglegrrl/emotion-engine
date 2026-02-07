/**
 * Goal-aware emotion modulation.
 *
 * Personality traits define implicit behavioral goals. When an emotion
 * is relevant to an active goal (threatening or achieving it), the
 * emotional response is amplified.
 *
 * Ported from ros_emotion personality goal influence.
 */

import type { OCEANProfile } from "../types.js";

// ---------------------------------------------------------------------------
// Goal Types
// ---------------------------------------------------------------------------

export interface PersonalityGoal {
  /** Goal type identifier. */
  type: "task_completion" | "exploration" | "social_harmony" | "self_regulation" | "novelty_seeking";
  /** How strongly this goal is active (0-1). */
  strength: number;
  /** Emotions that are amplified when this goal is threatened. */
  threatEmotions: string[];
  /** Emotions that are amplified when this goal is achieved. */
  achievementEmotions: string[];
}

export interface GoalModulation {
  /** Multiplier to apply to the emotion intensity. */
  intensityMultiplier: number;
  /** Which goals contributed to this modulation. */
  contributingGoals: string[];
}

// ---------------------------------------------------------------------------
// Goal Inference
// ---------------------------------------------------------------------------

/** Trait threshold above which a goal becomes active. */
const GOAL_THRESHOLD = 0.6;

/**
 * Infer behavioral goals from personality traits.
 * Goals activate when traits exceed a threshold.
 */
export function inferGoals(personality: OCEANProfile): PersonalityGoal[] {
  const goals: PersonalityGoal[] = [];

  if (personality.conscientiousness > GOAL_THRESHOLD) {
    goals.push({
      type: "task_completion",
      strength: (personality.conscientiousness - GOAL_THRESHOLD) / (1 - GOAL_THRESHOLD),
      threatEmotions: ["frustrated", "anxious", "confused", "fatigued"],
      achievementEmotions: ["happy", "relieved", "energized", "focused"],
    });
  }

  if (personality.openness > GOAL_THRESHOLD) {
    goals.push({
      type: "exploration",
      strength: (personality.openness - GOAL_THRESHOLD) / (1 - GOAL_THRESHOLD),
      threatEmotions: ["bored", "frustrated"],
      achievementEmotions: ["curious", "excited", "surprised"],
    });
  }

  if (personality.agreeableness > GOAL_THRESHOLD) {
    goals.push({
      type: "social_harmony",
      strength: (personality.agreeableness - GOAL_THRESHOLD) / (1 - GOAL_THRESHOLD),
      threatEmotions: ["angry", "disgusted", "lonely"],
      achievementEmotions: ["connected", "trusting", "happy", "calm"],
    });
  }

  if (personality.conscientiousness > GOAL_THRESHOLD && personality.neuroticism < 0.4) {
    goals.push({
      type: "self_regulation",
      strength: Math.min(
        (personality.conscientiousness - GOAL_THRESHOLD) / (1 - GOAL_THRESHOLD),
        (0.4 - personality.neuroticism) / 0.4,
      ),
      threatEmotions: ["angry", "anxious"],
      achievementEmotions: ["calm", "focused", "relieved"],
    });
  }

  if (personality.openness > 0.7 && personality.extraversion > GOAL_THRESHOLD) {
    goals.push({
      type: "novelty_seeking",
      strength: Math.min(
        (personality.openness - 0.7) / 0.3,
        (personality.extraversion - GOAL_THRESHOLD) / (1 - GOAL_THRESHOLD),
      ),
      threatEmotions: ["bored", "fatigued"],
      achievementEmotions: ["excited", "curious", "surprised", "energized"],
    });
  }

  return goals;
}

// ---------------------------------------------------------------------------
// Modulation Computation
// ---------------------------------------------------------------------------

/**
 * Compute how active goals modulate an emotion's intensity.
 *
 * If the emotion threatens a goal, it gets amplified (the agent "cares more").
 * If the emotion signals goal achievement, it also gets amplified (reinforcement).
 */
export function computeGoalModulation(
  goals: PersonalityGoal[],
  emotionLabel: string,
  _baseIntensity: number,
): GoalModulation {
  let multiplier = 1.0;
  const contributing: string[] = [];
  const label = emotionLabel.toLowerCase();

  for (const goal of goals) {
    const isThreat = goal.threatEmotions.includes(label);
    const isAchievement = goal.achievementEmotions.includes(label);

    if (isThreat) {
      // Threat amplification: scales with goal strength
      multiplier += goal.strength * 0.3;
      contributing.push(goal.type);
    } else if (isAchievement) {
      // Achievement amplification: slightly less than threat
      multiplier += goal.strength * 0.2;
      contributing.push(goal.type);
    }
  }

  return {
    intensityMultiplier: multiplier,
    contributingGoals: contributing,
  };
}

// ---------------------------------------------------------------------------
// Application
// ---------------------------------------------------------------------------

/**
 * Apply goal-based modulation to an emotion intensity.
 * Returns the modulated intensity, clamped to [0, 1].
 */
export function applyGoalModulation(
  goals: PersonalityGoal[],
  emotionLabel: string,
  intensity: number,
): number {
  const modulation = computeGoalModulation(goals, emotionLabel, intensity);
  return Math.min(1.0, intensity * modulation.intensityMultiplier);
}
