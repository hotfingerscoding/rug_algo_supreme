# Drift Warning Examples

This document shows example log outputs when drift warnings occur in the collector.

## Example Log Output When Drift Occurs

```
[2024-01-15T10:30:00.123Z] [INFO] Starting Rugs Collector...
[2024-01-15T10:30:00.456Z] [INFO] Navigated to https://rugs.fun
[2024-01-15T10:30:00.789Z] [INFO] Validating selectors on startup...
[2024-01-15T10:30:01.012Z] [WARN] Selector validation failed on startup:
[2024-01-15T10:30:01.013Z] [WARN] ⚠️  [DRIFT] Selector 'multiplier' not configured (still using placeholder)
[2024-01-15T10:30:01.014Z] [WARN] ⚠️  [DRIFT] Selector 'timer' not found on page: .old-timer-selector
[2024-01-15T10:30:01.015Z] [WARN] ⚠️  [DRIFT] Selector 'players' found but not visible: .hidden-players
[2024-01-15T10:30:01.016Z] [WARN] Collector will continue running but may not collect data properly
[2024-01-15T10:30:01.017Z] [INFO] Started new round { started_at: 1705312201123, x: null }
[2024-01-15T10:30:02.123Z] [WARN] ⚠️  [DRIFT] Selector 'multiplier' missing for 10 consecutive polls
[2024-01-15T10:30:02.124Z] [WARN] ⚠️  [DRIFT] Selector 'timer' missing for 10 consecutive polls
[2024-01-15T10:30:02.125Z] [INFO] Ended round { id: 1, duration: 1s, max_x: null, rug_x: null }
[2024-01-15T10:30:05.678Z] [WARN] ⚠️  [DRIFT] Selector 'players' missing for 10 consecutive polls
[2024-01-15T10:30:10.234Z] [INFO] Received SIGINT, shutting down gracefully...
[2024-01-15T10:30:10.235Z] [WARN] Final drift status: { multiplier: 15, timer: 12, players: 8 }
[2024-01-15T10:30:10.236Z] [INFO] Collector stopped and cleaned up
```

## Types of Drift Warnings

### 1. Startup Validation Warnings
```
[DRIFT] Selector 'multiplier' not configured (still using placeholder)
[DRIFT] Selector 'timer' not found on page: .old-timer-selector
[DRIFT] Selector 'players' found but not visible: .hidden-players
[DRIFT] Error checking selector 'totalWager': Invalid selector syntax
```

### 2. Runtime Drift Warnings
```
[DRIFT] Selector 'multiplier' missing for 10 consecutive polls
[DRIFT] Selector 'timer' missing for 10 consecutive polls
[DRIFT] Selector 'players' missing for 10 consecutive polls
```

### 3. Final Drift Status
```
Final drift status: { multiplier: 15, timer: 12, players: 8 }
```

## How to Interpret Drift Warnings

### Startup Warnings
- **Not configured**: Selector still has placeholder value `TODO_UPDATE_SELECTOR`
- **Not found**: Selector exists but doesn't match any elements on the page
- **Not visible**: Selector matches an element but it's hidden or not visible
- **Error**: Invalid selector syntax or other error during validation

### Runtime Warnings
- **Missing for N polls**: Selector hasn't been found for N consecutive polling cycles
- **Threshold**: Default is 10 polls (configurable via `DRIFT_THRESHOLD`)
- **Reset**: Counter resets when selector is found again

### Final Status
- **Counts**: Shows how many consecutive polls each selector has been missing
- **Actionable**: Use this to identify which selectors need immediate attention

## Configuration

### Environment Variables
```bash
# Number of consecutive misses before warning (default: 10)
DRIFT_THRESHOLD=10

# Log file path (default: ./logs/collector.log)
LOG_PATH=./logs/collector.log

# Log level (default: info)
LOG_LEVEL=info
```

### Selector Configuration
```typescript
// In apps/collector/src/config/selectors.ts
export const selectors = {
  multiplier: 'TODO_UPDATE_SELECTOR', // Will trigger startup warning
  timer: '.old-selector', // Will trigger runtime warning if not found
  players: '.hidden-element', // Will trigger visibility warning
  // ... etc
};
```

## Troubleshooting Drift Warnings

### 1. Check Current Selectors
```bash
# View current selector configuration
cat apps/collector/src/config/selectors.ts
```

### 2. Inspect the Site
```bash
# Run collector in visible mode to debug
HEADLESS=false pnpm --filter collector start
```

### 3. Monitor Logs
```bash
# Watch for drift warnings in real-time
tail -f logs/collector.log | grep DRIFT

# Check all drift warnings
grep "DRIFT" logs/collector.log
```

### 4. Update Selectors
1. Open Developer Tools (F12)
2. Inspect the problematic element
3. Copy the correct selector
4. Update `apps/collector/src/config/selectors.ts`
5. Restart the collector

### 5. Test Selectors
```bash
# Test selector validation
cd apps/collector
pnpm build
node dist/index.js
```

## Best Practices

1. **Update selectors promptly** when drift warnings appear
2. **Use stable selectors** like data attributes when available
3. **Test selectors** before deploying to production
4. **Monitor logs regularly** for drift patterns
5. **Keep backups** of working selector configurations
6. **Document changes** when updating selectors

## Expected Behavior

- **Collector continues running** even with drift warnings
- **Data collection may be incomplete** when selectors fail
- **Warnings are logged** to both console and file
- **No crashes** due to selector failures
- **Graceful degradation** of functionality
