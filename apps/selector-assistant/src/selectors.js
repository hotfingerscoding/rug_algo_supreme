"use strict";
/**
 * Selector utilities for the Selector Discovery Assistant
 * Computes CSS paths, simplifies them, and scores candidates
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.computeElementInfo = computeElementInfo;
exports.generateCssPath = generateCssPath;
exports.generateTextBasedSelectors = generateTextBasedSelectors;
exports.generateAttributeSelectors = generateAttributeSelectors;
exports.scoreSelector = scoreSelector;
exports.generateAllSelectors = generateAllSelectors;
exports.simplifySelector = simplifySelector;
exports.validateSelector = validateSelector;
exports.getSelectorType = getSelectorType;
function computeElementInfo(element) {
    const rect = element.getBoundingClientRect();
    const attributes = {};
    const dataAttributes = {};
    // Get all attributes
    for (let i = 0; i < element.attributes.length; i++) {
        const attr = element.attributes[i];
        if (attr.name.startsWith('data-')) {
            dataAttributes[attr.name] = attr.value;
        }
        else {
            attributes[attr.name] = attr.value;
        }
    }
    return {
        tagName: element.tagName.toLowerCase(),
        className: element.className,
        id: element.id,
        textContent: element.textContent?.trim() || '',
        attributes,
        dataAttributes,
        position: {
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height
        }
    };
}
function generateCssPath(element) {
    const path = [];
    let current = element;
    while (current && current !== document.body) {
        let selector = current.tagName.toLowerCase();
        // Add ID if present
        if (current.id) {
            selector += `#${current.id}`;
            path.unshift(selector);
            break; // ID should be unique
        }
        // Add classes if present
        if (current.className) {
            const classes = current.className.split(' ').filter(c => c.trim());
            if (classes.length > 0) {
                // Prefer stable class names (avoid generated ones)
                const stableClasses = classes.filter(c => !c.match(/^[a-f0-9]{8,}$/) && // Avoid hash-like classes
                    !c.match(/^[0-9]+$/) && // Avoid numeric-only classes
                    c.length > 2 // Avoid very short classes
                );
                if (stableClasses.length > 0) {
                    selector += `.${stableClasses.join('.')}`;
                }
                else {
                    selector += `.${classes.join('.')}`;
                }
            }
        }
        // Add position if no unique identifier
        if (!current.id && !current.className) {
            const siblings = Array.from(current.parentElement?.children || []);
            const index = siblings.indexOf(current);
            if (index > 0) {
                selector += `:nth-child(${index + 1})`;
            }
        }
        path.unshift(selector);
        current = current.parentElement;
    }
    return path.join(' > ');
}
function generateTextBasedSelectors(element) {
    const text = element.textContent?.trim();
    if (!text || text.length < 3)
        return [];
    const selectors = [];
    // Simple text selector
    selectors.push(`:has-text("${text}")`);
    // Partial text selector (first 10 chars)
    if (text.length > 10) {
        selectors.push(`:has-text("${text.substring(0, 10)}")`);
    }
    // Text with tag
    selectors.push(`${element.tagName.toLowerCase()}:has-text("${text}")`);
    return selectors;
}
function generateAttributeSelectors(element) {
    const selectors = [];
    // Data attributes (preferred)
    for (const [key, value] of Object.entries(element.dataset)) {
        if (value && value.length < 50) { // Avoid very long values
            selectors.push(`[data-${key}="${value}"]`);
            selectors.push(`[data-${key}*="${value.substring(0, Math.min(20, value.length))}"]`);
        }
    }
    // Other useful attributes
    const usefulAttrs = ['name', 'title', 'alt', 'aria-label', 'role'];
    for (const attr of usefulAttrs) {
        const value = element.getAttribute(attr);
        if (value && value.length < 50) {
            selectors.push(`[${attr}="${value}"]`);
        }
    }
    return selectors;
}
function scoreSelector(selector, type) {
    let score = 0;
    let specificity = 0;
    let stability = 0;
    let brevity = 0;
    // Base score by type
    switch (type) {
        case 'data':
            score += 100; // Data attributes are most stable
            break;
        case 'attribute':
            score += 80;
            break;
        case 'css':
            score += 60;
            break;
        case 'text':
            score += 40; // Text can change
            break;
    }
    // Specificity scoring
    if (selector.includes('#')) {
        specificity += 50; // ID is very specific
        score += 30;
    }
    if (selector.includes('.')) {
        specificity += 20; // Class is good
        score += 20;
    }
    if (selector.includes(':nth-child')) {
        specificity += 10; // Position-based, less stable
        score -= 10;
    }
    if (selector.includes('>')) {
        specificity += 15; // Direct child is specific
        score += 15;
    }
    // Stability scoring
    if (selector.includes('data-')) {
        stability += 50; // Data attributes are very stable
        score += 40;
    }
    if (selector.includes('id=')) {
        stability += 40; // IDs are stable
        score += 30;
    }
    if (selector.includes('class=')) {
        stability += 20; // Classes can change but are usually stable
        score += 15;
    }
    if (selector.includes(':has-text')) {
        stability -= 20; // Text can change
        score -= 15;
    }
    // Brevity scoring
    const length = selector.length;
    if (length < 50) {
        brevity += 30;
        score += 20;
    }
    else if (length < 100) {
        brevity += 20;
        score += 10;
    }
    else {
        brevity += 10;
        score += 5;
    }
    // Penalize very long selectors
    if (length > 200) {
        score -= 20;
    }
    // Penalize complex selectors
    if (selector.split('>').length > 5) {
        score -= 15;
    }
    return {
        selector,
        score: Math.max(0, score),
        type: type,
        specificity,
        stability,
        brevity
    };
}
function generateAllSelectors(element) {
    const candidates = [];
    // CSS path
    const cssPath = generateCssPath(element);
    candidates.push(scoreSelector(cssPath, 'css'));
    // Text-based selectors
    const textSelectors = generateTextBasedSelectors(element);
    textSelectors.forEach(selector => {
        candidates.push(scoreSelector(selector, 'text'));
    });
    // Attribute selectors
    const attrSelectors = generateAttributeSelectors(element);
    attrSelectors.forEach(selector => {
        candidates.push(scoreSelector(selector, 'attribute'));
    });
    // Data attribute selectors (already included in attribute, but prioritize)
    const dataSelectors = attrSelectors.filter(s => s.includes('data-'));
    dataSelectors.forEach(selector => {
        const candidate = scoreSelector(selector, 'data');
        candidate.score += 20; // Bonus for data attributes
        candidates.push(candidate);
    });
    // Sort by score (highest first)
    return candidates.sort((a, b) => b.score - a.score);
}
function simplifySelector(selector) {
    // Remove unnecessary parts
    let simplified = selector;
    // Remove nth-child if we have better identifiers
    if (selector.includes(':nth-child') && (selector.includes('#') || selector.includes('[data-') || selector.includes('.') && selector.split('.').length > 1)) {
        simplified = simplified.replace(/:nth-child\(\d+\)/g, '');
    }
    // Remove very specific parts if we have unique identifiers
    if (selector.includes('#') && selector.split('>').length > 3) {
        const parts = selector.split(' > ');
        const idPart = parts.find(p => p.includes('#'));
        if (idPart) {
            simplified = idPart;
        }
    }
    // Clean up extra whitespace
    simplified = simplified.replace(/\s*>\s*/g, ' > ');
    return simplified;
}
function validateSelector(selector) {
    try {
        // Basic validation
        if (!selector || selector.length < 2)
            return false;
        // Check for balanced brackets
        const brackets = selector.match(/[\[\]]/g);
        if (brackets) {
            const open = brackets.filter(b => b === '[').length;
            const close = brackets.filter(b => b === ']').length;
            if (open !== close)
                return false;
        }
        // Check for balanced parentheses
        const parens = selector.match(/[()]/g);
        if (parens) {
            const open = parens.filter(p => p === '(').length;
            const close = parens.filter(p => p === ')').length;
            if (open !== close)
                return false;
        }
        return true;
    }
    catch {
        return false;
    }
}
function getSelectorType(element) {
    if (element.id)
        return 'id';
    if (element.className && element.className.trim())
        return 'class';
    if (Object.keys(element.dataset).length > 0)
        return 'data';
    if (element.textContent && element.textContent.trim().length > 3)
        return 'text';
    return 'position';
}
//# sourceMappingURL=selectors.js.map