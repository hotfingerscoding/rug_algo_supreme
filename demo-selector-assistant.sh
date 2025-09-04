#!/bin/bash
# Demo script for the Selector Discovery Assistant

echo "🎯 Selector Discovery Assistant Demo"
echo "===================================="

echo ""
echo "1. Starting the Assistant:"
echo "   Command: pnpm selector:start"
echo "   Opens headful Chromium browser with rugs.fun"
echo ""

echo "2. Workflow:"
echo "   🔍 Hover over elements to highlight them"
echo "   🖱️  Click on target elements (multiplier, timer, etc.)"
echo "   📝 Review generated selector candidates"
echo "   ✅ Choose best selector for each element"
echo "   🧪 Test selectors with 'Test Selectors' button"
echo "   💾 Save & Update Collector configuration"
echo ""

echo "3. Generated Files:"
echo "   📁 apps/selector-assistant/output/selectors-<timestamp>.json"
echo "   📸 apps/selector-assistant/output/screenshots/"
echo "   ⚙️  apps/collector/src/config/selectors.ts (auto-updated)"
echo ""

echo "4. Testing Selectors:"
echo "   Command: pnpm selector:test"
echo "   Runs 30-60 second validation test"
echo "   Reports success rate and stability"
echo ""

echo "5. Example Output:"
echo "   ✅ Multiplier: .multiplier-value (95% success)"
echo "   ✅ Timer: .game-timer (98% success)"
echo "   ✅ Game Status: .game-status (92% success)"
echo "   ✅ Player Count: .player-count (90% success)"
echo ""

echo "6. Selector Types Generated:"
echo "   🎯 CSS selectors with :is() fallbacks"
echo "   📝 Text-based :has-text() variants"
echo "   🔗 Attribute selectors (data-* attributes)"
echo "   📊 Scored by stability > brevity > specificity"
echo ""

echo "7. Integration:"
echo "   Selectors automatically update collector config"
echo "   Preserves existing comments and structure"
echo "   Idempotent updates (safe to run multiple times)"
echo ""

echo "🚀 Start discovering selectors with: pnpm selector:start"
