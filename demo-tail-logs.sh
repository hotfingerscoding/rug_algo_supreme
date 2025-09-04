#!/bin/bash
# Demo script for the Tail Logs functionality

echo "📋 Tail Logs Demo"
echo "=================="

echo ""
echo "1. Basic Usage:"
echo "   Command: pnpm tail:logs"
echo "   Tails both logs/collector.log and logs/alerts.log"
echo ""

echo "2. Filtered Views:"
echo "   --drift: Show only drift and warning alerts"
echo "   --error: Show only error messages"
echo "   --info: Show only info messages"
echo ""

echo "3. Example Output:"
echo "   [2024-01-15 10:30:15] [DRIFT] ⚠️  Model drift detected"
echo "   [2024-01-15 10:30:16] [INFO] ℹ️  Training job completed"
echo "   [2024-01-15 10:30:17] [ERROR] ❌  Backup job failed"
echo ""

echo "4. Real-time Monitoring:"
echo "   The script continuously monitors log files"
echo "   New entries appear automatically"
echo "   Press Ctrl+C to stop"
echo ""

echo "5. Log Sources:"
echo "   📝 logs/collector.log - Data collection logs"
echo "   🚨 logs/alerts.log - System alerts and notifications"
echo ""

echo "6. Filter Examples:"
echo "   pnpm tail:logs --drift    # Monitor drift alerts"
echo "   pnpm tail:logs --error    # Monitor errors only"
echo "   pnpm tail:logs --info     # Monitor info messages"
echo ""

echo "🔍 Start monitoring with: pnpm tail:logs"
