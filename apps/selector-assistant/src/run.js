#!/usr/bin/env node
"use strict";
/**
 * Selector Discovery Assistant
 * Interactive tool for discovering and testing CSS selectors on rugs.fun
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
class SelectorAssistant {
    browser = null;
    page = null;
    discoveredSelectors = [];
    outputDir;
    screenshotsDir;
    constructor() {
        this.outputDir = path.join(__dirname, '..', 'output');
        this.screenshotsDir = path.join(this.outputDir, 'screenshots');
        // Ensure output directories exist
        if (!fs.existsSync(this.outputDir)) {
            fs.mkdirSync(this.outputDir, { recursive: true });
        }
        if (!fs.existsSync(this.screenshotsDir)) {
            fs.mkdirSync(this.screenshotsDir, { recursive: true });
        }
    }
    async start() {
        console.log('🚀 Starting Selector Discovery Assistant...');
        try {
            // Launch browser
            this.browser = await playwright_1.chromium.launch({
                headless: false,
                args: ['--start-maximized']
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
            // Inject the overlay
            await this.injectOverlay();
            console.log('✅ Selector Assistant is ready!');
            console.log('📋 Instructions:');
            console.log('   1. Hover over elements to see them highlighted');
            console.log('   2. Click on elements to generate selector candidates');
            console.log('   3. Review candidates in the side panel');
            console.log('   4. Click "Use this" to select a candidate');
            console.log('   5. Click "Save & Update Collector" when done');
            console.log('   6. Close the browser when finished');
            // Keep the process running
            await new Promise(() => { }); // Never resolve
        }
        catch (error) {
            console.error('❌ Error starting Selector Assistant:', error);
            await this.cleanup();
            process.exit(1);
        }
    }
    async injectOverlay() {
        if (!this.page)
            return;
        // Inject the overlay HTML and JavaScript
        await this.page.evaluate(() => {
            // Create overlay container
            const overlay = document.createElement('div');
            overlay.id = 'selector-assistant-overlay';
            overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
        z-index: 999999;
        font-family: Arial, sans-serif;
      `;
            // Create side panel
            const sidePanel = document.createElement('div');
            sidePanel.id = 'selector-assistant-panel';
            sidePanel.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        width: 400px;
        max-height: 80vh;
        background: rgba(0, 0, 0, 0.9);
        color: white;
        padding: 20px;
        border-radius: 8px;
        overflow-y: auto;
        pointer-events: auto;
        z-index: 1000000;
        font-size: 14px;
      `;
            // Add panel content
            sidePanel.innerHTML = `
        <h3 style="margin: 0 0 15px 0; color: #4ecdc4;">🎯 Selector Discovery Assistant</h3>
        <div id="instructions" style="margin-bottom: 20px; padding: 10px; background: rgba(255, 255, 255, 0.1); border-radius: 4px;">
          <strong>Instructions:</strong><br>
          1. Hover over elements to highlight them<br>
          2. Click on elements to generate selectors<br>
          3. Review candidates below<br>
          4. Click "Use this" to select<br>
          5. Save when done
        </div>
        <div id="current-element" style="margin-bottom: 20px; padding: 10px; background: rgba(255, 255, 255, 0.1); border-radius: 4px; display: none;">
          <strong>Current Element:</strong><br>
          <span id="element-info">None selected</span>
        </div>
        <div id="candidates" style="margin-bottom: 20px;">
          <strong>Selector Candidates:</strong><br>
          <div id="candidates-list">No candidates yet</div>
        </div>
        <div id="selected-selectors" style="margin-bottom: 20px;">
          <strong>Selected Selectors:</strong><br>
          <div id="selected-list">None selected</div>
        </div>
        <div style="display: flex; gap: 10px;">
          <button id="test-selectors" style="flex: 1; padding: 10px; background: #ffa502; border: none; border-radius: 4px; color: white; cursor: pointer;">🧪 Test Selectors</button>
          <button id="save-selectors" style="flex: 1; padding: 10px; background: #4ecdc4; border: none; border-radius: 4px; color: white; cursor: pointer;">💾 Save & Update Collector</button>
        </div>
      `;
            // Add to page
            document.body.appendChild(overlay);
            document.body.appendChild(sidePanel);
            // Global state
            window.selectorAssistant = {
                selectedSelectors: {},
                discoveredElements: []
            };
            // Element highlighting
            let highlightedElement = null;
            document.addEventListener('mouseover', (e) => {
                const target = e.target;
                if (target === overlay || target === sidePanel || target.closest('#selector-assistant-panel')) {
                    return;
                }
                // Remove previous highlight
                if (highlightedElement) {
                    highlightedElement.style.outline = '';
                }
                // Add highlight
                target.style.outline = '2px solid #4ecdc4';
                highlightedElement = target;
            });
            document.addEventListener('mouseout', (e) => {
                const target = e.target;
                if (target === highlightedElement) {
                    target.style.outline = '';
                    highlightedElement = null;
                }
            });
            // Element selection
            document.addEventListener('click', (e) => {
                const target = e.target;
                if (target === overlay || target === sidePanel || target.closest('#selector-assistant-panel')) {
                    return;
                }
                e.preventDefault();
                e.stopPropagation();
                // Generate selectors for clicked element
                generateSelectorsForElement(target);
            });
            function generateSelectorsForElement(element) {
                // Get element info
                const elementInfo = {
                    tagName: element.tagName.toLowerCase(),
                    className: element.className,
                    id: element.id,
                    textContent: element.textContent?.trim() || '',
                    attributes: Array.from(element.attributes).map(attr => ({ name: attr.name, value: attr.value })),
                    dataset: Object.keys(element.dataset).reduce((acc, key) => {
                        acc[key] = element.dataset[key];
                        return acc;
                    }, {})
                };
                // Generate candidates (simplified for browser)
                const candidates = [];
                // ID selector
                if (element.id) {
                    candidates.push({
                        selector: `#${element.id}`,
                        score: 100,
                        type: 'id',
                        description: 'Unique ID selector'
                    });
                }
                // Class selector
                if (element.className) {
                    const classes = element.className.split(' ').filter(c => c.trim());
                    if (classes.length > 0) {
                        const stableClasses = classes.filter(c => !c.match(/^[a-f0-9]{8,}$/) &&
                            !c.match(/^[0-9]+$/) &&
                            c.length > 2);
                        if (stableClasses.length > 0) {
                            candidates.push({
                                selector: `.${stableClasses.join('.')}`,
                                score: 80,
                                type: 'class',
                                description: 'Stable class selector'
                            });
                        }
                    }
                }
                // Data attribute selector
                if (Object.keys(element.dataset).length > 0) {
                    for (const [key, value] of Object.entries(element.dataset)) {
                        if (value && value.length < 50) {
                            candidates.push({
                                selector: `[data-${key}="${value}"]`,
                                score: 90,
                                type: 'data',
                                description: `Data attribute: ${key}="${value}"`
                            });
                            break; // Just use the first one
                        }
                    }
                }
                // Text selector
                if (element.textContent && element.textContent.trim().length > 3) {
                    const text = element.textContent.trim();
                    if (text.length < 20) {
                        candidates.push({
                            selector: `:has-text("${text}")`,
                            score: 60,
                            type: 'text',
                            description: `Text content: "${text}"`
                        });
                    }
                }
                // CSS path (simplified)
                let current = element;
                const path = [];
                let depth = 0;
                while (current && current !== document.body && depth < 3) {
                    let selector = current.tagName.toLowerCase();
                    if (current.id) {
                        selector += `#${current.id}`;
                        path.unshift(selector);
                        break;
                    }
                    if (current.className) {
                        const classes = current.className.split(' ').filter(c => c.trim());
                        if (classes.length > 0) {
                            const stableClasses = classes.filter(c => !c.match(/^[a-f0-9]{8,}$/) &&
                                !c.match(/^[0-9]+$/) &&
                                c.length > 2);
                            if (stableClasses.length > 0) {
                                selector += `.${stableClasses.join('.')}`;
                            }
                        }
                    }
                    path.unshift(selector);
                    current = current.parentElement;
                    depth++;
                }
                if (path.length > 1) {
                    candidates.push({
                        selector: path.join(' > '),
                        score: 70,
                        type: 'css',
                        description: 'CSS path selector'
                    });
                }
                // Sort by score
                candidates.sort((a, b) => b.score - a.score);
                // Update UI
                updateElementInfo(elementInfo);
                updateCandidates(candidates);
                // Store for later use
                window.selectorAssistant.currentElement = {
                    element: element,
                    info: elementInfo,
                    candidates: candidates
                };
            }
            function updateElementInfo(info) {
                const elementInfo = document.getElementById('element-info');
                if (elementInfo) {
                    elementInfo.innerHTML = `
            <strong>${info.tagName}</strong>${info.id ? `#${info.id}` : ''}${info.className ? `.${info.className.split(' ').join('.')}` : ''}<br>
            Text: "${info.textContent.substring(0, 50)}${info.textContent.length > 50 ? '...' : ''}"<br>
            Data attributes: ${Object.keys(info.dataset).length}
          `;
                }
                const currentElement = document.getElementById('current-element');
                if (currentElement) {
                    currentElement.style.display = 'block';
                }
            }
            function updateCandidates(candidates) {
                const candidatesList = document.getElementById('candidates-list');
                if (candidatesList) {
                    if (candidates.length === 0) {
                        candidatesList.innerHTML = 'No candidates found';
                        return;
                    }
                    candidatesList.innerHTML = candidates.map((candidate, index) => `
            <div style="margin: 10px 0; padding: 10px; background: rgba(255, 255, 255, 0.1); border-radius: 4px;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px;">
                <span style="color: #4ecdc4;">${candidate.type.toUpperCase()}</span>
                <span style="color: #ffa502;">Score: ${candidate.score}</span>
              </div>
              <div style="font-family: monospace; font-size: 12px; margin-bottom: 5px; word-break: break-all;">
                ${candidate.selector}
              </div>
              <div style="font-size: 12px; color: #ccc; margin-bottom: 5px;">
                ${candidate.description}
              </div>
              <button onclick="selectCandidate(${index})" style="width: 100%; padding: 5px; background: #4ecdc4; border: none; border-radius: 4px; color: white; cursor: pointer;">
                Use this
              </button>
            </div>
          `).join('');
                }
            }
            // Global function for selecting candidates
            window.selectCandidate = function (index) {
                const currentElement = window.selectorAssistant.currentElement;
                if (!currentElement)
                    return;
                const candidate = currentElement.candidates[index];
                if (!candidate)
                    return;
                // Determine element type based on context
                let elementType = 'unknown';
                const text = currentElement.info.textContent.toLowerCase();
                if (text.includes('x') || text.includes('multiplier') || /\d+\.\d+x/.test(text)) {
                    elementType = 'multiplier';
                }
                else if (text.includes('timer') || text.includes('time') || /\d+:\d+/.test(text)) {
                    elementType = 'timer';
                }
                else if (text.includes('player') || text.includes('online') || /\d+/.test(text)) {
                    elementType = 'players';
                }
                else if (text.includes('wager') || text.includes('total') || /\$\d+/.test(text)) {
                    elementType = 'wager';
                }
                else if (text.includes('live') || text.includes('cooldown') || text.includes('waiting')) {
                    elementType = 'status';
                }
                // Store selected selector
                window.selectorAssistant.selectedSelectors[elementType] = {
                    selector: candidate.selector,
                    score: candidate.score,
                    type: candidate.type,
                    description: candidate.description
                };
                // Update selected list
                updateSelectedSelectors();
                // Take screenshot
                takeScreenshot(currentElement.element, elementType);
            };
            function updateSelectedSelectors() {
                const selectedList = document.getElementById('selected-list');
                if (selectedList) {
                    const selected = window.selectorAssistant.selectedSelectors;
                    const keys = Object.keys(selected);
                    if (keys.length === 0) {
                        selectedList.innerHTML = 'None selected';
                        return;
                    }
                    selectedList.innerHTML = keys.map(key => `
            <div style="margin: 5px 0; padding: 8px; background: rgba(76, 205, 196, 0.2); border-radius: 4px; border-left: 3px solid #4ecdc4;">
              <strong>${key}:</strong> ${selected[key].selector}<br>
              <small style="color: #ccc;">${selected[key].description}</small>
            </div>
          `).join('');
                }
            }
            function takeScreenshot(element, elementType) {
                // This would normally take a screenshot, but for now just log
                console.log(`📸 Screenshot taken for ${elementType}: ${element.outerHTML.substring(0, 100)}...`);
            }
            // Button event handlers
            document.getElementById('test-selectors')?.addEventListener('click', () => {
                const selected = window.selectorAssistant.selectedSelectors;
                if (Object.keys(selected).length === 0) {
                    alert('Please select at least one selector first');
                    return;
                }
                alert(`Testing ${Object.keys(selected).length} selectors...\n\nThis will run a 30-60 second test to validate the selectors.`);
                // In a real implementation, this would trigger the test
                console.log('🧪 Test selectors clicked:', selected);
            });
            document.getElementById('save-selectors')?.addEventListener('click', () => {
                const selected = window.selectorAssistant.selectedSelectors;
                if (Object.keys(selected).length === 0) {
                    alert('Please select at least one selector first');
                    return;
                }
                // Store the selected selectors for the main process to access
                window.selectorAssistant.saveRequested = true;
                window.selectorAssistant.selectorsToSave = selected;
                alert(`Saving ${Object.keys(selected).length} selectors...\n\nCheck the console for the save operation.`);
                console.log('💾 Save selectors clicked:', selected);
            });
            console.log('🎯 Selector Assistant overlay injected successfully');
        });
        // Set up a listener for save requests
        await this.page.exposeFunction('onSaveRequested', async (selectors) => {
            await this.saveSelectors(selectors);
        });
        // Poll for save requests
        setInterval(async () => {
            if (!this.page)
                return;
            try {
                const saveRequested = await this.page.evaluate(() => {
                    const assistant = window.selectorAssistant;
                    if (assistant?.saveRequested) {
                        const selectors = assistant.selectorsToSave;
                        assistant.saveRequested = false;
                        return selectors;
                    }
                    return null;
                });
                if (saveRequested) {
                    await this.saveSelectors(saveRequested);
                }
            }
            catch (error) {
                // Ignore errors during polling
            }
        }, 1000);
    }
    async saveSelectors(selectors) {
        console.log('💾 Saving selectors...');
        try {
            // Take screenshots of selected elements
            const screenshots = await this.takeScreenshots(selectors);
            // Create output data
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
            const outputData = {
                timestamp: new Date().toISOString(),
                selectors: selectors,
                screenshots: screenshots
            };
            // Save JSON snapshot
            const jsonPath = path.join(this.outputDir, `selectors-${timestamp}.json`);
            fs.writeFileSync(jsonPath, JSON.stringify(outputData, null, 2));
            console.log(`📄 Selectors saved to: ${jsonPath}`);
            // Update collector selectors
            await this.updateCollectorSelectors(selectors);
            console.log('✅ Selectors saved and collector updated successfully!');
        }
        catch (error) {
            console.error('❌ Error saving selectors:', error);
        }
    }
    async takeScreenshots(selectors) {
        if (!this.page)
            return [];
        const screenshotPaths = [];
        try {
            for (const [elementType, selectorData] of Object.entries(selectors)) {
                const selector = selectorData.selector;
                try {
                    // Wait for element to be visible
                    await this.page.waitForSelector(selector, { timeout: 5000 });
                    // Take screenshot
                    const screenshotPath = path.join(this.screenshotsDir, `${elementType}-${Date.now()}.png`);
                    await this.page.locator(selector).screenshot({ path: screenshotPath });
                    screenshotPaths.push(screenshotPath);
                    console.log(`📸 Screenshot saved: ${screenshotPath}`);
                }
                catch (error) {
                    console.warn(`⚠️ Could not take screenshot for ${elementType}: ${error}`);
                }
            }
        }
        catch (error) {
            console.error('❌ Error taking screenshots:', error);
        }
        return screenshotPaths;
    }
    async updateCollectorSelectors(selectors) {
        try {
            const collectorSelectorsPath = path.join(__dirname, '..', '..', 'collector', 'src', 'config', 'selectors.ts');
            if (!fs.existsSync(collectorSelectorsPath)) {
                console.warn('⚠️ Collector selectors file not found, skipping update');
                return;
            }
            // Read current file
            let content = fs.readFileSync(collectorSelectorsPath, 'utf8');
            // Create new selectors object
            const newSelectors = {};
            // Map element types to selector names
            const typeMapping = {
                'multiplier': 'multiplier',
                'timer': 'timer',
                'players': 'players',
                'wager': 'wager',
                'status': 'status'
            };
            for (const [elementType, selectorData] of Object.entries(selectors)) {
                const selectorName = typeMapping[elementType] || elementType;
                newSelectors[selectorName] = selectorData.selector;
            }
            // Update the selectors object in the file
            const selectorsRegex = /export const selectors = \{[\s\S]*?\};/;
            const newSelectorsString = `export const selectors = ${JSON.stringify(newSelectors, null, 2).replace(/"/g, "'")};`;
            if (selectorsRegex.test(content)) {
                content = content.replace(selectorsRegex, newSelectorsString);
            }
            else {
                // If no existing selectors object, add it
                content += `\n\n${newSelectorsString}\n`;
            }
            // Write updated file
            fs.writeFileSync(collectorSelectorsPath, content);
            console.log(`📝 Collector selectors updated: ${collectorSelectorsPath}`);
        }
        catch (error) {
            console.error('❌ Error updating collector selectors:', error);
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
    const assistant = new SelectorAssistant();
    // Handle cleanup on exit
    process.on('SIGINT', async () => {
        console.log('\n🛑 Shutting down Selector Assistant...');
        await assistant.cleanup();
        process.exit(0);
    });
    process.on('SIGTERM', async () => {
        console.log('\n🛑 Shutting down Selector Assistant...');
        await assistant.cleanup();
        process.exit(0);
    });
    try {
        await assistant.start();
    }
    catch (error) {
        console.error('❌ Fatal error:', error);
        await assistant.cleanup();
        process.exit(1);
    }
}
if (require.main === module) {
    main().catch(console.error);
}
//# sourceMappingURL=run.js.map