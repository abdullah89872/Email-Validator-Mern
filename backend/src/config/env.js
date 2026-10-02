import 'dotenv/config';

const toInt = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: toInt(process.env.PORT, 5000),
  mongoUri: process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/emailclean',
  validatorUrl: (process.env.VALIDATOR_URL || 'http://127.0.0.1:8000').replace(/\/+$/, ''),
  corsOrigins: (process.env.CORS_ORIGIN || 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  uploadDir: process.env.UPLOAD_DIR || './uploads',
  maxFileSize: toInt(process.env.MAX_FILE_SIZE, 20 * 1024 * 1024),
  batchSize: toInt(process.env.VALIDATION_BATCH_SIZE, 100),
  concurrency: toInt(process.env.VALIDATION_CONCURRENCY, 4),
  validatorTimeoutMs: toInt(process.env.VALIDATOR_TIMEOUT_MS, 30000),
  uploadTtlMs: toInt(process.env.UPLOAD_TTL_MS, 60 * 60 * 1000),
  rateLimitWindowMs: toInt(process.env.RATE_LIMIT_WINDOW_MS, 60000),
  rateLimitMax: toInt(process.env.RATE_LIMIT_MAX, 300),
  aiApiKey: process.env.AI_API_KEY || '',
  aiModel: process.env.AI_MODEL || 'gpt-4o-mini',
};

export default env;
