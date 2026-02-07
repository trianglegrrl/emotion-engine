/**
 * MCP (Model Context Protocol) server for the emotion engine.
 *
 * Exposes emotion state as MCP resources and tools so external clients
 * (Cursor, Claude Desktop, etc.) can query and modify the agent's
 * emotional state.
 *
 * This module exports the server configuration; the actual MCP SDK
 * transport setup is done in the standalone entry point.
 */

import type { DimensionName, OCEANTrait } from "../types.js";
import { DIMENSION_NAMES, OCEAN_TRAITS } from "../types.js";
import {
  computePrimaryEmotion,
  computeOverallIntensity,
} from "../model/emotion-model.js";
import type { StateManager } from "../state/state-manager.js";

// ---------------------------------------------------------------------------
// Types for our MCP abstraction (decoupled from SDK for testability)
// ---------------------------------------------------------------------------

interface McpTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (params: Record<string, unknown>) => Promise<{ content: string }>;
}

interface McpResource {
  uri: string;
  name: string;
  description: string;
  mimeType: string;
  read: () => Promise<string>;
}

interface McpServerConfig {
  name: string;
  version: string;
  tools: McpTool[];
  resources: McpResource[];
}

// ---------------------------------------------------------------------------
// Server Factory
// ---------------------------------------------------------------------------

/**
 * Create the MCP server configuration for the emotion engine.
 */
export function createEmotionMcpServer(manager: StateManager): McpServerConfig {
  return {
    name: "emotion-engine",
    version: "0.1.0",
    tools: [
      createQueryTool(manager),
      createModifyTool(manager),
      createSetPersonalityTool(manager),
    ],
    resources: [
      createStateResource(manager),
      createPersonalityResource(manager),
    ],
  };
}

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

function createQueryTool(manager: StateManager): McpTool {
  return {
    name: "query_emotion",
    description: "Query the current emotional state of the agent",
    inputSchema: {
      type: "object",
      properties: {
        format: {
          type: "string",
          enum: ["full", "summary", "dimensions", "emotions"],
          description: "Output format",
        },
      },
    },
    async handler(params) {
      let state = await manager.getState();
      state = manager.applyDecay(state);
      await manager.saveState(state);

      const data = {
        dimensions: state.dimensions,
        basicEmotions: state.basicEmotions,
        primaryEmotion: computePrimaryEmotion(state.basicEmotions),
        overallIntensity: computeOverallIntensity(state.basicEmotions),
        personality: state.personality,
        ruminationActive: state.rumination.active.length,
        totalUpdates: state.meta.totalUpdates,
      };

      return { content: JSON.stringify(data, null, 2) };
    },
  };
}

function createModifyTool(manager: StateManager): McpTool {
  return {
    name: "modify_emotion",
    description: "Apply an emotional stimulus to the agent",
    inputSchema: {
      type: "object",
      properties: {
        emotion: { type: "string", description: "Emotion label (e.g. happy, angry, curious)" },
        intensity: { type: "number", description: "Intensity 0-1" },
        trigger: { type: "string", description: "What caused this emotion" },
      },
      required: ["emotion"],
    },
    async handler(params) {
      const emotion = params.emotion as string;
      const intensity = (params.intensity as number) ?? 0.5;
      const trigger = (params.trigger as string) ?? "external stimulus";

      let state = await manager.getState();
      state = manager.applyDecay(state);
      state = manager.applyStimulus(state, emotion, intensity, trigger);
      await manager.saveState(state);

      return {
        content: JSON.stringify({
          applied: true,
          emotion,
          intensity,
          dimensions: state.dimensions,
          primaryEmotion: computePrimaryEmotion(state.basicEmotions),
        }, null, 2),
      };
    },
  };
}

function createSetPersonalityTool(manager: StateManager): McpTool {
  return {
    name: "set_personality",
    description: "Set an OCEAN personality trait",
    inputSchema: {
      type: "object",
      properties: {
        trait: {
          type: "string",
          enum: [...OCEAN_TRAITS],
          description: "OCEAN trait name",
        },
        value: { type: "number", description: "Trait value 0-1" },
      },
      required: ["trait", "value"],
    },
    async handler(params) {
      const trait = params.trait as OCEANTrait;
      const value = params.value as number;

      if (!OCEAN_TRAITS.includes(trait)) {
        throw new Error(`Unknown trait: ${trait}`);
      }

      let state = await manager.getState();
      state = manager.setPersonalityTrait(state, trait, value);
      await manager.saveState(state);

      return {
        content: JSON.stringify({
          personality: state.personality,
          newBaseline: state.baseline,
        }, null, 2),
      };
    },
  };
}

// ---------------------------------------------------------------------------
// Resources
// ---------------------------------------------------------------------------

function createStateResource(manager: StateManager): McpResource {
  return {
    uri: "emotion://state",
    name: "Emotional State",
    description: "Current emotional state including dimensions, basic emotions, and rumination",
    mimeType: "application/json",
    async read() {
      let state = await manager.getState();
      state = manager.applyDecay(state);
      return JSON.stringify({
        dimensions: state.dimensions,
        basicEmotions: state.basicEmotions,
        primaryEmotion: computePrimaryEmotion(state.basicEmotions),
        overallIntensity: computeOverallIntensity(state.basicEmotions),
        rumination: state.rumination,
        baseline: state.baseline,
        lastUpdated: state.lastUpdated,
      }, null, 2);
    },
  };
}

function createPersonalityResource(manager: StateManager): McpResource {
  return {
    uri: "emotion://personality",
    name: "Personality Profile",
    description: "OCEAN personality profile and its influence on emotional baselines",
    mimeType: "application/json",
    async read() {
      const state = await manager.getState();
      return JSON.stringify(state.personality, null, 2);
    },
  };
}
