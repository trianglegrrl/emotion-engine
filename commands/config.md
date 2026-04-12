---
name: config
description: View or change OpenFeelz plugin configuration
allowed-tools: Bash, Read, Write
---

Help the user view or modify OpenFeelz plugin configuration.

**View current config:**
Read the current plugin options from environment variables or explain the current settings:
- Model: Classification model (default: claude-haiku-4-5-20251001)
- Decay Preset: slow, fast, or turn
- Agent Emotions: Whether the agent has its own emotional model (default: true)
- User Emotions: Whether to classify user emotions (default: false)
- Sync User Classification: Whether user classification is synchronous (default: false)

**Change config:**
Plugin configuration is stored in Claude Code's settings. To change a setting, the user should run:
```
/plugin configure openfeelz
```

Or manually edit their Claude Code settings to update the `pluginConfigs.openfeelz.options` section.

Explain what each option does and its impact:
- **model**: Smaller models (haiku) are faster/cheaper. Larger models may classify more accurately.
- **decayPreset**: "slow" for human-like persistence, "fast" for quick resets, "turn" for per-conversation decay.
- **agentEmotions**: When off, no emotional state is tracked or injected. Saves classification API calls.
- **userEmotions**: When on, classifies user messages and shows their emotional state in context.
- **syncUserClassification**: When on + userEmotions on, adds ~1s latency per turn but user emotion is current. When off, user emotion is one turn behind.
