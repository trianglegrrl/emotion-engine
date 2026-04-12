---
name: style
description: View or adjust your communication style profile
allowed-tools: Bash
---

OpenFeelz builds a profile of your communication style over time to calibrate emotion classification. This profile is non-judgmental — it just helps the classifier understand HOW you communicate.

**View your profile:**
```bash
node $CLAUDE_PLUGIN_ROOT/dist/src/helpers/state-helper.js get-style
```

Display the profile with bar visualizations and human-readable descriptions:
- Hyperbole tendency (0-1): how much you exaggerate for effect
- Casual profanity (0-1): whether swearing signals anger or is just vocabulary
- Emotional expressiveness (0-1): how dramatic your communication is
- Sarcasm frequency (0-1): how often you say the opposite of what you mean

Show sample size and last updated date.

**Set a dimension** (e.g., "set hyperbole 0.9"):
Map short names to full dimension names:
- hyperbole → hyperboleTendency
- profanity → casualProfanity
- expressiveness → emotionalExpressiveness
- sarcasm → sarcasmFrequency

```bash
node $CLAUDE_PLUGIN_ROOT/dist/src/helpers/state-helper.js set-style --dimension <fullName> --value <0-1>
```

Confirm the change and note that this dimension is now protected from automatic updates.

**Reset profile:**
```bash
node $CLAUDE_PLUGIN_ROOT/dist/src/helpers/state-helper.js reset-style
```

Confirm the reset.
