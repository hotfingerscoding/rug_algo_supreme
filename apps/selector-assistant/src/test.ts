#!/usr/bin/env node
/**
 * Selector Test Script
 * Tests selected selectors with a 30-60 second probe to validate them
 */

import { chromium, Browser, Page } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

interface TestResult {
  selector: string;
  elementType: string;
  success: boolean;
  successRate: number;
  totalAttempts: number;
  successfulAttempts: number;
  lastValue: string;
  lastAttempt: Date;
  errors: string[];
}

interface TestSummary {
  timestamp: string;
  duration: number;
  totalSelectors: number;
  successfulSelectors: number;
  overallSuccessRate: number;
  results: TestResult[];
}

class SelectorTester {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private testDuration: number;
  private pollInterval: number = 1000; // 1 second
  private results: TestResult[] = [];
  
  constructor() {
    this.testDuration = parseInt(process.env.SELECTOR_MIN_POLL_S || '30') * 1000; // Convert to milliseconds
  }

  async start() {
    console.log('🧪 Starting Selector Test...');
    console.log(`⏱️  Test duration: ${this.testDuration / 1000} seconds`);
    
    try {
      // Launch browser
      this.browser = await chromium.launch({ 
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
      
      // Create new page
      this.page = await this.browser.newPage();
      
      // Set viewport
      await this.page.setViewportSize({ width: 1920, height: 1080 });
      
      // Navigate to target URL
      const targetUrl = process.env.SELECTOR_ASSISTANT_URL || 'https://rugs.fun';
      console.log(`📍 Navigating to ${targetUrl}...`);
      await this.page.goto(targetUrl, { waitUntil: 'networkidle' });
      
      // Wait for page to load
      await this.page.waitForTimeout(3000);
      
      // Load selectors from collector config
      const selectors = await this.loadSelectors();
      
      if (Object.keys(selectors).length === 0) {
        console.log('⚠️  No selectors found in collector config');
        return;
      }
      
      console.log(`🎯 Testing ${Object.keys(selectors).length} selectors...`);
      
      // Initialize test results
      this.initializeResults(selectors);
      
      // Start testing
      await this.runTest(selectors);
      
      // Generate report
      await this.generateReport();
      
      console.log('✅ Selector test completed!');
      
    } catch (error) {
      console.error('❌ Error during selector test:', error);
    } finally {
      await this.cleanup();
    }
  }

  private async loadSelectors(): Promise<Record<string, string>> {
    try {
      const collectorSelectorsPath = path.join(__dirname, '..', '..', 'collector', 'src', 'config', 'selectors.ts');
      
      if (!fs.existsSync(collectorSelectorsPath)) {
        console.warn('⚠️  Collector selectors file not found');
        return {};
      }
      
      // Read the file content
      const content = fs.readFileSync(collectorSelectorsPath, 'utf8');
      
      // Extract selectors object using regex
      const selectorsMatch = content.match(/export const selectors = \{([\s\S]*?)\};/);
      
      if (!selectorsMatch) {
        console.warn('⚠️  Could not find selectors object in config file');
        return {};
      }
      
      // Parse the selectors object
      const selectorsString = selectorsMatch[1];
      
      // Convert to valid JSON by replacing single quotes with double quotes
      const jsonString = selectorsString
        .replace(/(\w+):/g, '"$1":') // Add quotes to property names
        .replace(/'([^']*)'/g, '"$1"') // Replace single quotes with double quotes
        .replace(/,(\s*})/g, '$1'); // Remove trailing commas
      
      try {
        const selectors = JSON.parse(`{${jsonString}}`);
        console.log(`📋 Loaded ${Object.keys(selectors).length} selectors from config`);
        return selectors;
      } catch (parseError) {
        console.error('❌ Error parsing selectors:', parseError);
        return {};
      }
      
    } catch (error) {
      console.error('❌ Error loading selectors:', error);
      return {};
    }
  }

  private initializeResults(selectors: Record<string, string>) {
    for (const [elementType, selector] of Object.entries(selectors)) {
      this.results.push({
        selector,
        elementType,
        success: false,
        successRate: 0,
        totalAttempts: 0,
        successfulAttempts: 0,
        lastValue: '',
        lastAttempt: new Date(),
        errors: []
      });
    }
  }

