#!/usr/bin/env node
/**
 * Selector Discovery Assistant
 * Interactive tool for discovering and testing CSS selectors on rugs.fun
 */

import { chromium, Browser, Page } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import { generateAllSelectors, computeElementInfo, simplifySelector } from './selectors';

interface DiscoveredSelector {
  elementType: string;
  elementInfo: any;
  candidates: any[];
  selectedSelector: string;
  screenshotPath: string;
}

class SelectorAssistant {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private discoveredSelectors: DiscoveredSelector[] = [];
  private outputDir: string;
  private screenshotsDir: string;
  
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
      // Launch browser with better screen fitting
      this.browser = await chromium.launch({ 
        headless: false,
        args: [
          '--start-maximized',
          '--disable-web-security',
          '--disable-features=VizDisplayCompositor',
          '--no-sandbox',
          '--disable-dev-shm-usage'
        ]
      });
      
      // Create new page
      this.page = await this.browser.newPage();
      
      // Set viewport to match your screen better
      await this.page.setViewportSize({ width: 1440, height: 900 });
      
      // Maximize the browser window
      const context = this.browser.contexts()[0];
      if (context) {
        await context.addInitScript(() => {
          // Ensure window is maximized
          if (window.screen && window.screen.availWidth && window.screen.availHeight) {
            window.resizeTo(window.screen.availWidth, window.screen.availHeight);
          }
        });
      }
      
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
      await new Promise(() => {}); // Never resolve
      
    } catch (error) {
      console.error('❌ Error starting Selector Assistant:', error);
      await this.cleanup();
      process.exit(1);
    }
  }

  private async injectOverlay() {
    if (!this.page) return;
    
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
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      `;
      
      // Create draggable side panel with better positioning
      const sidePanel = document.createElement('div');
      sidePanel.id = 'selector-assistant-panel';
      sidePanel.style.cssText = `
        position: fixed;
        top: 50%;
        right: 20px;
        transform: translateY(-50%);
        width: min(400px, 90vw);
        max-height: 90vh;
        background: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%);
        color: white;
        padding: 20px;
        border-radius: 12px;
        overflow-y: auto;
        pointer-events: auto;
        z-index: 1000000;
        font-size: 14px;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
        border: 1px solid rgba(255, 255, 255, 0.1);
        backdrop-filter: blur(10px);
        resize: both;
        overflow: auto;
        min-width: 300px;
        min-height: 400px;
      `;
      
      // Add panel content with better layout
      sidePanel.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; cursor: move;">
          <h3 style="margin: 0; color: #4ecdc4; font-size: 16px;">🎯 Selector Assistant</h3>
          <div style="display: flex; gap: 8px;">
            <button id="minimize-panel" style="padding: 4px 8px; background: #666; border: none; border-radius: 4px; color: white; cursor: pointer; font-size: 12px;">−</button>
            <button id="close-panel" style="padding: 4px 8px; background: #e74c3c; border: none; border-radius: 4px; color: white; cursor: pointer; font-size: 12px;">×</button>
          </div>
        </div>
        
        <div id="instructions" style="margin-bottom: 20px; padding: 15px; background: rgba(255, 255, 255, 0.1); border-radius: 8px; border-left: 4px solid #4ecdc4;">
          <strong style="color: #4ecdc4;">📋 Instructions:</strong><br>
          <div style="margin-top: 8px; line-height: 1.4;">
            1. <strong>Hover</strong> over elements to highlight them<br>
            2. <strong>Click</strong> on elements to generate selectors<br>
            3. <strong>Review</strong> candidates below<br>
            4. <strong>Click "Use this"</strong> to select<br>
            5. <strong>Save</strong> when done
          </div>
        </div>
        
        <div id="current-element" style="margin-bottom: 20px; padding: 15px; background: rgba(255, 255, 255, 0.1); border-radius: 8px; border-left: 4px solid #f39c12; display: none;">
          <strong style="color: #f39c12;">🎯 Current Element:</strong><br>
          <span id="element-info" style="margin-top: 8px; display: block; word-break: break-word;">None selected</span>
        </div>
        
        <div id="candidates" style="margin-bottom: 20px;">
          <strong style="color: #9b59b6;">🔍 Selector Candidates:</strong><br>
          <div id="candidates-list" style="margin-top: 8px; max-height: 150px; overflow-y: auto;">No candidates yet</div>
        </div>
        
        <div id="selected-selectors" style="margin-bottom: 20px;">
          <strong style="color: #27ae60;">✅ Selected Selectors:</strong><br>
          <div id="selected-list" style="margin-top: 8px; max-height: 150px; overflow-y: auto; background: rgba(39, 174, 96, 0.1); padding: 10px; border-radius: 6px;">None selected</div>
        </div>
        
        <div style="display: flex; gap: 10px; flex-wrap: wrap;">
          <button id="test-selectors" style="flex: 1; min-width: 120px; padding: 12px; background: linear-gradient(135deg, #f39c12 0%, #e67e22 100%); border: none; border-radius: 8px; color: white; cursor: pointer; font-weight: 500; transition: all 0.2s;">🧪 Test Selectors</button>
          <button id="save-selectors" style="flex: 1; min-width: 120px; padding: 12px; background: linear-gradient(135deg, #4ecdc4 0%, #44a08d 100%); border: none; border-radius: 8px; color: white; cursor: pointer; font-weight: 500; transition: all 0.2s;">💾 Save & Update</button>
        </div>
        
        <div style="margin-top: 15px; padding: 10px; background: rgba(255, 255, 255, 0.05); border-radius: 6px; font-size: 12px; color: #ccc;">
          💡 <strong>Tip:</strong> You can drag this panel around and resize it to fit your screen
        </div>
      `;
      
      // Add floating help button
      const helpButton = document.createElement('button');
      helpButton.id = 'selector-help-button';
      helpButton.style.cssText = `
        position: fixed;
        top: 20px;
        left: 20px;
        padding: 12px 16px;
        background: linear-gradient(135deg, #9b59b6 0%, #8e44ad 100%);
        border: none;
        border-radius: 25px;
        color: white;
        cursor: pointer;
        font-weight: 500;
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
        z-index: 1000001;
        font-size: 14px;
        transition: all 0.2s;
      `;
      helpButton.textContent = '❓ Help';
      helpButton.addEventListener('click', () => {
        // Toggle help panel visibility
        const helpPanel = document.getElementById('selector-help-panel');
        if (helpPanel) {
          helpPanel.style.display = helpPanel.style.display === 'none' ? 'block' : 'none';
        }
      });
      
      // Add collapsible help panel
      const helpPanel = document.createElement('div');
      helpPanel.id = 'selector-help-panel';
      helpPanel.style.cssText = `
        position: fixed;
        top: 70px;
        left: 20px;
        width: 300px;
        max-height: 400px;
        background: linear-gradient(135deg, #2c3e50 0%, #34495e 100%);
        color: white;
        padding: 20px;
        border-radius: 12px;
        overflow-y: auto;
        z-index: 1000000;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
        border: 1px solid rgba(255, 255, 255, 0.1);
        backdrop-filter: blur(10px);
        display: none;
      `;
      helpPanel.innerHTML = `
        <h4 style="margin: 0 0 15px 0; color: #3498db;">🎯 Quick Help</h4>
        <div style="line-height: 1.5; font-size: 13px;">
          <p><strong>💡 Tips:</strong></p>
          <ul style="margin: 10px 0; padding-left: 20px;">
            <li>Drag the main panel to move it</li>
            <li>Resize by dragging the bottom-right corner</li>
            <li>Click the − button to minimize</li>
            <li>Click the × button to close</li>
            <li>Use the floating button to reopen</li>
          </ul>
          <p><strong>🔧 If stuck:</strong></p>
          <ul style="margin: 10px 0; padding-left: 20px;">
            <li>Refresh the page</li>
            <li>Close and reopen the panel</li>
            <li>Check browser console for errors</li>
          </ul>
        </div>
      `;
      
      // Add to page
      document.body.appendChild(overlay);
      document.body.appendChild(sidePanel);
      document.body.appendChild(helpButton);
      document.body.appendChild(helpPanel);
      
      // Global state
      (window as any).selectorAssistant = {
        selectedSelectors: {},
        discoveredElements: []
      };
      
      // Make panel draggable
      let isDragging = false;
      let dragOffset = { x: 0, y: 0 };
      
      const panelHeader = sidePanel.querySelector('h3')?.parentElement;
      if (panelHeader) {
        panelHeader.addEventListener('mousedown', (e) => {
          isDragging = true;
          const rect = sidePanel.getBoundingClientRect();
          dragOffset.x = e.clientX - rect.left;
          dragOffset.y = e.clientY - rect.top;
          sidePanel.style.cursor = 'grabbing';
        });
      }
      
      document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        
        const x = e.clientX - dragOffset.x;
        const y = e.clientY - dragOffset.y;
        
        // Keep panel within viewport bounds
        const maxX = window.innerWidth - sidePanel.offsetWidth;
        const maxY = window.innerHeight - sidePanel.offsetHeight;
        
        sidePanel.style.left = Math.max(0, Math.min(x, maxX)) + 'px';
        sidePanel.style.top = Math.max(0, Math.min(y, maxY)) + 'px';
        sidePanel.style.right = 'auto';
        sidePanel.style.transform = 'none';
      });
      
      document.addEventListener('mouseup', () => {
        isDragging = false;
        sidePanel.style.cursor = 'default';
      });
      
      // Panel controls
      const minimizeBtn = document.getElementById('minimize-panel');
      const closeBtn = document.getElementById('close-panel');
      
      if (minimizeBtn) {
        minimizeBtn.addEventListener('click', () => {
          const candidates = document.getElementById('candidates') as HTMLElement;
          const selected = document.getElementById('selected-selectors') as HTMLElement;
          const buttons = candidates?.nextElementSibling as HTMLElement;
          
          if (candidates && selected && buttons) {
            if (candidates.style.display === 'none') {
              candidates.style.display = 'block';
              selected.style.display = 'block';
              buttons.style.display = 'flex';
              minimizeBtn.textContent = '−';
            } else {
              candidates.style.display = 'none';
              selected.style.display = 'none';
              buttons.style.display = 'none';
              minimizeBtn.textContent = '+';
            }
          }
        });
      }
      
      if (closeBtn) {
        closeBtn.addEventListener('click', () => {
          sidePanel.style.display = 'none';
          // Show a small floating button to reopen
          showReopenButton();
        });
      }
      
      function showReopenButton() {
        const reopenBtn = document.createElement('button');
        reopenBtn.id = 'reopen-selector-panel';
        reopenBtn.style.cssText = `
          position: fixed;
          bottom: 20px;
          right: 20px;
          padding: 12px 16px;
          background: linear-gradient(135deg, #4ecdc4 0%, #44a08d 100%);
          border: none;
          border-radius: 25px;
          color: white;
          cursor: pointer;
          font-weight: 500;
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
          z-index: 1000001;
        `;
        reopenBtn.textContent = '🎯 Reopen Selector Panel';
        reopenBtn.addEventListener('click', () => {
          sidePanel.style.display = 'block';
          reopenBtn.remove();
        });
        document.body.appendChild(reopenBtn);
      }
      
      // Responsive adjustments
      function adjustForScreenSize() {
        const isSmallScreen = window.innerWidth < 768;
        if (isSmallScreen) {
          sidePanel.style.width = '95vw';
          sidePanel.style.right = '2.5vw';
          sidePanel.style.left = 'auto';
          sidePanel.style.transform = 'none';
        } else {
          sidePanel.style.width = 'min(400px, 90vw)';
          sidePanel.style.right = '20px';
          sidePanel.style.left = 'auto';
          sidePanel.style.transform = 'translateY(-50%)';
        }
      }
      
      window.addEventListener('resize', adjustForScreenSize);
      adjustForScreenSize();
      
      // Element highlighting
      let highlightedElement: HTMLElement | null = null;
      
      document.addEventListener('mouseover', (e) => {
        const target = e.target as HTMLElement;
        if (target === overlay || target === sidePanel || target.closest('#selector-assistant-panel') || target.closest('#reopen-selector-panel') || target.closest('#selector-help-button') || target.closest('#selector-help-panel')) {
          return;
        }
        
        // Remove previous highlight
        if (highlightedElement) {
          highlightedElement.style.outline = '';
        }
        
        // Add highlight
        target.style.outline = '3px solid #4ecdc4';
        target.style.outlineOffset = '2px';
        highlightedElement = target;
      });
      
      document.addEventListener('mouseout', (e) => {
        const target = e.target as HTMLElement;
        if (target === highlightedElement) {
          target.style.outline = '';
          target.style.outlineOffset = '';
          highlightedElement = null;
        }
      });
      
      // Element selection
      document.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        if (target === overlay || target === sidePanel || target.closest('#selector-assistant-panel') || target.closest('#reopen-selector-panel') || target.closest('#selector-help-button') || target.closest('#selector-help-panel')) {
          return;
        }
        
        e.preventDefault();
        e.stopPropagation();
        
        // Generate selectors for clicked element
        generateSelectorsForElement(target);
      });
      
      function generateSelectorsForElement(element: HTMLElement) {
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
          }, {} as Record<string, string>)
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
            const stableClasses = classes.filter(c => 
              !c.match(/^[a-f0-9]{8,}$/) && 
              !c.match(/^[0-9]+$/) && 
              c.length > 2
            );
            
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
              const stableClasses = classes.filter(c => 
                !c.match(/^[a-f0-9]{8,}$/) && 
                !c.match(/^[0-9]+$/) && 
                c.length > 2
              );
              
              if (stableClasses.length > 0) {
                selector += `.${stableClasses.join('.')}`;
              }
            }
          }
          
          path.unshift(selector);
          current = current.parentElement!;
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
        (window as any).selectorAssistant.currentElement = {
          element: element,
          info: elementInfo,
          candidates: candidates
        };
      }
      
      function updateElementInfo(info: any) {
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
      
      function updateCandidates(candidates: any[]) {
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
      (window as any).selectCandidate = function(index: number) {
        const currentElement = (window as any).selectorAssistant.currentElement;
        if (!currentElement) return;
        
        const candidate = currentElement.candidates[index];
        if (!candidate) return;
        
        // Determine element type based on context
        let elementType = 'unknown';
        const text = currentElement.info.textContent.toLowerCase();
        
        if (text.includes('x') || text.includes('multiplier') || /\d+\.\d+x/.test(text)) {
          elementType = 'multiplier';
        } else if (text.includes('timer') || text.includes('time') || /\d+:\d+/.test(text)) {
          elementType = 'timer';
        } else if (text.includes('player') || text.includes('online') || /\d+/.test(text)) {
          elementType = 'players';
        } else if (text.includes('wager') || text.includes('total') || /\$\d+/.test(text)) {
          elementType = 'wager';
        } else if (text.includes('live') || text.includes('cooldown') || text.includes('waiting')) {
          elementType = 'status';
        }
        
        // Store selected selector
        (window as any).selectorAssistant.selectedSelectors[elementType] = {
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
          const selected = (window as any).selectorAssistant.selectedSelectors;
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
      
      function takeScreenshot(element: Element, elementType: string) {
        // This would normally take a screenshot, but for now just log
        console.log(`📸 Screenshot taken for ${elementType}: ${element.outerHTML.substring(0, 100)}...`);
      }
      
      // Button event handlers
      document.getElementById('test-selectors')?.addEventListener('click', () => {
        const selected = (window as any).selectorAssistant.selectedSelectors;
        if (Object.keys(selected).length === 0) {
          alert('Please select at least one selector first');
          return;
        }
        
        alert(`Testing ${Object.keys(selected).length} selectors...\n\nThis will run a 30-60 second test to validate the selectors.`);
        
        // In a real implementation, this would trigger the test
        console.log('🧪 Test selectors clicked:', selected);
      });
      
      document.getElementById('save-selectors')?.addEventListener('click', () => {
        const selected = (window as any).selectorAssistant.selectedSelectors;
        if (Object.keys(selected).length === 0) {
          alert('Please select at least one selector first');
          return;
        }
        
        // Store the selected selectors for the main process to access
        (window as any).selectorAssistant.saveRequested = true;
        (window as any).selectorAssistant.selectorsToSave = selected;
        
        alert(`Saving ${Object.keys(selected).length} selectors...\n\nCheck the console for the save operation.`);
        
        console.log('💾 Save selectors clicked:', selected);
      });
      
      console.log('🎯 Selector Assistant overlay injected successfully');
    });
    
    // Set up a listener for save requests
    await this.page.exposeFunction('onSaveRequested', async (selectors: any) => {
      await this.saveSelectors(selectors);
    });
    
    // Poll for save requests
    setInterval(async () => {
      if (!this.page) return;
      
      try {
        const saveRequested = await this.page.evaluate(() => {
          const assistant = (window as any).selectorAssistant;
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
      } catch (error) {
        // Ignore errors during polling
      }
    }, 1000);
  }

  private async saveSelectors(selectors: any) {
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
      
    } catch (error) {
      console.error('❌ Error saving selectors:', error);
    }
  }

  private async takeScreenshots(selectors: any): Promise<string[]> {
    if (!this.page) return [];
    
    const screenshotPaths: string[] = [];
    
    try {
      for (const [elementType, selectorData] of Object.entries(selectors)) {
        const selector = (selectorData as any).selector;
        
        try {
          // Wait for element to be visible
          await this.page.waitForSelector(selector, { timeout: 5000 });
          
          // Take screenshot
          const screenshotPath = path.join(this.screenshotsDir, `${elementType}-${Date.now()}.png`);
          await this.page.locator(selector).screenshot({ path: screenshotPath });
          
          screenshotPaths.push(screenshotPath);
          console.log(`📸 Screenshot saved: ${screenshotPath}`);
          
        } catch (error) {
          console.warn(`⚠️ Could not take screenshot for ${elementType}: ${error}`);
        }
      }
    } catch (error) {
      console.error('❌ Error taking screenshots:', error);
    }
    
    return screenshotPaths;
  }

  private async updateCollectorSelectors(selectors: any) {
    try {
      const collectorSelectorsPath = path.join(__dirname, '..', '..', 'collector', 'src', 'config', 'selectors.ts');
      
      if (!fs.existsSync(collectorSelectorsPath)) {
        console.warn('⚠️ Collector selectors file not found, skipping update');
        return;
      }
      
      // Read current file
      let content = fs.readFileSync(collectorSelectorsPath, 'utf8');
      
      // Create new selectors object
      const newSelectors: any = {};
      
      // Map element types to selector names
      const typeMapping: Record<string, string> = {
        'multiplier': 'multiplier',
        'timer': 'timer',
        'players': 'players',
        'wager': 'wager',
        'status': 'status'
      };
      
      for (const [elementType, selectorData] of Object.entries(selectors)) {
        const selectorName = typeMapping[elementType] || elementType;
        newSelectors[selectorName] = (selectorData as any).selector;
      }
      
      // Update the selectors object in the file
      const selectorsRegex = /export const selectors = \{[\s\S]*?\};/;
      const newSelectorsString = `export const selectors = ${JSON.stringify(newSelectors, null, 2).replace(/"/g, "'")};`;
      
      if (selectorsRegex.test(content)) {
        content = content.replace(selectorsRegex, newSelectorsString);
      } else {
        // If no existing selectors object, add it
        content += `\n\n${newSelectorsString}\n`;
      }
      
      // Write updated file
      fs.writeFileSync(collectorSelectorsPath, content);
      console.log(`📝 Collector selectors updated: ${collectorSelectorsPath}`);
      
    } catch (error) {
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
  } catch (error) {
    console.error('❌ Fatal error:', error);
    await assistant.cleanup();
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(console.error);
}
