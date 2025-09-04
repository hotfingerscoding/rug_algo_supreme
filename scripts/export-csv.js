#!/usr/bin/env node
"use strict";
/**
 * CSV Export Script for Rugs Research
 * Exports SQLite data to CSV files
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const shared_1 = require("@rugs-research/shared");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
async function exportToCSV() {
    const db = new shared_1.SQLiteHelper(shared_1.config.get('DB_PATH'));
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
        }
        else {
            console.log('⚠ No rounds data to export');
        }
        // Export ticks (now includes source column)
        const ticks = db.getTicks();
        if (ticks.length > 0) {
            const ticksCsv = convertToCSV(ticks);
            fs.writeFileSync(path.join(exportsDir, 'ticks.csv'), ticksCsv);
            console.log(`✓ Exported ${ticks.length} ticks to data/exports/ticks.csv`);
        }
        else {
            console.log('⚠ No ticks data to export');
        }
        // Export WebSocket frames
        const wsFrames = db.getWSFrames();
        if (wsFrames.length > 0) {
            const wsCsv = convertToCSV(wsFrames);
            fs.writeFileSync(path.join(exportsDir, 'ws_frames.csv'), wsCsv);
            console.log(`✓ Exported ${wsFrames.length} WebSocket frames to data/exports/ws_frames.csv`);
        }
        else {
            console.log('⚠ No WebSocket frames to export');
        }
        // Export events (new table)
        const events = db.getEvents();
        if (events.length > 0) {
            const eventsCsv = convertToCSV(events);
            fs.writeFileSync(path.join(exportsDir, 'events.csv'), eventsCsv);
            console.log(`✓ Exported ${events.length} events to data/exports/events.csv`);
        }
        else {
            console.log('⚠ No events data to export');
        }
        // Export sidebet windows (new table)
        const sidebetWindows = db.getSidebetWindows();
        if (sidebetWindows.length > 0) {
            const sidebetWindowsCsv = convertToCSV(sidebetWindows);
            fs.writeFileSync(path.join(exportsDir, 'sidebet_windows.csv'), sidebetWindowsCsv);
            console.log(`✓ Exported ${sidebetWindows.length} sidebet windows to data/exports/sidebet_windows.csv`);
        }
        else {
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
            database_path: shared_1.config.get('DB_PATH'),
            schema_version: '004' // Current schema version with sidebet_windows
        };
        fs.writeFileSync(path.join(exportsDir, 'export_metadata.json'), JSON.stringify(metadata, null, 2));
        console.log('✓ Export completed successfully');
        console.log(`📁 Exports saved to: ${path.resolve(exportsDir)}`);
    }
    catch (error) {
        console.error('❌ Export failed:', error);
        throw error;
    }
    finally {
        db.close();
    }
}
function convertToCSV(data) {
    if (data.length === 0)
        return '';
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
//# sourceMappingURL=export-csv.js.map