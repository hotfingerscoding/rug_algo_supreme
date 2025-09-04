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
    position: {
        x: number;
        y: number;
        width: number;
        height: number;
    };
}
export declare function computeElementInfo(element: Element): ElementInfo;
export declare function generateCssPath(element: Element): string;
export declare function generateTextBasedSelectors(element: Element): string[];
export declare function generateAttributeSelectors(element: Element): string[];
export declare function scoreSelector(selector: string, type: string): SelectorCandidate;
export declare function generateAllSelectors(element: Element): SelectorCandidate[];
export declare function simplifySelector(selector: string): string;
export declare function validateSelector(selector: string): boolean;
export declare function getSelectorType(element: Element): string;
//# sourceMappingURL=selectors.d.ts.map