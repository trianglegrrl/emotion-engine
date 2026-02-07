/**
 * Multi-agent emotional awareness.
 *
 * Scans sibling agent state directories to build a picture of other
 * agents' emotional states. This is injected into the system prompt
 * so the agent can be aware of its peers' emotions.
 *
 * Pattern from emotion-state-1's loadOtherAgents().
 */

import fs from "node:fs/promises";
import path from "node:path";
import type { EmotionEngineState, EmotionStimulus } from "../types.js";
import { readStateFile } from "./state-file.js";

const STATE_FILE_NAME = "emotion-engine.json";

export interface OtherAgentEmotion {
  id: string;
  latest: EmotionStimulus;
}

/**
 * Load emotional states from other agents in the same agents directory.
 *
 * @param agentsRoot - Path to the `agents/` directory (parent of individual agent dirs)
 * @param currentAgentId - ID of the current agent (to exclude from results)
 * @param maxAgents - Maximum number of other agents to return
 */
export async function loadOtherAgentStates(
  agentsRoot: string,
  currentAgentId: string,
  maxAgents: number,
): Promise<OtherAgentEmotion[]> {
  const results: OtherAgentEmotion[] = [];

  try {
    const entries = await fs.readdir(agentsRoot, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name === currentAgentId) continue;
      if (results.length >= maxAgents) break;

      const statePath = path.join(agentsRoot, entry.name, "agent", STATE_FILE_NAME);

      try {
        const state = await readStateFile(statePath);

        // Find the agent's own emotion entry (by its ID or any agent entry)
        const agentBucket =
          state.agents[entry.name] ??
          Object.values(state.agents)[0];

        if (agentBucket?.latest) {
          results.push({ id: entry.name, latest: agentBucket.latest });
        }
      } catch {
        // Agent has no emotion state, skip
        continue;
      }
    }
  } catch {
    // agents directory doesn't exist yet
  }

  return results;
}
