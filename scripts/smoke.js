#!/usr/bin/env ts-node
"use strict";
/**
 * Smoke Test for Rugs Research System
 * Checks system health and API endpoints
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = __importDefault(require("fs"));
const sqlite3_1 = __importDefault(require("sqlite3"));
const util_1 = require("util");
const child_process_1 = require("child_process");
// Promisify exec for async/await
const execAsync = (0, util_1.promisify)(child_process_1.exec);
class SmokeTester {
    results = [];
    dbPath = 'data/rugs.sqlite';
    apiUrl = 'http://localhost:8787';
    async runAllTests() {
        console.log('🧪 Rugs Research Smoke Test');
        console.log('==========================');
        // Run all tests
        await this.testDatabase();
        await this.testDatabaseTables();
        await this.testLastRound();
        await this.testAPIHealth();
        await this.testModelInfo();
        await this.testThresholds();
        // Print results
        this.printResults();
        // Exit with appropriate code
        const hasFailures = this.results.some(r => r.status === 'FAIL');
        process.exit(hasFailures ? 1 : 0);
    }
    async testDatabase() {
        try {
            if (!fs_1.default.existsSync(this.dbPath)) {
                this.addResult('Database File', 'WARN', 'Database file not found', {
                    path: this.dbPath,
                    suggestion: 'Run collector to create database'
                });
                return;
            }
            const stats = fs_1.default.statSync(this.dbPath);
            const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
            this.addResult('Database File', 'PASS', `Database exists (${sizeMB} MB)`, {
                path: this.dbPath,
                size: `${sizeMB} MB`,
                modified: stats.mtime.toISOString()
            });
        }
        catch (error) {
            this.addResult('Database File', 'FAIL', 'Error checking database', { error: error.message });
        }
    }
    async testDatabaseTables() {
        try {
            if (!fs_1.default.existsSync(this.dbPath)) {
                this.addResult('Database Tables', 'WARN', 'Cannot check tables - database not found');
                return;
            }
            const db = new sqlite3_1.default.Database(this.dbPath);
            const tables = ['rounds', 'ticks', 'ws', 'events', 'sidebet_windows'];
            const missingTables = [];
            for (const table of tables) {
                try {
                    const result = await this.queryTable(db, `SELECT COUNT(*) as count FROM ${table}`);
                    if (result && result.length > 0) {
                        const count = result[0].count;
                        this.addResult(`Table: ${table}`, 'PASS', `Found ${count} records`);
                    }
                    else {
                        missingTables.push(table);
                    }
                }
                catch (error) {
                    missingTables.push(table);
                }
            }
            if (missingTables.length > 0) {
                this.addResult('Database Tables', 'WARN', `Missing tables: ${missingTables.join(', ')}`, {
                    missing: missingTables,
                    suggestion: 'Some tables may be created later by collector'
                });
            }
            else {
                this.addResult('Database Tables', 'PASS', 'All required tables present');
            }
            db.close();
        }
        catch (error) {
            this.addResult('Database Tables', 'FAIL', 'Error checking database tables', { error: error.message });
        }
    }
    async testLastRound() {
        try {
            if (!fs_1.default.existsSync(this.dbPath)) {
                this.addResult('Last Round', 'WARN', 'Cannot check last round - database not found');
                return;
            }
            const db = new sqlite3_1.default.Database(this.dbPath);
            const result = await this.queryTable(db, `
        SELECT id, started_at, ended_at, rug_time_s, rug_x, players
        FROM rounds 
        ORDER BY started_at DESC 
        LIMIT 1
      `);
            if (result && result.length > 0) {
                const round = result[0];
                const startTime = new Date(round.started_at).toISOString();
                const endTime = round.ended_at ? new Date(round.ended_at).toISOString() : 'Still running';
                this.addResult('Last Round', 'PASS', `Round ${round.id} found`, {
                    id: round.id,
                    started: startTime,
                    ended: endTime,
                    rug_time_s: round.rug_time_s,
                    rug_x: round.rug_x,
                    players: round.players
                });
            }
            else {
                this.addResult('Last Round', 'WARN', 'No rounds found in database', {
                    suggestion: 'Collector may not have started yet'
                });
            }
            db.close();
        }
        catch (error) {
            this.addResult('Last Round', 'FAIL', 'Error checking last round', { error: error.message });
        }
    }
    async testAPIHealth() {
        try {
            const response = await this.makeRequest(`${this.apiUrl}/health`);
            if (response.status === 200) {
                this.addResult('API Health', 'PASS', 'API is healthy', response.data);
            }
            else {
                this.addResult('API Health', 'WARN', `API returned status ${response.status}`, response.data);
            }
        }
        catch (error) {
            this.addResult('API Health', 'WARN', 'API health check failed', {
                error: error.message,
                suggestion: 'API may not be running - try "make serve"'
            });
        }
    }
    async testModelInfo() {
        try {
            const response = await this.makeRequest(`${this.apiUrl}/model-info`);
            if (response.status === 200) {
                this.addResult('Model Info', 'PASS', 'Model info available', response.data);
            }
            else if (response.status === 503) {
                this.addResult('Model Info', 'WARN', 'Model not trained yet', {
                    status: response.status,
                    suggestion: 'Run "make train" to train a model'
                });
            }
            else {
                this.addResult('Model Info', 'WARN', `Model info returned status ${response.status}`, response.data);
            }
        }
        catch (error) {
            this.addResult('Model Info', 'WARN', 'Model info check failed', {
                error: error.message,
                suggestion: 'API may not be running or model not trained'
            });
        }
    }
    async testThresholds() {
        try {
            const response = await this.makeRequest(`${this.apiUrl}/thresholds`);
            if (response.status === 200) {
                this.addResult('Thresholds', 'PASS', 'Thresholds available', response.data);
            }
            else if (response.status === 404) {
                this.addResult('Thresholds', 'WARN', 'Thresholds endpoint not found', {
                    status: response.status,
                    suggestion: 'Thresholds may not be configured yet'
                });
            }
            else {
                this.addResult('Thresholds', 'WARN', `Thresholds returned status ${response.status}`, response.data);
            }
        }
        catch (error) {
            this.addResult('Thresholds', 'WARN', 'Thresholds check failed', {
                error: error.message,
                suggestion: 'API may not be running or thresholds not configured'
            });
        }
    }
    async queryTable(db, query) {
        return new Promise((resolve, reject) => {
            db.all(query, (err, rows) => {
                if (err) {
                    reject(err);
                }
                else {
                    resolve(rows || []);
                }
            });
        });
    }
    async makeRequest(url) {
        try {
            const { stdout } = await execAsync(`curl -s -w "%{http_code}" -o /tmp/response.json ${url}`);
            const status = parseInt(stdout.trim());
            const data = fs_1.default.existsSync('/tmp/response.json') ?
                JSON.parse(fs_1.default.readFileSync('/tmp/response.json', 'utf8')) : {};
            return { status, data };
        }
        catch (error) {
            throw new Error(`Request failed: ${error.message}`);
        }
    }
    addResult(name, status, message, details) {
        this.results.push({ name, status, message, details });
    }
    printResults() {
        console.log('\n📊 Test Results:');
        console.log('================');
        const passCount = this.results.filter(r => r.status === 'PASS').length;
        const warnCount = this.results.filter(r => r.status === 'WARN').length;
        const failCount = this.results.filter(r => r.status === 'FAIL').length;
        for (const result of this.results) {
            const statusIcon = {
                'PASS': '✅',
                'WARN': '⚠️',
                'FAIL': '❌'
            }[result.status];
            console.log(`${statusIcon} ${result.name}: ${result.message}`);
            if (result.details) {
                const detailsStr = JSON.stringify(result.details, null, 2);
                console.log(`   Details: ${detailsStr}`);
            }
        }
        console.log('\n📈 Summary:');
        console.log(`   ✅ Pass: ${passCount}`);
        console.log(`   ⚠️  Warn: ${warnCount}`);
        console.log(`   ❌ Fail: ${failCount}`);
        if (failCount > 0) {
            console.log('\n❌ Critical failures detected!');
        }
        else if (warnCount > 0) {
            console.log('\n⚠️  System has warnings but should be functional');
        }
        else {
            console.log('\n✅ All tests passed! System is healthy');
        }
    }
}
// Run smoke tests
async function main() {
    try {
        const tester = new SmokeTester();
        await tester.runAllTests();
    }
    catch (error) {
        console.error('❌ Smoke test failed:', error);
        process.exit(1);
    }
}
if (require.main === module) {
    main();
}
//# sourceMappingURL=smoke.js.map