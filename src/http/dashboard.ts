/**
 * HTTP dashboard for the emotion engine.
 *
 * Serves a self-contained HTML page with glassmorphism UI showing:
 * - PAD dimensions as bars
 * - Basic emotions as bars
 * - OCEAN personality profile
 * - Recent stimuli
 * - Rumination status
 *
 * Registered via api.registerHttpRoute().
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import type { EmotionEngineState } from "../types.js";
import { DIMENSION_NAMES, BASIC_EMOTION_NAMES, OCEAN_TRAITS } from "../types.js";
import { computePrimaryEmotion, computeOverallIntensity } from "../model/emotion-model.js";
import type { StateManager } from "../state/state-manager.js";

/**
 * Create the HTTP route handler for the dashboard.
 */
export function createDashboardHandler(
  manager: StateManager,
): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
  return async (req, res) => {
    let state = await manager.getState();
    state = manager.applyDecay(state);

    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

    if (url.searchParams.get("format") === "json") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({
        dimensions: state.dimensions,
        basicEmotions: state.basicEmotions,
        personality: state.personality,
        primaryEmotion: computePrimaryEmotion(state.basicEmotions),
        overallIntensity: computeOverallIntensity(state.basicEmotions),
        recentStimuli: state.recentStimuli.slice(0, 10),
        rumination: state.rumination,
        baseline: state.baseline,
        meta: state.meta,
      }, null, 2));
      return;
    }

    const html = buildDashboardHtml(state);
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(html);
  };
}

/**
 * Build the complete dashboard HTML.
 */
