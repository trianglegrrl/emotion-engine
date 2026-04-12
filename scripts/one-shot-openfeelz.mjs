import fs from 'node:fs';

const statePath = process.env.OPENFEELZ_STATE || '/home/a/.openclaw/workspace/openfeelz.json';
const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));

const { classifyEmotion } = await import('../dist/src/classify/claude-classify.js');

const labels = [
  'neutral',
  'calm',
  'relieved',
  'curious',
  'excited',
  'frustrated',
  'anxious',
  'sad',
  'angry',
];

const text = process.argv.slice(2).join(' ') || 'I fixed the bug and everything works now. Phew.';

console.log('Using state:', statePath);
console.log('Text:', text);

const style = state?.userStyleProfile;

const res = await classifyEmotion(text, {
  role: 'user',
  emotionLabels: labels,
  confidenceMin: 0.2,
  model: process.env.CLAUDE_MODEL || 'haiku',
  timeoutMs: 30_000,
  style,
  maturityThreshold: 10,
});

console.log('Classification result:', res);
