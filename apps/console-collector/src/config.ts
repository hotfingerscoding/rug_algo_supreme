import { z } from 'zod';
import { join } from 'path';

// Configuration schema with validation
const configSchema = z.object({
  // Event source preference
  EVENT_SOURCE: z.enum(['ws', 'console', 'both']).default('ws'),
  
  // Round boundary detection
  ROUND_INACTIVITY_S: z.coerce.number().min(30).max(600).default(90),
  
  // Storage retention
  RETENTION_DAYS: z.coerce.number().min(1).max(365).default(14),
  MAX_JSONL_MB: z.coerce.number().min(10).max(1000).default(200),
  
  // File paths
  DATA_DIR: z.string().default(join(__dirname, '../../../data')),
  DB_NAME: z.string().default('console_rounds.sqlite'),
  JSONL_PREFIX: z.string().default('console_rounds'),
  
  // Logging
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  
  // Performance
  HEARTBEAT_INTERVAL_MS: z.coerce.number().min(10000).max(60000).default(30000),
});

// Parse and validate configuration
const config = configSchema.parse(process.env);

// Export typed configuration
export default config;

// Helper functions
export const getDbPath = () => join(config.DATA_DIR, config.DB_NAME);
export const getJsonlPath = () => join(config.DATA_DIR, `${config.JSONL_PREFIX}.jsonl`);
export const getJsonlRotatedPath = (date: string, increment: number) => 
  join(config.DATA_DIR, `${config.JSONL_PREFIX}_${date}_${increment.toString().padStart(2, '0')}.jsonl`);

// Log level utilities
export const isDebugEnabled = () => config.LOG_LEVEL === 'debug';
export const isInfoEnabled = () => ['debug', 'info'].includes(config.LOG_LEVEL);
export const isWarnEnabled = () => ['debug', 'info', 'warn'].includes(config.LOG_LEVEL);
export const isErrorEnabled = () => true; // Always log errors
