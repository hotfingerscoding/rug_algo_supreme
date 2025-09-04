/**
 * Infer messages from WebSocket payload
 * Tries multiple parsing strategies in order
 */
export declare function inferMessages(payload: string | ArrayBuffer): Array<unknown>;
/**
 * Safe number extraction from various formats
 */
export declare function extractNumber(value: any): number | null;
/**
 * Safe string extraction
 */
export declare function extractString(value: any): string | null;
//# sourceMappingURL=decoder.d.ts.map