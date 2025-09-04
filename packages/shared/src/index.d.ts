export declare class Logger {
    private logFile;
    private level;
    private enableFileLogging;
    constructor(logFile?: string, level?: string);
    private log;
    info(message: string, ...args: any[]): void;
    warn(message: string, ...args: any[]): void;
    error(message: string, ...args: any[]): void;
    debug(message: string, ...args: any[]): void;
    drift(message: string, ...args: any[]): void;
    driftWarning(message: string, ...args: any[]): void;
}
export declare const timeUtils: {
    now(): number;
    nowSeconds(): number;
    msToSeconds(ms: number): number;
    secondsToMs(seconds: number): number;
    formatDuration(ms: number): string;
};
export declare class SQLiteHelper {
    private db;
    private logger;
    constructor(dbPath: string, logger?: Logger);
    setupTables(): Promise<void>;
    insertRound(round: any): number;
    insertTick(tick: any): void;
    insertWSFrame(frame: any): void;
    insertEvent(event: any): void;
    insertSidebetWindows(roundId: number, windows: any[]): void;
    updateRound(roundId: number, updates: any): void;
    getRounds(): any[];
    getTicks(roundId?: number): any[];
    getWSFrames(): any[];
    getEvents(): any[];
    getSidebetWindows(): any[];
    close(): void;
}
export declare class Config {
    private static instance;
    private config;
    private constructor();
    static getInstance(): Config;
    get(key: string): any;
    getAll(): Record<string, any>;
}
export * from './migrations';
export * from './alert';
export declare const logger: Logger;
export declare const config: Config;
//# sourceMappingURL=index.d.ts.map