/**
 * HookRunner: central integration for Claude Code hook events.
 *
 * Handles three hook events:
 *  - SessionStart: inject emotional context at session start
 *  - UserPromptSubmit: update state on each user message
 *  - Stop: classify assistant/user messages asynchronously
 */

import fs from "node:fs";
import path from "node:path";
import { resolveConfig, type ResolvedConfig } from "../config/resolve-config.js";
import { StateManager } from "../state/state-manager.js";
import { classifyEmotion } from "../classify/claude-classify.js";
import type { ClassifyResult } from "../classify/claude-classify.js";
import { createDefaultTracker, runProfiling } from "../classify/style-profiler.js";
import { buildExcerpt } from "../utils/excerpt.js";
import { formatEmotionBlock, type FormatOptions } from "../format/prompt-formatter.js";
import type { ClassificationResult, ClassificationUsage, EmotionEngineState } from "../types.js";
import { type StyleProfileConfig, DEFAULT_STYLE_CONFIG } from "../config/style-config.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SessionStartInput {
  session_id: string;
  cwd?: string;
  transcript_path?: string;
  agent_id?: string;
}

export interface UserPromptInput {
  session_id: string;
  user_message?: string;
  transcript_path?: string;
  agent_id?: string;
}

export interface StopInput {
  session_id: string;
  last_assistant_message?: string;
  transcript_path?: string;
  agent_id?: string;
}

interface HookOutput {
  hookSpecificOutput?: {
    hookEventName: string;
    additionalContext: string;
  };
}

// ---------------------------------------------------------------------------
// Transcript Helper
// ---------------------------------------------------------------------------

/**
 * Read the last user message from a Claude Code transcript file (JSON lines).
 * Returns undefined if the file can't be read or parsed.
 */