export function buildDashboardHtml(state: EmotionEngineState): string {
  const primary = computePrimaryEmotion(state.basicEmotions);
  const intensity = computeOverallIntensity(state.basicEmotions);

  const dimensionBars = DIMENSION_NAMES.map((name) => {
    const val = state.dimensions[name];
    const base = state.baseline[name];
    const isBipolar = name === "pleasure" || name === "arousal" || name === "dominance";
    const pct = isBipolar ? ((val + 1) / 2) * 100 : val * 100;
    const basePct = isBipolar ? ((base + 1) / 2) * 100 : base * 100;
    return `<div class="bar-row">
      <span class="bar-label">${name}</span>
      <div class="bar-track${isBipolar ? " bipolar" : ""}">
        <div class="bar-baseline" style="left:${basePct}%"></div>
        <div class="bar-fill" style="width:${pct}%"></div>
      </div>
      <span class="bar-value">${val.toFixed(2)}</span>
    </div>`;
  }).join("\n");

  const emotionBars = BASIC_EMOTION_NAMES.map((name) => {
    const val = state.basicEmotions[name];
    return `<div class="bar-row">
      <span class="bar-label">${name}</span>
      <div class="bar-track">
        <div class="bar-fill emotion-${name}" style="width:${val * 100}%"></div>
      </div>
      <span class="bar-value">${val.toFixed(2)}</span>
    </div>`;
  }).join("\n");

  const personalityBars = OCEAN_TRAITS.map((trait) => {
    const val = state.personality[trait];
    return `<div class="bar-row">
      <span class="bar-label">${trait}</span>
      <div class="bar-track">
        <div class="bar-fill personality" style="width:${val * 100}%"></div>
      </div>
      <span class="bar-value">${val.toFixed(2)}</span>
    </div>`;
  }).join("\n");

  const recentHtml = state.recentStimuli.slice(0, 8).map((s) => {
    const ts = new Date(s.timestamp).toLocaleString();
    return `<div class="stimulus-entry">
      <span class="stimulus-time">${ts}</span>
      <span class="stimulus-label">${s.label}</span>
      <span class="stimulus-intensity">${s.intensity.toFixed(2)}</span>
      <span class="stimulus-trigger">${escapeHtml(s.trigger)}</span>
    </div>`;
  }).join("\n");

  const ruminationHtml = state.rumination.active.length > 0
    ? state.rumination.active.map((r) =>
        `<div class="rumination-entry">${r.label} (stage ${r.stage}, intensity ${r.intensity.toFixed(2)})</div>`,
      ).join("\n")
    : "<div class='muted'>No active rumination.</div>";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Emotion Engine Dashboard</title>
<style>
:root {
  --bg: #0a0a0f;
  --card-bg: rgba(255,255,255,0.04);
  --card-border: rgba(255,255,255,0.08);
  --text: #e0e0e8;
  --text-muted: #888;
  --accent: #6e7bf2;
  --positive: #4caf50;
  --negative: #ef5350;
  --bar-bg: rgba(255,255,255,0.06);
  --bar-fill: var(--accent);
}
* { margin:0; padding:0; box-sizing:border-box; }
body { font-family: -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; background:var(--bg); color:var(--text); padding:24px; min-height:100vh; }
h1 { font-size:1.5rem; font-weight:600; margin-bottom:8px; }
h2 { font-size:1rem; font-weight:500; margin-bottom:12px; color:var(--accent); text-transform:uppercase; letter-spacing:0.05em; }
.grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(320px,1fr)); gap:16px; margin-top:16px; }
.card { background:var(--card-bg); border:1px solid var(--card-border); border-radius:12px; padding:20px; backdrop-filter:blur(12px); }
.primary-emotion { font-size:1.1rem; color:var(--accent); margin-bottom:4px; }
.muted { color:var(--text-muted); font-size:0.85rem; }
.bar-row { display:flex; align-items:center; gap:8px; margin-bottom:6px; }
.bar-label { width:100px; font-size:0.8rem; text-align:right; color:var(--text-muted); }
.bar-track { flex:1; height:8px; background:var(--bar-bg); border-radius:4px; position:relative; overflow:hidden; }
.bar-track.bipolar .bar-fill { background:linear-gradient(90deg,var(--negative),var(--bar-bg) 50%,var(--positive)); }
.bar-fill { height:100%; border-radius:4px; background:var(--bar-fill); transition:width 0.3s ease; }
.bar-baseline { position:absolute; top:0; bottom:0; width:2px; background:rgba(255,255,255,0.3); z-index:1; }
.bar-value { width:40px; font-size:0.75rem; font-family:monospace; }
.emotion-happiness .bar-fill, .bar-fill.emotion-happiness { background:#66bb6a; }
.emotion-sadness .bar-fill, .bar-fill.emotion-sadness { background:#42a5f5; }
.emotion-anger .bar-fill, .bar-fill.emotion-anger { background:#ef5350; }
.emotion-fear .bar-fill, .bar-fill.emotion-fear { background:#ab47bc; }
.emotion-disgust .bar-fill, .bar-fill.emotion-disgust { background:#8d6e63; }
.emotion-surprise .bar-fill, .bar-fill.emotion-surprise { background:#ffa726; }
.bar-fill.personality { background:#7e57c2; }
.stimulus-entry { display:flex; gap:8px; font-size:0.8rem; padding:4px 0; border-bottom:1px solid var(--card-border); }
.stimulus-time { color:var(--text-muted); width:140px; flex-shrink:0; }
.stimulus-label { color:var(--accent); width:80px; }
.stimulus-intensity { width:40px; font-family:monospace; }
.stimulus-trigger { color:var(--text-muted); flex:1; }
.rumination-entry { font-size:0.85rem; padding:4px 0; }
.meta { margin-top:16px; font-size:0.75rem; color:var(--text-muted); text-align:center; }
</style>
</head>
<body>
<h1>Emotion Engine Dashboard</h1>
<div class="primary-emotion">Primary: ${primary} (intensity: ${intensity.toFixed(2)})</div>
<div class="muted">Last updated: ${new Date(state.lastUpdated).toLocaleString()} | Updates: ${state.meta.totalUpdates}</div>

<div class="grid">
  <div class="card">
    <h2>Dimensions (PAD + Extensions)</h2>
    ${dimensionBars}
  </div>

  <div class="card">
    <h2>Basic Emotions (Ekman)</h2>
    ${emotionBars}
  </div>

  <div class="card">
    <h2>Personality (OCEAN)</h2>
    ${personalityBars}
  </div>

  <div class="card">
    <h2>Recent Stimuli</h2>
    ${recentHtml || '<div class="muted">No recent stimuli.</div>'}
  </div>

  <div class="card">
    <h2>Rumination</h2>
    ${ruminationHtml}
  </div>
</div>

<div class="meta">
  <a href="?format=json" style="color:var(--accent)">View as JSON</a> |
  Emotion Engine v0.1.0
</div>

<script>setTimeout(()=>location.reload(), 30000);</script>
</body>
</html>`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
