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
import { formatEmotionBlock, type FormatOptions } from "../format/prompt-formatter.js";
import type { ClassificationResult, EmotionEngineState } from "../types.js";

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
// HookRunner
// ---------------------------------------------------------------------------

export class HookRunner {
  private readonly config: ResolvedConfig;

  constructor(config?: ResolvedConfig) {
    this.config = config ?? resolveConfig();
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
  ): Promise<ClassificationResult | undefined> {
    try {
      return await classifyEmotion(text, {
        model: this.config.model,
        role,
        emotionLabels: this.config.emotionLabels,
        confidenceMin: this.config.confidenceMin,
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

      // Synchronous user classification
      if (
        this.config.syncUserClassification &&
        this.config.userEmotions &&
        input.user_message
      ) {
        const result = await this.safeClassify(input.user_message, "user");
        if (result) {
          state = sm.updateUserEmotion(state, input.session_id, result);
        }
      }

      await sm.saveState(state);

      return this.buildContextResponse(
        "UserPromptSubmit",
        state,
        input.session_id,
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
          const result = await this.safeClassify(lastUserMsg, "user");
          if (result) {
            state = sm.updateUserEmotion(state, input.session_id, result);
          }
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