function readLastUserMessage(transcriptPath: string): string | undefined {
  try {
    const raw = fs.readFileSync(transcriptPath, "utf8");
    const lines = raw.trim().split("\n").filter(Boolean);

    // Walk backwards to find last user message
    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        const entry = JSON.parse(lines[i]);
        if (entry.role === "user" && typeof entry.content === "string") {
          return entry.content;
        }
        // Handle array content format
        if (entry.role === "user" && Array.isArray(entry.content)) {
          const textBlock = entry.content.find(
            (b: { type: string; text?: string }) => b.type === "text" && typeof b.text === "string",
          );
          if (textBlock) return textBlock.text;
        }
      } catch {
        // Skip unparseable lines
      }
    }
  } catch {
    // File doesn't exist or can't be read
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Token Usage Helper (immutable)
// ---------------------------------------------------------------------------

function withTokenUsage(
  state: EmotionEngineState,
  usage: ClassificationUsage,
): EmotionEngineState {
  return {
    ...state,
    tokenUsage: {
      totalInput: state.tokenUsage.totalInput + usage.inputTokens,
      totalOutput: state.tokenUsage.totalOutput + usage.outputTokens,
      totalCostUsd: state.tokenUsage.totalCostUsd + usage.costUsd,
      classificationCount: state.tokenUsage.classificationCount + 1,
    },
  };
}

// ---------------------------------------------------------------------------
// HookRunner
// ---------------------------------------------------------------------------

export class HookRunner {
  private readonly config: ResolvedConfig;
  private readonly styleConfig: StyleProfileConfig;

  constructor(config?: ResolvedConfig, styleConfig?: StyleProfileConfig) {
    this.config = config ?? resolveConfig();
    this.styleConfig = styleConfig ?? DEFAULT_STYLE_CONFIG;
  }

  // -----------------------------------------------------------------------
  // Path Resolution
  // -----------------------------------------------------------------------

  private resolveStatePath(agentId?: string): string {
    if (agentId) {
      return path.join(this.config.dataDir, "agents", `${agentId}.json`);
    }
    return path.join(this.config.dataDir, "state.json");
  }

  private createStateManager(agentId?: string): StateManager {
    const statePath = this.resolveStatePath(agentId);
    return new StateManager(statePath, this.config);
  }

  // -----------------------------------------------------------------------
  // Format Options
  // -----------------------------------------------------------------------

  private buildFormatOptions(): FormatOptions {
    return {
      maxUserEntries: this.config.maxHistory,
      maxAgentEntries: this.config.maxHistory,
      halfLifeHours: this.config.halfLifeHours,
      trendWindowHours: this.config.trendWindowHours,
      agentEmotions: this.config.agentEmotions,
      userEmotions: this.config.userEmotions,
    };
  }

  // -----------------------------------------------------------------------
  // Classify Helper
  // -----------------------------------------------------------------------

  private async safeClassify(
    text: string,
    role: "agent" | "user",
    styleOptions?: { style?: import("../types.js").UserStyleProfile; maturityThreshold?: number },
  ): Promise<ClassifyResult | undefined> {
    try {
      return await classifyEmotion(text, {
        model: this.config.model,
        role,
        emotionLabels: this.config.emotionLabels,
        confidenceMin: this.config.confidenceMin,
        style: styleOptions?.style,
        maturityThreshold: styleOptions?.maturityThreshold,
      });
    } catch (err) {
      console.error(`[openfeelz] Classification failed for ${role}:`, err);
      return undefined;
    }
  }

  // -----------------------------------------------------------------------
  // Build Hook Response
  // -----------------------------------------------------------------------

  private buildContextResponse(
    hookEventName: string,
    state: EmotionEngineState,
    sessionId: string,
    agentId?: string,
  ): HookOutput {
    const block = formatEmotionBlock(
      state,
      sessionId,
      agentId ?? "main",
      this.buildFormatOptions(),
    );

    if (!block) {
      return {};
    }

    return {
      hookSpecificOutput: {
        hookEventName,
        additionalContext: block,
      },
    };
  }

  // -----------------------------------------------------------------------
  // SessionStart
  // -----------------------------------------------------------------------

  async handleSessionStart(input: SessionStartInput): Promise<HookOutput> {
    try {
      const sm = this.createStateManager(input.agent_id);

      let state = await sm.getState();
      state = sm.applyDecay(state);
      state = sm.advanceRumination(state);
      await sm.saveState(state);

      return this.buildContextResponse(
        "SessionStart",
        state,
        input.session_id,
        input.agent_id,
      );
    } catch (err) {
      console.error("[openfeelz] handleSessionStart error:", err);
      return {};
    }
  }

  // -----------------------------------------------------------------------
  // UserPromptSubmit
  // -----------------------------------------------------------------------

  async handleUserPrompt(input: UserPromptInput): Promise<HookOutput> {
    try {
      const sm = this.createStateManager(input.agent_id);

      let state = await sm.getState();

      // Increment turn count for turn-based decay
      if (this.config.decayPreset === "turn") {
        state = { ...state, turnCount: state.turnCount + 1 };
      }

      state = sm.applyDecay(state);
      state = sm.advanceRumination(state);

      // Get or create style tracker for this session
      const sessionId = input.session_id ?? "unknown";
      const tracker = state.userStyles[sessionId]
        ? { ...state.userStyles[sessionId], messagesSinceLastProfile: state.userStyles[sessionId].messagesSinceLastProfile + 1 }
        : { ...createDefaultTracker(), messagesSinceLastProfile: 1 };

      // Synchronous user classification
      if (
        this.config.syncUserClassification &&
        this.config.userEmotions &&
        input.user_message
      ) {
        // Pass style profile if mature
        const isMature = tracker.profile.sampleSize >= this.styleConfig.profileMaturityThreshold;
        const styleOptions = isMature
          ? { style: tracker.profile, maturityThreshold: this.styleConfig.profileMaturityThreshold }
          : undefined;

        const result = await this.safeClassify(input.user_message, "user", styleOptions);
        if (result) {
          state = sm.updateUserEmotion(state, sessionId, result);

          // Attach source excerpt to the latest stimulus
          const excerpt = buildExcerpt(input.user_message, this.styleConfig.excerptTokenLimit);
          const userBucket = state.users[sessionId];
          if (userBucket?.latest) {
            state = {
              ...state,
              users: {
                ...state.users,
                [sessionId]: {
                  ...userBucket,
                  latest: { ...userBucket.latest, sourceExcerpt: excerpt },
                  history: userBucket.history.map((s, i) =>
                    i === 0 ? { ...s, sourceExcerpt: excerpt } : s,
                  ),
                },
              },
            };
          }

          // Update token usage aggregate
          if (result.usage) {
            state = withTokenUsage(state, result.usage);
          }
        }
      }

      // Save updated tracker
      state = {
        ...state,
        userStyles: {
          ...state.userStyles,
          [sessionId]: tracker,
        },
      };

      await sm.saveState(state);

      return this.buildContextResponse(
        "UserPromptSubmit",
        state,
        sessionId,
        input.agent_id,
      );
    } catch (err) {
      console.error("[openfeelz] handleUserPrompt error:", err);
      return {};
    }
  }

  // -----------------------------------------------------------------------
  // Stop
  // -----------------------------------------------------------------------

  async handleStop(input: StopInput): Promise<HookOutput> {
    try {
      const sm = this.createStateManager(input.agent_id);

      let state = await sm.getState();
      const sessionId = input.session_id ?? "unknown";

      // Classify assistant message
      if (this.config.agentEmotions && input.last_assistant_message) {
        const result = await this.safeClassify(
          input.last_assistant_message,
          "agent",
        );
        if (result) {
          const agentId = input.agent_id ?? "main";
          state = sm.updateAgentEmotion(state, agentId, result);
          state = sm.applyStimulus(
            state,
            result.label,
            result.intensity,
            result.reason,
          );

          // Update token usage for agent classification
          if (result.usage) {
            state = withTokenUsage(state, result.usage);
          }
        }
      }

      // Async user classification from transcript
      if (
        this.config.userEmotions &&
        !this.config.syncUserClassification &&
        input.transcript_path
      ) {
        const lastUserMsg = readLastUserMessage(input.transcript_path);
        if (lastUserMsg) {
          // Get or create tracker for style injection
          const tracker = state.userStyles[sessionId]
            ? { ...state.userStyles[sessionId] }
            : createDefaultTracker();

          const isMature = tracker.profile.sampleSize >= this.styleConfig.profileMaturityThreshold;
          const styleOptions = isMature
            ? { style: tracker.profile, maturityThreshold: this.styleConfig.profileMaturityThreshold }
            : undefined;

          const result = await this.safeClassify(lastUserMsg, "user", styleOptions);
          if (result) {
            state = sm.updateUserEmotion(state, sessionId, result);

            // Attach source excerpt
            const excerpt = buildExcerpt(lastUserMsg, this.styleConfig.excerptTokenLimit);
            const userBucket = state.users[sessionId];
            if (userBucket?.latest) {
              state = {
                ...state,
                users: {
                  ...state.users,
                  [sessionId]: {
                    ...userBucket,
                    latest: { ...userBucket.latest, sourceExcerpt: excerpt },
                    history: userBucket.history.map((s, i) =>
                      i === 0 ? { ...s, sourceExcerpt: excerpt } : s,
                    ),
                  },
                },
              };
            }

            // Update token usage for user classification
            if (result.usage) {
              state = withTokenUsage(state, result.usage);
            }
          }
        }
      }

      // Check if profiling should trigger
      const tracker = state.userStyles[sessionId];
      if (tracker && tracker.messagesSinceLastProfile >= this.styleConfig.profilingInterval) {
        const userHistory = state.users[sessionId]?.history ?? [];
        try {
          const { profile, usage } = await runProfiling(
            userHistory,
            tracker.profile,
            this.styleConfig,
            this.config.model,
          );
          state = {
            ...state,
            userStyles: {
              ...state.userStyles,
              [sessionId]: {
                ...tracker,
                profile,
                messagesSinceLastProfile: 0,
              },
            },
          };
          if (usage) {
            state = withTokenUsage(state, usage);
          }
        } catch (err) {
          console.error("[openfeelz] Style profiling failed:", err);
        }
      }

      await sm.saveState(state);

      return {};
    } catch (err) {
      console.error("[openfeelz] handleStop error:", err);
      return {};
    }
  }
}
