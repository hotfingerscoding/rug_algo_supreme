import { chromium } from 'playwright';
import { existsSync, mkdirSync, writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import config from '../config';

interface CheckResult {
  name: string;
  status: '✅' | '❌';
  message: string;
  details?: string;
}

class EnvironmentChecker {
  private results: CheckResult[] = [];

  async runAllChecks(): Promise<void> {
    console.log('🔍 Console Collector Environment Check');
    console.log('=====================================\n');

    // Check environment variables
    this.checkEnvironment();

    // Check data directory and permissions
    this.checkDataDirectory();

    // Check SQLite write/read
    await this.checkSQLite();

    // Check JSONL directory and write permissions
    this.checkJSONL();

    // Check Playwright Chromium
    await this.checkPlaywright();

    // Print results
    this.printResults();

    // Exit with appropriate code
    const hasFailures = this.results.some(r => r.status === '❌');
    process.exit(hasFailures ? 1 : 0);
  }

  private checkEnvironment(): void {
    console.log('📋 Checking environment configuration...');
    
    try {
      // Validate config (this will throw if invalid)
      const configSummary = {
        EVENT_SOURCE: config.EVENT_SOURCE,
        ROUND_INACTIVITY_S: config.ROUND_INACTIVITY_S,
        RETENTION_DAYS: config.RETENTION_DAYS,
        MAX_JSONL_MB: config.MAX_JSONL_MB,
        LOG_LEVEL: config.LOG_LEVEL,
        HEARTBEAT_INTERVAL_MS: config.HEARTBEAT_INTERVAL_MS,
        DATA_DIR: config.DATA_DIR,
        DB_NAME: config.DB_NAME,
        JSONL_PREFIX: config.JSONL_PREFIX
      };

      this.results.push({
        name: 'Environment Variables',
        status: '✅',
        message: 'All environment variables validated successfully',
        details: JSON.stringify(configSummary, null, 2)
      });
    } catch (error) {
      this.results.push({
        name: 'Environment Variables',
        status: '❌',
        message: 'Environment validation failed',
        details: error instanceof Error ? error.message : String(error)
      });
    }
  }

  private checkDataDirectory(): void {
    console.log('📁 Checking data directory...');
    
    try {
      if (!existsSync(config.DATA_DIR)) {
        mkdirSync(config.DATA_DIR, { recursive: true });
        this.results.push({
          name: 'Data Directory',
          status: '✅',
          message: 'Data directory created successfully',
          details: `Created: ${config.DATA_DIR}`
        });
      } else {
        this.results.push({
          name: 'Data Directory',
          status: '✅',
          message: 'Data directory exists',
          details: `Path: ${config.DATA_DIR}`
        });
      }
    } catch (error) {
      this.results.push({
        name: 'Data Directory',
        status: '❌',
        message: 'Failed to create/access data directory',
        details: error instanceof Error ? error.message : String(error)
      });
    }
  }

  private async checkSQLite(): Promise<void> {
    console.log('🗄️  Checking SQLite database...');
    
    try {
      const dbPath = join(config.DATA_DIR, config.DB_NAME);
      const testPath = join(config.DATA_DIR, `test_write_${Date.now()}.sqlite`);
      
      // Test write
      const Database = require('better-sqlite3');
      const testDb = new Database(testPath);
      testDb.exec('CREATE TABLE test (id INTEGER PRIMARY KEY, value TEXT)');
      
      // Insert test data
      const insertStmt = testDb.prepare('INSERT INTO test (value) VALUES (?)');
      insertStmt.run('test_value');
      
      // Test read
      const result = testDb.prepare('SELECT value FROM test WHERE id = 1').get();
      testDb.close();
      
      if (result && result.value === 'test_value') {
        // Cleanup
        unlinkSync(testPath);
        this.results.push({
          name: 'SQLite Database',
          status: '✅',
          message: 'SQLite write/read test passed',
          details: `Test database: ${testPath}`
        });
      } else {
        throw new Error('Read test failed');
      }
    } catch (error) {
      this.results.push({
        name: 'SQLite Database',
        status: '❌',
        message: 'SQLite write/read test failed',
        details: error instanceof Error ? error.message : String(error)
      });
    }
  }

  private checkJSONL(): void {
    console.log('📄 Checking JSONL write permissions...');
    
    try {
      const jsonlPath = join(config.DATA_DIR, `${config.JSONL_PREFIX}.jsonl`);
      const testPath = join(config.DATA_DIR, 'test_write.jsonl');
      
      // Test write
      writeFileSync(testPath, '{"test": "value"}\n', 'utf8');
      
      // Test read
      const content = require('fs').readFileSync(testPath, 'utf8');
      
      // Cleanup
      unlinkSync(testPath);
      
      if (content.includes('test')) {
        this.results.push({
          name: 'JSONL Write Permissions',
          status: '✅',
          message: 'JSONL write/read test passed',
          details: `Test file: ${testPath}`
        });
      } else {
        throw new Error('Read test failed');
      }
    } catch (error) {
      this.results.push({
        name: 'JSONL Write Permissions',
        status: '❌',
        message: 'JSONL write/read test failed',
        details: error instanceof Error ? error.message : String(error)
      });
    }
  }

  private async checkPlaywright(): Promise<void> {
    console.log('🌐 Checking Playwright Chromium...');
    
    try {
      const browser = await chromium.launch({ headless: true });
      const version = browser.version();
      await browser.close();
      
      this.results.push({
        name: 'Playwright Chromium',
        status: '✅',
        message: 'Playwright Chromium available',
        details: `Version: ${version}`
      });
    } catch (error) {
      this.results.push({
        name: 'Playwright Chromium',
        status: '❌',
        message: 'Playwright Chromium not available',
        details: error instanceof Error ? error.message : String(error)
      });
    }
  }

  private printResults(): void {
    console.log('\n📊 Check Results:');
    console.log('==================');
    
    this.results.forEach(result => {
      console.log(`${result.status} ${result.name}: ${result.message}`);
      if (result.details) {
        console.log(`   ${result.details}`);
      }
    });
    
    const passed = this.results.filter(r => r.status === '✅').length;
    const total = this.results.length;
    
    console.log(`\n📈 Summary: ${passed}/${total} checks passed`);
    
    if (passed === total) {
      console.log('🎉 All checks passed! Environment is ready.');
    } else {
      console.log('⚠️  Some checks failed. Please resolve issues before proceeding.');
    }
  }
}

// Run checks
async function main() {
  try {
    const checker = new EnvironmentChecker();
    await checker.runAllChecks();
  } catch (error) {
    console.error('❌ Environment check failed:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(console.error);
}
