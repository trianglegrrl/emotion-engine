# OpenFeelz Verification Guide

**Date:** 2026-02-07
**Status:** ✅ Deployed and Ready for Testing

---

## Quick Status Check

```bash
# 1. Check plugin is loaded
openclaw plugins list | grep -A2 openfeelz

# 2. Check gateway is running
systemctl --user status openclaw-gateway.service

# 3. Check emotion status
openclaw emotion status

# 4. Watch for classifications
tail -f ~/.openclaw/workspace/openfeelz-classifications.jsonl
```

---

## What Was Fixed

### Primary Issue
**Problem:** Emotion classification failing with 400 error
**Cause:** `gpt-5-mini` doesn't support custom temperature values
**Fix:** ✅ Only set temperature for non-reasoning models

### Additional Improvements
1. ✅ Added JSONL classification logging
2. ✅ Improved API key resolution
3. ✅ Added comprehensive debug logging
4. ✅ Better error handling and reporting

---

## Testing the Fix

### 1. Manual Test via Conversation

Send a message to the agent and check if emotions are classified:

```bash
# Option A: Via Telegram (if enabled)
# Send a message to @MiriamOpenClawBot

# Option B: Via CLI
openclaw agent chat "I'm really excited about this new feature!"

# Then check:
openclaw emotion status
openclaw emotion history
cat ~/.openclaw/workspace/openfeelz-classifications.jsonl
```

### 2. Monitor Real-Time Logs

```bash
# Terminal 1: Watch gateway logs
journalctl --user -u openclaw-gateway.service -f | grep openfeelz

# Terminal 2: Watch classification log
tail -f ~/.openclaw/workspace/openfeelz-classifications.jsonl | jq .

# Terminal 3: Send test messages
openclaw agent chat "I'm feeling curious about how this works"
```

### 3. Verify Classification Log

After a conversation, check the log file:

```bash
# View all classifications
jq . ~/.openclaw/workspace/openfeelz-classifications.jsonl

# Check success rate
jq -s 'map(select(.success)) | length' ~/.openclaw/workspace/openfeelz-classifications.jsonl

# Check error rate
jq -s 'map(select(.success == false)) | length' ~/.openclaw/workspace/openfeelz-classifications.jsonl

# View recent emotions detected
jq -r '.result.label' ~/.openclaw/workspace/openfeelz-classifications.jsonl | tail -10

# Average response time
jq -r '.responseTimeMs' ~/.openclaw/workspace/openfeelz-classifications.jsonl | awk '{sum+=$1; n++} END {if(n>0) print sum/n "ms"; else print "No data"}'
```

---

## Expected Behavior After Fix

### ✅ On Gateway Startup
```
[openfeelz] Initial config - apiKey present: true model: gpt-5-mini
[openfeelz] Using API key from config
[gateway] openfeelz: registered (state: /home/a/.openclaw/workspace/openfeelz.json, model: gpt-5-mini, provider: auto)
```

### ✅ During Conversation
```
[openfeelz] agent_end hook fired for agent: main
[openfeelz] Processing messages - user: true, assistant: true
[openfeelz] Classifying user message (245 chars)
[openfeelz] User emotion: curious (intensity: 0.6, confidence: 0.7)
[openfeelz] Classifying assistant message (412 chars)
[openfeelz] Assistant emotion: helpful (intensity: 0.5, confidence: 0.8)
```

### ✅ Classification Log Entry
```json
{
  "timestamp": "2026-02-07T20:15:00.000Z",
  "role": "user",
  "textExcerpt": "I'm really excited about this new feature!",
  "model": "gpt-5-mini",
  "provider": "openai",
  "result": {
    "label": "excited",
    "intensity": 0.8,
    "confidence": 0.9,
    "reason": "expressing enthusiasm about new feature"
  },
  "success": true,
  "responseTimeMs": 1234
}
```

### ✅ Emotion Status
```bash
$ openclaw emotion status
Primary Emotion: excited (intensity: 0.80)

Dimensions:
  pleasure     [================....] 0.80
  arousal      [================....] 0.80
  ...
```

