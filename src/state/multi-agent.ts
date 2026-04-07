/**
 * Multi-agent emotional awareness.
 *
 * Scans the agents/ subdirectory under the data dir for peer agent
 * state files and returns their latest emotional stimuli.
 */

import fs from "node:fs";
import path from "node:path";
import type { EmotionStimulus } from "../types.js";
import { readStateFile } from "./state-file.js";

export interface OtherAgentEmotion {
  id: string;
  latest: EmotionStimulus;
}

/**
 * Load emotional states from other agents by scanning `dataDir/agents/*.json`.
 *
 * @param dataDir - Root data directory (e.g. OPENFEELZ_DATA_DIR)
 * @param currentAgentId - ID of the current agent (to exclude from results)
 * @param maxAgents - Maximum number of other agents to return
 */
export async function loadOtherAgentStates(
  dataDir: string,
  currentAgentId: string,
  maxAgents: number,
): Promise<OtherAgentEmotion[]> {
  const agentsDir = path.join(dataDir, "agents");
  if (!fs.existsSync(agentsDir)) return [];

  const files = fs.readdirSync(agentsDir).filter((f) => f.endsWith(".json"));
  const results: OtherAgentEmotion[] = [];

  for (const file of files) {
    const agentId = path.basename(file, ".json");
    if (agentId === currentAgentId) continue;
    if (results.length >= maxAgents) break;

    try {
      const state = await readStateFile(path.join(agentsDir, file));
      const agentBucket = state.agents[agentId];
      if (agentBucket?.latest) {
        results.push({ id: agentId, latest: agentBucket.latest });
      }
    } catch {
      // Skip corrupt state files
    }
  }

  return results;
}
