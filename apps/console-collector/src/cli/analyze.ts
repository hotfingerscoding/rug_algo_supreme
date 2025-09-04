import fs from 'node:fs';
import path from 'node:path';
import { Storage } from '../storage';
import config from '../config';

// Parse command line arguments
const args = process.argv.slice(2);
const format = args.find(arg => arg.startsWith('--format='))?.split('=')[1] || 'csv';
const mode = args.find(arg => arg.startsWith('--mode='))?.split('=')[1] || 'overwrite';
const outPath = args.find(arg => arg.startsWith('--out='))?.split('=')[1] || path.resolve(config.DATA_DIR, 'round_features.csv');

(async () => {
  const storage = new Storage();
  const rows = storage.getRoundFeatures();
  
  if (rows.length === 0) {
    console.log('⚠️ No round features found in database');
    return;
  }
  
  // Ensure output directory exists
  const outputDir = path.dirname(outPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  if (format === 'json') {
    // JSON output
    const jsonData = {
      metadata: {
        generated: new Date().toISOString(),
        totalRounds: rows.length,
        config: {
          retentionDays: config.RETENTION_DAYS,
          maxJsonlMB: config.MAX_JSONL_MB
        }
      },
      rounds: rows
    };
    
    if (mode === 'append' && fs.existsSync(outPath)) {
      // Read existing data and append
      const existing = JSON.parse(fs.readFileSync(outPath, 'utf8'));
      existing.rounds.push(...rows);
      existing.metadata.totalRounds = existing.rounds.length;
      existing.metadata.generated = new Date().toISOString();
      fs.writeFileSync(outPath, JSON.stringify(existing, null, 2));
    } else {
      // Overwrite or create new
      fs.writeFileSync(outPath, JSON.stringify(jsonData, null, 2));
    }
    
    console.log(`✅ Wrote ${outPath} (${rows.length} rounds, JSON format)`);
    
  } else {
    // CSV output (default)
    const header = Object.keys(rows[0]);
    const csv = [
      header.join(','),
      ...rows.map((r: any) => header.map(k => {
        const v = r[k];
        return (typeof v === 'string' && v.includes(',')) ? JSON.stringify(v) : String(v ?? '');
      }).join(','))
    ].join('\n');
    
    if (mode === 'append' && fs.existsSync(outPath)) {
      // Append to existing CSV (skip header)
      fs.appendFileSync(outPath, '\n' + csv.split('\n').slice(1).join('\n'));
    } else {
      // Overwrite or create new
      fs.writeFileSync(outPath, csv);
    }
    
    console.log(`✅ Wrote ${outPath} (${rows.length} rounds, CSV format)`);
  }
})();
