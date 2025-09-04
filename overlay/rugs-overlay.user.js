// ==UserScript==
// @name         Rugs Research Overlay
// @namespace    http://tampermonkey.net/
// @version      1.0.0
// @description  Live rug prediction overlay for rugs.fun
// @author       Rugs Research
// @match        https://rugs.fun/*
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// ==/UserScript==

(function() {
    'use strict';

    // Configuration
    const API_SERVER = 'http://localhost:8787';
    const UPDATE_INTERVAL = 1000; // 1 second
    const OVERLAY_ID = 'rugs-research-overlay';

    // Overlay HTML
    const overlayHTML = `
        <div id="${OVERLAY_ID}" style="
            position: fixed;
            top: 20px;
            right: 20px;
            width: 320px;
            background: rgba(0, 0, 0, 0.8);
            color: white;
            padding: 15px;
            border-radius: 8px;
            font-family: 'Courier New', monospace;
            font-size: 12px;
            z-index: 10000;
            cursor: move;
            border: 1px solid #333;
            box-shadow: 0 4px 8px rgba(0, 0, 0, 0.3);
        ">
            <div style="
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 10px;
                border-bottom: 1px solid #444;
                padding-bottom: 5px;
            ">
                <strong>RUGS RESEARCH</strong>
                <span id="overlay-status" style="color: #ff6b6b;">OFFLINE</span>
            </div>
            
            <div style="margin-bottom: 8px;">
                <div style="display: flex; justify-content: space-between;">
                    <span>5s Risk:</span>
                    <span id="risk-5s" style="color: #ff6b6b;">--</span>
                </div>
                <div style="display: flex; justify-content: space-between;">
                    <span>10s Risk:</span>
                    <span id="risk-10s" style="color: #ff6b6b;">--</span>
                </div>
            </div>
            
            <div style="margin-bottom: 8px;">
                <div style="display: flex; justify-content: space-between;">
                    <span>Action:</span>
                    <span id="action" style="color: #4ecdc4;">--</span>
                </div>
            </div>
            
            <div style="margin-bottom: 8px; border-top: 1px solid #444; padding-top: 5px;">
                <div style="display: flex; justify-content: space-between;">
                    <span>Balance:</span>
                    <span id="balance" style="color: #4ecdc4;">--</span>
                </div>
                <div style="display: flex; justify-content: space-between;">
                    <span>Recommended Stake:</span>
                    <span id="recommended-stake" style="color: #4ecdc4;">--</span>
                </div>
                <div style="display: flex; justify-content: space-between;">
                    <span>Daily Loss:</span>
                    <span id="daily-loss" style="color: #4ecdc4;">--</span>
                </div>
            </div>
            
            <div style="
                font-size: 10px;
                color: #888;
                border-top: 1px solid #444;
                padding-top: 5px;
            ">
                <div id="last-update">Last update: Never</div>
                <div id="model-info">Model: Not loaded</div>
                <div id="api-health" style="display: flex; justify-content: space-between; align-items: center;">
                    <span>API:</span>
                    <span id="api-status" style="color: #ff6b6b;">OFFLINE</span>
                </div>
                <div id="drift-status" style="display: flex; justify-content: space-between; align-items: center;">
                    <span>Drift:</span>
                    <span id="drift-indicator" style="color: #4ecdc4;">OK</span>
                </div>
                <div id="alerts-status" style="display: flex; justify-content: space-between; align-items: center;">
                    <span>Alerts:</span>
                    <span id="alerts-indicator" style="color: #4ecdc4;">OK</span>
                </div>
            </div>
        </div>
    `;

    // Add overlay to page
    function createOverlay() {
        if (document.getElementById(OVERLAY_ID)) {
            return; // Already exists
        }
        
        const overlay = document.createElement('div');
        overlay.innerHTML = overlayHTML;
        document.body.appendChild(overlay.firstElementChild);
        
        // Make draggable
        makeDraggable(document.getElementById(OVERLAY_ID));
    }

    // Make overlay draggable
    function makeDraggable(element) {
        let isDragging = false;
        let currentX;
        let currentY;
        let initialX;
        let initialY;
        let xOffset = 0;
        let yOffset = 0;

        element.addEventListener('mousedown', dragStart);
        document.addEventListener('mousemove', drag);
        document.addEventListener('mouseup', dragEnd);

        function dragStart(e) {
            initialX = e.clientX - xOffset;
            initialY = e.clientY - yOffset;

            if (e.target === element) {
                isDragging = true;
            }
        }

        function drag(e) {
            if (isDragging) {
                e.preventDefault();
                currentX = e.clientX - initialX;
                currentY = e.clientY - initialY;

                xOffset = currentX;
                yOffset = currentY;

                setTranslate(currentX, currentY, element);
            }
        }

        function setTranslate(xPos, yPos, el) {
            el.style.transform = `translate3d(${xPos}px, ${yPos}px, 0)`;
        }

        function dragEnd(e) {
            initialX = currentX;
            initialY = currentY;
            isDragging = false;
        }
    }

    // Extract game data from page
    function extractGameData() {
        try {
            // Try to find multiplier (this will need to be updated based on actual DOM structure)
            const multiplierElement = document.querySelector('[data-testid="multiplier"], .multiplier, #multiplier, .x-value');
            const multiplier = multiplierElement ? parseFloat(multiplierElement.textContent.replace(/[^\d.]/g, '')) : null;
            
            // Try to find timer
            const timerElement = document.querySelector('[data-testid="timer"], .timer, #timer, .countdown');
            const timer = timerElement ? timerElement.textContent : null;
            
            // Try to find players
            const playersElement = document.querySelector('[data-testid="players"], .players, #players, .player-count');
            const players = playersElement ? parseInt(playersElement.textContent.replace(/[^\d]/g, '')) : null;
            
            // Try to find wager
            const wagerElement = document.querySelector('[data-testid="total-wager"], .total-wager, #total-wager, .wager-amount');
            const wager = wagerElement ? parseFloat(wagerElement.textContent.replace(/[^\d.]/g, '')) : null;
            
            // Determine if game is live
            const liveIndicator = document.querySelector('[data-testid="live"], .live, .game-live, .active');
            const isLive = !!liveIndicator;
            
            return {
                multiplier,
                timer,
                players,
                wager,
                isLive,
                timestamp: Date.now()
            };
        } catch (error) {
            console.error('Error extracting game data:', error);
            return null;
        }
    }

    // Calculate time since round start (rough estimate)
    function estimateTimeSinceStart() {
        // This is a rough estimate - in a real implementation, you'd track round start time
        // For now, we'll use a placeholder
        return 30.0; // seconds
    }

    // Calculate slope (rate of change)
    function calculateSlope() {
        // This would need to track previous multiplier values
        // For now, return a placeholder
        return 0.1;
    }

    // Calculate volatility
    function calculateVolatility() {
        // This would need to track recent multiplier values
        // For now, return a placeholder
        return 0.05;
    }

    // Get prediction from API
    async function getPrediction() {
        const gameData = extractGameData();
        if (!gameData || !gameData.isLive) {
            return null;
        }

        // Prepare features for prediction
        const features = {
            x: gameData.multiplier || 1.0,
            t: estimateTimeSinceStart(),
            slope: calculateSlope(),
            vol: calculateVolatility(),
            players: gameData.players || 1000,
            wager: gameData.wager || 5000.0
        };

        try {
            const response = await fetch(`${API_SERVER}/predict`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(features)
            });

            if (response.ok) {
                return await response.json();
            } else {
                console.error('API error:', response.status, response.statusText);
                return null;
            }
        } catch (error) {
            console.error('Error fetching prediction:', error);
            return null;
        }
    }

    // Get bankroll status from API
    async function getBankrollStatus() {
        try {
            const response = await fetch(`${API_SERVER}/bankroll-status`);
            if (response.ok) {
                return await response.json();
            } else {
                console.error('Bankroll API error:', response.status, response.statusText);
                return null;
            }
        } catch (error) {
            console.error('Error fetching bankroll status:', error);
            return null;
        }
    }

    // Get API health status
    async function getAPIHealth() {
        try {
            const response = await fetch(`${API_SERVER}/health`);
            if (response.ok) {
                return await response.json();
            } else {
                return null;
            }
        } catch (error) {
            return null;
        }
    }

    // Get model information
    async function getModelInfo() {
        try {
            const response = await fetch(`${API_SERVER}/model-info`);
            if (response.ok) {
                return await response.json();
            } else {
                return null;
            }
        } catch (error) {
            return null;
        }
    }

    // Get available models
    async function getAvailableModels() {
        try {
            const response = await fetch(`${API_SERVER}/models`);
            if (response.ok) {
                return await response.json();
            } else {
                return null;
            }
        } catch (error) {
            return null;
        }
    }

    // Check for model drift
    function checkModelDrift(modelInfo, models) {
        if (!modelInfo || !models || models.length === 0) {
            return { isStale: false, daysOld: 0 };
        }

        const currentModel = models.find(m => m.is_current);
        if (!currentModel) {
            return { isStale: false, daysOld: 0 };
        }

        const trainedAt = new Date(currentModel.trained_at);
        const now = new Date();
        const daysOld = Math.floor((now - trainedAt) / (1000 * 60 * 60 * 24));

        // Consider model stale if older than 7 days
        const isStale = daysOld > 7;

        return { isStale, daysOld };
    }

    // Calculate recommended stake using Kelly criterion
    function calculateRecommendedStake(prediction, bankrollStatus) {
        if (!prediction || !bankrollStatus) {
            return null;
        }

        // Calculate edge (probability of winning)
        const p_rug_5s = prediction.p_rug_5s;
        const p_rug_10s = prediction.p_rug_10s;
        
        // Simple edge calculation: if rug probability is low, we have edge
        const edge = Math.max(0, 0.5 - (p_rug_5s + p_rug_10s) / 2);
        
        // Current odds (simplified - in reality you'd get this from the game)
        const currentMultiplier = extractGameData()?.multiplier || 1.0;
        const odds = currentMultiplier;
        
        // Kelly formula: f = (bp - q) / b
        // where b = odds - 1, p = probability of win, q = probability of loss
        const b = odds - 1;
        const p = edge;
        const q = 1 - edge;
        
        if (b <= 0 || p <= 0 || p >= 1) {
            return 0;
        }
        
        const kelly_fraction_raw = (b * p - q) / b;
        
        // Apply half-Kelly (more conservative)
        const kelly_fraction_actual = kelly_fraction_raw * 0.5;
        
        // Cap by maximum bet size (5% of balance)
        const bet_size_cap = 0.05;
        const bet_size = Math.min(Math.max(0, kelly_fraction_actual), bet_size_cap);
        
        return {
            percentage: bet_size * 100,
            amount: bankrollStatus.balance * bet_size,
            edge: edge,
            odds: odds
        };
    }

    // Determine action based on predictions
    function determineAction(prediction) {
        if (!prediction) return '--';
        
        const p5s = prediction.p_rug_5s;
        const p10s = prediction.p_rug_10s;
        
        if (p5s > 0.3) return 'CASH OUT!';
        if (p5s > 0.2) return 'TRIM';
        if (p10s > 0.4) return 'ARM SIDEBET';
        if (p5s < 0.1 && p10s < 0.2) return 'HOLD';
        
        return 'MONITOR';
    }

    // Update overlay display
    function updateOverlay(prediction, bankrollStatus, apiHealth, modelInfo, models) {
        const statusElement = document.getElementById('overlay-status');
        const risk5sElement = document.getElementById('risk-5s');
        const risk10sElement = document.getElementById('risk-10s');
        const actionElement = document.getElementById('action');
        const balanceElement = document.getElementById('balance');
        const recommendedStakeElement = document.getElementById('recommended-stake');
        const dailyLossElement = document.getElementById('daily-loss');
        const lastUpdateElement = document.getElementById('last-update');
        const modelInfoElement = document.getElementById('model-info');
        const apiStatusElement = document.getElementById('api-status');
        const driftIndicatorElement = document.getElementById('drift-indicator');
        const alertsIndicatorElement = document.getElementById('alerts-indicator');
        const overlayElement = document.getElementById(OVERLAY_ID);

        // Update API health status
        if (apiHealth) {
            apiStatusElement.textContent = 'ONLINE';
            apiStatusElement.style.color = '#4ecdc4';
        } else {
            apiStatusElement.textContent = 'OFFLINE';
            apiStatusElement.style.color = '#ff6b6b';
        }

        // Update model drift status
        const driftStatus = checkModelDrift(modelInfo, models);
        if (driftStatus.isStale) {
            driftIndicatorElement.textContent = `${driftStatus.daysOld}d OLD`;
            driftIndicatorElement.style.color = '#ffa502';
        } else {
            driftIndicatorElement.textContent = 'OK';
            driftIndicatorElement.style.color = '#4ecdc4';
        }

        // Update alerts status (placeholder - would need alerts endpoint)
        alertsIndicatorElement.textContent = 'OK';
        alertsIndicatorElement.style.color = '#4ecdc4';

        if (prediction && bankrollStatus) {
            // Update status
            statusElement.textContent = 'ONLINE';
            statusElement.style.color = '#4ecdc4';
            
            // Update risks
            const p5s = (prediction.p_rug_5s * 100).toFixed(1);
            const p10s = (prediction.p_rug_10s * 100).toFixed(1);
            
            risk5sElement.textContent = `${p5s}%`;
            risk10sElement.textContent = `${p10s}%`;
            
            // Color code risks
            if (prediction.p_rug_5s > 0.3) {
                risk5sElement.style.color = '#ff4757';
            } else if (prediction.p_rug_5s > 0.2) {
                risk5sElement.style.color = '#ffa502';
            } else {
                risk5sElement.style.color = '#4ecdc4';
            }
            
            if (prediction.p_rug_10s > 0.4) {
                risk10sElement.style.color = '#ff4757';
            } else if (prediction.p_rug_10s > 0.3) {
                risk10sElement.style.color = '#ffa502';
            } else {
                risk10sElement.style.color = '#4ecdc4';
            }
            
            // Update action
            const action = determineAction(prediction);
            actionElement.textContent = action;
            
            if (action === 'CASH OUT!') {
                actionElement.style.color = '#ff4757';
            } else if (action === 'TRIM') {
                actionElement.style.color = '#ffa502';
            } else {
                actionElement.style.color = '#4ecdc4';
            }
            
            // Update bankroll information
            balanceElement.textContent = `$${bankrollStatus.balance.toFixed(0)}`;
            
            // Calculate and display recommended stake
            const stakeInfo = calculateRecommendedStake(prediction, bankrollStatus);
            if (stakeInfo) {
                recommendedStakeElement.textContent = `$${stakeInfo.amount.toFixed(0)} (${stakeInfo.percentage.toFixed(1)}%)`;
                
                // Color code stake recommendation
                if (stakeInfo.percentage > 3) {
                    recommendedStakeElement.style.color = '#ff4757';
                } else if (stakeInfo.percentage > 1) {
                    recommendedStakeElement.style.color = '#ffa502';
                } else {
                    recommendedStakeElement.style.color = '#4ecdc4';
                }
            } else {
                recommendedStakeElement.textContent = '--';
            }
            
            // Update daily loss
            const dailyLossPct = bankrollStatus.daily_loss_pct;
            dailyLossElement.textContent = `${dailyLossPct.toFixed(1)}%`;
            
            // Color code daily loss
            if (dailyLossPct > 15) {
                dailyLossElement.style.color = '#ff4757';
            } else if (dailyLossPct > 10) {
                dailyLossElement.style.color = '#ffa502';
            } else {
                dailyLossElement.style.color = '#4ecdc4';
            }
            
            // Check if daily loss cap exceeded
            if (!bankrollStatus.can_bet) {
                // Turn overlay gray and show STOP warning
                overlayElement.style.background = 'rgba(128, 128, 128, 0.9)';
                overlayElement.style.border = '2px solid #ff4757';
                statusElement.textContent = 'STOP';
                statusElement.style.color = '#ff4757';
                actionElement.textContent = 'DAILY LOSS CAP';
                actionElement.style.color = '#ff4757';
            } else {
                // Reset overlay appearance
                overlayElement.style.background = 'rgba(0, 0, 0, 0.8)';
                overlayElement.style.border = '1px solid #333';
            }
            
            // Update metadata
            lastUpdateElement.textContent = `Last update: ${new Date().toLocaleTimeString()}`;
            if (modelInfo) {
                modelInfoElement.textContent = `Model: ${modelInfo.version || 'v1.0'}`;
            }
        } else {
            // Offline state
            statusElement.textContent = 'OFFLINE';
            statusElement.style.color = '#ff6b6b';
            risk5sElement.textContent = '--';
            risk10sElement.textContent = '--';
            actionElement.textContent = '--';
            balanceElement.textContent = '--';
            recommendedStakeElement.textContent = '--';
            dailyLossElement.textContent = '--';
            lastUpdateElement.textContent = 'Last update: Never';
            modelInfoElement.textContent = 'Model: Not loaded';
            
            // Reset overlay appearance
            overlayElement.style.background = 'rgba(0, 0, 0, 0.8)';
            overlayElement.style.border = '1px solid #333';
        }
    }

    // Main update loop
    async function updateLoop() {
        try {
            const [prediction, bankrollStatus, apiHealth, modelInfo, models] = await Promise.all([
                getPrediction(),
                getBankrollStatus(),
                getAPIHealth(),
                getModelInfo(),
                getAvailableModels()
            ]);
            updateOverlay(prediction, bankrollStatus, apiHealth, modelInfo, models);
        } catch (error) {
            console.error('Error in update loop:', error);
            updateOverlay(null, null, null, null, null);
        }
    }

    // Initialize overlay
    function init() {
        // Wait for page to load
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', init);
            return;
        }

        // Create overlay
        createOverlay();
        
        // Start update loop
        setInterval(updateLoop, UPDATE_INTERVAL);
        
        // Initial update
        updateLoop();
        
        console.log('Rugs Research Overlay initialized');
    }

    // Start initialization
    init();
})();