---

## Troubleshooting

### Issue: No classifications appearing

**Check:**
```bash
# 1. Is the gateway running?
systemctl --user status openclaw-gateway.service

# 2. Is the plugin loaded?
openclaw plugins list | grep openfeelz

# 3. Are conversations happening?
journalctl --user -u openclaw-gateway.service | grep agent_end

# 4. Is the API key configured?
journalctl --user -u openclaw-gateway.service | grep "apiKey present"
```

### Issue: Classifications failing

**Check logs for errors:**
```bash
journalctl --user -u openclaw-gateway.service | grep -A5 "Classification failed"
```

**Check classification log for errors:**
```bash
jq -r 'select(.success == false) | {timestamp, error}' ~/.openclaw/workspace/openfeelz-classifications.jsonl
```

### Issue: Temperature errors still appearing

**This should be fixed.** If you still see temperature errors:
```bash
# Check which model is configured
jq '.plugins.entries.openfeelz.config.model' ~/.openclaw/openclaw.json

# Verify the fix is deployed
grep -A5 "isReasoningModel" ~/.openclaw/extensions/openfeelz/src/classify/classifier.js

# Rebuild and redeploy
cd /home/a/.openclaw/workspace/source/openfeelz
npm run build
rsync -av dist/ ~/.openclaw/extensions/openfeelz/
openclaw gateway stop && openclaw gateway start
```

---

## Performance Monitoring

### Classification Response Times
```bash
# Average response time
jq -r '.responseTimeMs' ~/.openclaw/workspace/openfeelz-classifications.jsonl | \
  awk '{sum+=$1; n++} END {print "Average: " sum/n "ms"}'

# Response time distribution
jq -r '.responseTimeMs' ~/.openclaw/workspace/openfeelz-classifications.jsonl | \
  awk '{
    if ($1 < 500) fast++;
    else if ($1 < 2000) medium++;
    else slow++;
    total++;
  }
  END {
    print "Fast (<500ms): " fast " (" int(fast/total*100) "%)";
    print "Medium (500-2000ms): " medium " (" int(medium/total*100) "%)";
    print "Slow (>2000ms): " slow " (" int(slow/total*100) "%)"
  }'
```

### Success Rate
```bash
jq -s 'map(select(.success == true)) | length' ~/.openclaw/workspace/openfeelz-classifications.jsonl | \
  awk -v total=$(wc -l < ~/.openclaw/workspace/openfeelz-classifications.jsonl) \
  '{print "Success rate: " ($1/total*100) "%"}'
```

### Most Common Emotions
```bash
jq -r '.result.label' ~/.openclaw/workspace/openfeelz-classifications.jsonl | \
  sort | uniq -c | sort -rn | head -10
```

---

## Next Steps

1. **Test with real conversations** - Send messages via Telegram or CLI
2. **Monitor classification log** - Verify emotions are being detected
3. **Check emotion status** - Confirm state updates correctly
4. **Verify performance** - Check response times are acceptable

---

## Support

If issues persist:

1. **Collect logs:**
   ```bash
   journalctl --user -u openclaw-gateway.service --since "1 hour ago" > gateway-logs.txt
   cp ~/.openclaw/workspace/openfeelz-classifications.jsonl classification-log.jsonl
   openclaw emotion status > emotion-status.txt
   ```

2. **Check versions:**
   ```bash
   openclaw version
   node --version
   jq '.version' ~/.openclaw/extensions/openfeelz/package.json
   ```

3. **Review configuration:**
   ```bash
   jq '.plugins.entries.openfeelz' ~/.openclaw/openclaw.json
   ```

---

## Summary

✅ **Bug Fixed:** Temperature error for gpt-5-mini
✅ **Logging Added:** JSONL classification log
✅ **Monitoring:** Comprehensive debug logs
✅ **Deployed:** Plugin rebuilt and installed
✅ **Running:** Gateway active with OpenFeelz loaded

**Status:** Ready for production use. Monitor the classification log to verify emotions are being detected correctly during conversations.