  private async runTest(selectors: Record<string, string>) {
    const startTime = Date.now();
    const endTime = startTime + this.testDuration;
    
    console.log('🔄 Starting test loop...');
    
    while (Date.now() < endTime) {
      const remaining = Math.ceil((endTime - Date.now()) / 1000);
      console.log(`⏱️  Remaining: ${remaining}s`);
      
      // Test each selector
      for (const result of this.results) {
        await this.testSelector(result);
      }
      
      // Wait for next poll
      await new Promise(resolve => setTimeout(resolve, this.pollInterval));
    }
    
    console.log('✅ Test loop completed');
  }

  private async testSelector(result: TestResult) {
    if (!this.page) return;
    
    try {
      // Wait for element to be visible
      await this.page.waitForSelector(result.selector, { timeout: 2000 });
      
      // Get element text
      const element = await this.page.locator(result.selector);
      const text = await element.textContent();
      
      if (text !== null && text.trim() !== '') {
        result.successfulAttempts++;
        result.lastValue = text.trim();
        result.lastAttempt = new Date();
        result.success = true;
      } else {
        result.errors.push('Element found but no text content');
      }
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      result.errors.push(errorMessage);
    }
    
    result.totalAttempts++;
    result.successRate = result.totalAttempts > 0 ? (result.successfulAttempts / result.totalAttempts) * 100 : 0;
  }

  private async generateReport() {
    const summary: TestSummary = {
      timestamp: new Date().toISOString(),
      duration: this.testDuration / 1000,
      totalSelectors: this.results.length,
      successfulSelectors: this.results.filter(r => r.success).length,
      overallSuccessRate: 0,
      results: this.results
    };
    
    // Calculate overall success rate
    const totalAttempts = this.results.reduce((sum, r) => sum + r.totalAttempts, 0);
    const totalSuccessful = this.results.reduce((sum, r) => sum + r.successfulAttempts, 0);
    summary.overallSuccessRate = totalAttempts > 0 ? (totalSuccessful / totalAttempts) * 100 : 0;
    
    // Print summary
    console.log('\n📊 TEST RESULTS SUMMARY');
    console.log('=' .repeat(50));
    console.log(`Test Duration: ${summary.duration} seconds`);
    console.log(`Total Selectors: ${summary.totalSelectors}`);
    console.log(`Successful Selectors: ${summary.successfulSelectors}`);
    console.log(`Overall Success Rate: ${summary.overallSuccessRate.toFixed(1)}%`);
    
    console.log('\n📋 DETAILED RESULTS');
    console.log('=' .repeat(50));
    
    for (const result of this.results) {
      const status = result.success ? '✅' : '❌';
      console.log(`${status} ${result.elementType}:`);
      console.log(`   Selector: ${result.selector}`);
      console.log(`   Success Rate: ${result.successRate.toFixed(1)}% (${result.successfulAttempts}/${result.totalAttempts})`);
      console.log(`   Last Value: "${result.lastValue}"`);
      console.log(`   Last Attempt: ${result.lastAttempt.toLocaleTimeString()}`);
      
      if (result.errors.length > 0) {
        console.log(`   Errors: ${result.errors.slice(-3).join(', ')}`);
      }
      console.log('');
    }
    
    // Save detailed report
    await this.saveReport(summary);
    
    // Check if success rate meets requirements
    if (summary.overallSuccessRate >= 90) {
      console.log('🎉 SUCCESS: Overall success rate ≥90%');
      process.exit(0);
    } else {
      console.log('⚠️  WARNING: Overall success rate <90%');
      console.log('   Consider reviewing and updating selectors');
      process.exit(1);
    }
  }

  private async saveReport(summary: TestSummary) {
    try {
      const outputDir = path.join(__dirname, '..', 'output');
      if (!fs.existsSync(outputDir)) {
        fs.rmdirSync(outputDir, { recursive: true });
      }
      
      const reportPath = path.join(outputDir, `test-report-${Date.now()}.json`);
      fs.writeFileSync(reportPath, JSON.stringify(summary, null, 2));
      
      console.log(`📄 Detailed report saved to: ${reportPath}`);
      
    } catch (error) {
      console.error('❌ Error saving report:', error);
    }
  }

  async cleanup() {
    if (this.browser) {
      await this.browser.close();
    }
  }
}

// Main execution
async function main() {
  const tester = new SelectorTester();
  
  try {
    await tester.start();
  } catch (error) {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(console.error);
}
