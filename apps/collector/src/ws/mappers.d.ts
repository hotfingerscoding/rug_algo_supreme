import { Event } from './types';
/**
 * Best-effort mapping of WebSocket objects to structured events
 * Uses heuristics to detect game-related fields
 */
export declare function mapToEvent(obj: any): Event;
/**
 * Batch process multiple objects into events
 */
export declare function mapToEvents(objects: Array<unknown>): Event[];
//# sourceMappingURL=mappers.d.ts.map