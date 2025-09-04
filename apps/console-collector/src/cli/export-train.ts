import { Storage } from '../storage';
import config from '../config';
import { join } from 'path';
import { writeFileSync, existsSync, mkdirSync } from 'fs';

// Simple parquet-like export (since we don't want to add heavy dependencies)
// This creates a CSV with train/val split that can be easily converted to parquet

async function exportTrainData() {
  console.log('🚂 Exporting training data...');
  
  const args = process.argv.slice(2);
  const outPath = args.find(arg => arg.startsWith('--out='))?.split('=')[1] || 
                 join(config.DATA_DIR, 'train.csv');
  
  try {
    const storage = new Storage();
    const roundFeatures = storage.getRoundFeatures();
    
    if (roundFeatures.length === 0) {
      console.log('⚠️ No round features found in database');
      return;
    }
    
    console.log(`📊 Found ${roundFeatures.length} rounds for export`);
    
    // Ensure output directory exists
    const outputDir = join(outPath, '..');
    if (!existsSync(outputDir)) {
      mkdirSync(outputDir, { recursive: true });
    }
    
    // Sort by start time for consistent train/val split
    const sortedFeatures = roundFeatures.sort((a: any, b: any) => 
      new Date(a.startAt).getTime() - new Date(b.startAt).getTime()
    );
    
    // Create train/val split (80/20 by time)
    const splitIndex = Math.floor(sortedFeatures.length * 0.8);
    const trainFeatures = sortedFeatures.slice(0, splitIndex);
    const valFeatures = sortedFeatures.slice(splitIndex);
    
    // Prepare CSV with train/val split column
    const allFeatures = sortedFeatures.map((feature: any, index: number) => ({
      ...feature,
      split: index < splitIndex ? 'train' : 'val',
      split_index: index < splitIndex ? 0 : 1
    }));
    
    // Create header
    const header = Object.keys(allFeatures[0]);
    const csv = [
      header.join(','),
      ...allFeatures.map((feature: any) => 
        header.map(key => {
          const value = feature[key];
          if (typeof value === 'string' && value.includes(',')) {
            return JSON.stringify(value);
          }
          return String(value ?? '');
        }).join(',')
      )
    ].join('\n');
    
    // Write CSV
    writeFileSync(outPath, csv, 'utf8');
    
    console.log(`✅ Training data exported to: ${outPath}`);
    console.log(`📊 Split: ${trainFeatures.length} train, ${valFeatures.length} validation`);
    console.log(`🔢 Total features: ${header.length} columns`);
    
    // Show sample of features
    if (allFeatures.length > 0) {
      console.log('\n📋 Sample features:');
      const sample = allFeatures[0];
      Object.entries(sample).forEach(([key, value]) => {
        if (typeof value === 'number') {
          console.log(`   ${key}: ${value}`);
        } else {
          console.log(`   ${key}: "${value}"`);
        }
      });
    }
    
    storage.close();
    
  } catch (error) {
    console.error('❌ Export failed:', error);
    process.exit(1);
  }
}

// Run export
if (require.main === module) {
  exportTrainData().catch(console.error);
}
