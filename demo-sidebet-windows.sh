#!/bin/bash
# Demo script for Sidebet Windows functionality

echo "🎯 Sidebet Windows Demo"
echo "======================="

echo ""
echo "1. Database Schema:"
echo "   Table: sidebet_windows"
echo "   - id: INTEGER PRIMARY KEY"
echo "   - round_id: INTEGER (foreign key to rounds)"
echo "   - window_idx: INTEGER (0, 1, 2, ...)"
echo "   - start_s: REAL (start time in seconds)"
echo "   - end_s: REAL (end time in seconds)"
echo "   - rug_in_window: INTEGER (0/1 boolean)"
echo ""

echo "2. Example INSERT:"
echo "   INSERT INTO sidebet_windows (round_id, window_idx, start_s, end_s, rug_in_window)"
echo "   VALUES (123, 0, 0.0, 10.0, 0),"
echo "          (123, 1, 10.0, 20.0, 1),"
echo "          (123, 2, 20.0, 30.0, 0);"
echo ""

echo "3. Window Generation Logic:"
echo "   - Windows start at 0 when round goes live"
echo "   - Every 10 seconds: window_idx += 1"
echo "   - rug_in_window = 1 if rug_time_s >= start_s && rug_time_s < end_s"
echo ""

echo "4. Training Integration:"
echo "   - train.py loads sidebet_windows table"
echo "   - Uses window-aligned labels when available"
echo "   - Falls back to traditional sliding-window method"
echo "   - Logs: 'Using sidebet windows for labels (X windows available)'"
echo ""

echo "5. Export Integration:"
echo "   - scripts/export-csv.ts includes sidebet_windows.csv"
echo "   - Metadata shows sidebet_windows_count"
echo "   - Schema version updated to 004"
echo ""

echo "6. Crash Resilience:"
echo "   - Collector detects unfinished rounds on startup"
echo "   - Auto-closes with [RESUME] logging"
echo "   - Meta pointers: last_ws_ts, last_tick_ts, last_round_id"
echo ""

echo "🚀 Sidebet windows provide precise, site-aligned labels for training!"
