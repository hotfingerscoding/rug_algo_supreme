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
    // Export rounds
    const rounds = db.getRounds();
    if (rounds.length > 0) {
      const roundsCsv = convertToCSV(rounds);
      fs.writeFileSync(path.join(exportsDir, 'rounds.csv'), roundsCsv);
      console.log(`Exported ${rounds.length} rounds to data/exports/rounds.csv`);
    }

    // Export ticks
    const ticks = db.getTicks();
    if (ticks.length > 0) {
      const ticksCsv = convertToCSV(ticks);
      fs.writeFileSync(path.join(exportsDir, 'ticks.csv'), ticksCsv);
      console.log(`Exported ${ticks.length} ticks to data/exports/ticks.csv`);
    }

    // Export WebSocket frames
    const wsFrames = db.getWSFrames();
    if (wsFrames.length > 0) {
      const wsCsv = convertToCSV(wsFrames);
      fs.writeFileSync(path.join(exportsDir, 'ws_frames.csv'), wsCsv);
      console.log(`Exported ${wsFrames.length} WebSocket frames to data/exports/ws_frames.csv`);
    }

    console.log('Export completed successfully');
  } catch (error) {
    console.error('Error during export:', error);
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
