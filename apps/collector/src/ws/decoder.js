"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.inferMessages = inferMessages;
exports.extractNumber = extractNumber;
exports.extractString = extractString;
const shared_1 = require("@rugs-research/shared");
/**
 * Infer messages from WebSocket payload
 * Tries multiple parsing strategies in order
 */
function inferMessages(payload) {
    const timestamp = shared_1.timeUtils.now();
    // Convert ArrayBuffer to string if needed
    let payloadString;
    if (payload instanceof ArrayBuffer) {
        payloadString = new TextDecoder().decode(payload);
    }
    else {
        payloadString = payload;
    }
    // Strategy 1: Try JSON.parse for single JSON
    try {
        const parsed = JSON.parse(payloadString);
        return [parsed];
    }
    catch {
        // Not a single JSON, continue to next strategy
    }
    // Strategy 2: Try to split by newlines and parse each
    const lines = payloadString.split('\n').filter(line => line.trim());
    if (lines.length > 1) {
        const results = [];
        for (const line of lines) {
            try {
                const parsed = JSON.parse(line.trim());
                results.push(parsed);
            }
            catch {
                // Skip invalid JSON lines
            }
        }
        if (results.length > 0) {
            return results;
        }
    }
    // Strategy 3: Try to split by commas (for array-like structures)
    if (payloadString.includes(',') && !payloadString.startsWith('[')) {
        const parts = payloadString.split(',').map(part => part.trim());
        const results = [];
        for (const part of parts) {
            try {
                const parsed = JSON.parse(part);
                results.push(parsed);
            }
            catch {
                // Skip invalid JSON parts
            }
        }
        if (results.length > 0) {
            return results;
        }
    }
    // Strategy 4: Return as raw string if all else fails
    return [{ raw: payloadString }];
}
/**
 * Safe number extraction from various formats
 */
function extractNumber(value) {
    if (value === null || value === undefined) {
        return null;
    }
    if (typeof value === 'number') {
        return value;
    }
    if (typeof value === 'string') {
        // Remove non-numeric characters except decimal points and minus
        const numericString = value.replace(/[^\d.-]/g, '');
        const parsed = parseFloat(numericString);
        return isNaN(parsed) ? null : parsed;
    }
    return null;
}
/**
 * Safe string extraction
 */
function extractString(value) {
    if (value === null || value === undefined) {
        return null;
    }
    if (typeof value === 'string') {
        return value.trim() || null;
    }
    return String(value);
}
//# sourceMappingURL=decoder.js.map