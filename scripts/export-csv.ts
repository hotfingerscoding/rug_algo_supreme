#!/usr/bin/env node
/**
 * CSV Export Script for Rugs Research
 * Exports SQLite data to CSV files
 */

import { SQLiteHelper, config } from '@rugs-research/shared';
import * as fs from 'fs';
import * as path from 'path';

async function exportToCSV(): Promise<void> {
  const db = new SQLiteHelper(config.get('DB_PATH'));
  const exportsDir = './data/exports';
  
  // Ensure exports directory exists
  if (!fs.existsSync(exportsDir)) {
    fs.mkdirSync(exportsDir, { recursive: true });
  }

  try {
    console.log('Starting CSV export...');

    // Export rounds
    const rounds = db.getRounds();
    if (rounds.length > 0) {
      const roundsCsv = convertToCSV(rounds);
      fs.writeFileSync(path.join(exportsDir, 'rounds.csv'), roundsCsv);
      console.log(`✓ Exported ${rounds.length} rounds to data/exports/rounds.csv`);
    } else {
      console.log('⚠ No rounds data to export');
    }

    // Export ticks (now includes source column)
    const ticks = db.getTicks();
    if (ticks.length > 0) {
      const ticksCsv = convertToCSV(ticks);
      fs.writeFileSync(path.join(exportsDir, 'ticks.csv'), ticksCsv);
      console.log(`✓ Exported ${ticks.length} ticks to data/exports/ticks.csv`);
    } else {
      console.log('⚠ No ticks data to export');
    }

    // Export WebSocket frames
    const wsFrames = db.getWSFrames();
    if (wsFrames.length > 0) {
      const wsCsv = convertToCSV(wsFrames);
      fs.writeFileSync(path.join(exportsDir, 'ws_frames.csv'), wsCsv);
      console.log(`✓ Exported ${wsFrames.length} WebSocket frames to data/exports/ws_frames.csv`);
    } else {
      console.log('⚠ No WebSocket frames to export');
    }

    // Export events (new table)
    const events = db.getEvents();
    if (events.length > 0) {
      const eventsCsv = convertToCSV(events);
      fs.writeFileSync(path.join(exportsDir, 'events.csv'), eventsCsv);
      console.log(`✓ Exported ${events.length} events to data/exports/events.csv`);
    } else {
      console.log('⚠ No events data to export');
    }

    // Export sidebet windows (new table)
    const sidebetWindows = db.getSidebetWindows();
    if (sidebetWindows.length > 0) {
      const sidebetWindowsCsv = convertToCSV(sidebetWindows);
      fs.writeFileSync(path.join(exportsDir, 'sidebet_windows.csv'), sidebetWindowsCsv);
      console.log(`✓ Exported ${sidebetWindows.length} sidebet windows to data/exports/sidebet_windows.csv`);
    } else {
      console.log('⚠ No sidebet windows data to export');
    }

    // Create metadata file
    const metadata = {
      export_timestamp: new Date().toISOString(),
      rounds_count: rounds.length,
      ticks_count: ticks.length,
      ws_frames_count: wsFrames.length,
      events_count: events.length,
      sidebet_windows_count: sidebetWindows.length,
      database_path: config.get('DB_PATH'),
      schema_version: '004' // Current schema version with sidebet_windows
    };

    fs.writeFileSync(
      path.join(exportsDir, 'export_metadata.json'), 
      JSON.stringify(metadata, null, 2)
    );

    console.log('✓ Export completed successfully');
    console.log(`📁 Exports saved to: ${path.resolve(exportsDir)}`);

  } catch (error) {
    console.error('❌ Export failed:', error);
    throw error;
  } finally {
    db.close();
  }
}

function convertToCSV(data: any[]): string {
  if (data.length === 0) return '';
  
  const headers = Object.keys(data[0]);
  const csvRows = [headers.join(',')];
  
  for (const row of data) {
    const values = headers.map(header => {
      const value = row[header];
      if (value === null || value === undefined) {
        return '';
      }
      // Escape commas and quotes in string values
      const stringValue = String(value);
      if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
        return `"${stringValue.replace(/"/g, '""')}"`;
      }
      return stringValue;
    });
    csvRows.push(values.join(','));
  }
  
  return csvRows.join('\n');
}

// Run export if called directly
if (require.main === module) {
  exportToCSV().catch(error => {
    console.error('Export failed:', error);
    process.exit(1);
  });
}
