#!/usr/bin/env node
"use strict";
/**
 * Selector Test Script
 * Tests selected selectors with a 30-60 second probe to validate them
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
const playwright_1 = require("playwright");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
class SelectorTester {
    browser = null;
    page = null;
    testDuration;
    pollInterval = 1000; // 1 second
    results = [];
    constructor() {
        this.testDuration = parseInt(process.env.SELECTOR_MIN_POLL_S || '30') * 1000; // Convert to milliseconds
    }
    async start() {
        console.log('🧪 Starting Selector Test...');
        console.log(`⏱️  Test duration: ${this.testDuration / 1000} seconds`);
        try {
            // Launch browser
            this.browser = await playwright_1.chromium.launch({
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
        }
        catch (error) {
            console.error('❌ Error during selector test:', error);
        }
        finally {
            await this.cleanup();
        }
    }
    async loadSelectors() {
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
            }
            catch (parseError) {
                console.error('❌ Error parsing selectors:', parseError);
                return {};
            }
        }
        catch (error) {
            console.error('❌ Error loading selectors:', error);
            return {};
        }
    }
    initializeResults(selectors) {
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
    async runTest(selectors) {
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
    async testSelector(result) {
        if (!this.page)
            return;
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
            }
            else {
                result.errors.push('Element found but no text content');
            }
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            result.errors.push(errorMessage);
        }
        result.totalAttempts++;
        result.successRate = result.totalAttempts > 0 ? (result.successfulAttempts / result.totalAttempts) * 100 : 0;
    }
    async generateReport() {
        const summary = {
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
        console.log('='.repeat(50));
        console.log(`Test Duration: ${summary.duration} seconds`);
        console.log(`Total Selectors: ${summary.totalSelectors}`);
        console.log(`Successful Selectors: ${summary.successfulSelectors}`);
        console.log(`Overall Success Rate: ${summary.overallSuccessRate.toFixed(1)}%`);
        console.log('\n📋 DETAILED RESULTS');
        console.log('='.repeat(50));
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
        }
        else {
            console.log('⚠️  WARNING: Overall success rate <90%');
            console.log('   Consider reviewing and updating selectors');
            process.exit(1);
        }
    }
    async saveReport(summary) {
        try {
            const outputDir = path.join(__dirname, '..', 'output');
            if (!fs.existsSync(outputDir)) {
                fs.mdirSync(outputDir, { recursive: true });
            }
            const reportPath = path.join(outputDir, `test-report-${Date.now()}.json`);
            fs.writeFileSync(reportPath, JSON.stringify(summary, null, 2));
            console.log(`📄 Detailed report saved to: ${reportPath}`);
        }
        catch (error) {
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
    }
    catch (error) {
        console.error('❌ Fatal error:', error);
        process.exit(1);
    }
}
if (require.main === module) {
    main().catch(console.error);
}
//# sourceMappingURL=test.js.map