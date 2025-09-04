/**
 * Selector utilities for the Selector Discovery Assistant
 * Computes CSS paths, simplifies them, and scores candidates
 */

export interface SelectorCandidate {
  selector: string;
  score: number;
  type: 'css' | 'text' | 'attribute' | 'data';
  specificity: number;
  stability: number;
  brevity: number;
}

export interface ElementInfo {
  tagName: string;
  className: string;
  id: string;
  textContent: string;
  attributes: Record<string, string>;
  dataAttributes: Record<string, string>;
  position: { x: number; y: number; width: number; height: number };
}

export function computeElementInfo(element: Element): ElementInfo {
  const rect = element.getBoundingClientRect();
  const attributes: Record<string, string> = {};
  const dataAttributes: Record<string, string> = {};
  
  // Get all attributes
  for (let i = 0; i < element.attributes.length; i++) {
    const attr = element.attributes[i];
    if (attr.name.startsWith('data-')) {
      dataAttributes[attr.name] = attr.value;
    } else {
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

export function generateCssPath(element: Element): string {
  const path: string[] = [];
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
        const stableClasses = classes.filter(c => 
          !c.match(/^[a-f0-9]{8,}$/) && // Avoid hash-like classes
          !c.match(/^[0-9]+$/) && // Avoid numeric-only classes
          c.length > 2 // Avoid very short classes
        );
        
        if (stableClasses.length > 0) {
          selector += `.${stableClasses.join('.')}`;
        } else {
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
    current = current.parentElement!;
  }
  
  return path.join(' > ');
}

export function generateTextBasedSelectors(element: Element): string[] {
  const text = element.textContent?.trim();
  if (!text || text.length < 3) return [];
  
  const selectors: string[] = [];
  
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

export function generateAttributeSelectors(element: Element): string[] {
  const selectors: string[] = [];
  
  // Data attributes (preferred)
  const htmlElement = element as HTMLElement;
  if (htmlElement.dataset) {
    for (const [key, value] of Object.entries(htmlElement.dataset)) {
      if (value && typeof value === 'string' && value.length < 50) { // Avoid very long values
        selectors.push(`[data-${key}="${value}"]`);
        selectors.push(`[data-${key}*="${value.substring(0, Math.min(20, value.length))}"]`);
      }
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

export function scoreSelector(selector: string, type: string): SelectorCandidate {
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
  } else if (length < 100) {
    brevity += 20;
    score += 10;
  } else {
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
    type: type as any,
    specificity,
    stability,
    brevity
  };
}

export function generateAllSelectors(element: Element): SelectorCandidate[] {
  const candidates: SelectorCandidate[] = [];
  
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

export function simplifySelector(selector: string): string {
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

export function validateSelector(selector: string): boolean {
  try {
    // Basic validation
    if (!selector || selector.length < 2) return false;
    
    // Check for balanced brackets
    const brackets = selector.match(/[\[\]]/g);
    if (brackets) {
      const open = brackets.filter(b => b === '[').length;
      const close = brackets.filter(b => b === ']').length;
      if (open !== close) return false;
    }
    
    // Check for balanced parentheses
    const parens = selector.match(/[()]/g);
    if (parens) {
      const open = parens.filter(p => p === '(').length;
      const close = parens.filter(p => p === ')').length;
      if (open !== close) return false;
    }
    
    return true;
  } catch {
    return false;
  }
}

export function getSelectorType(element: Element): string {
  if (element.id) return 'id';
  if (element.className && element.className.trim()) return 'class';
  const htmlElement = element as HTMLElement;
  if (htmlElement.dataset && Object.keys(htmlElement.dataset).length > 0) return 'data';
  if (element.textContent && element.textContent.trim().length > 3) return 'text';
  return 'position';
}
