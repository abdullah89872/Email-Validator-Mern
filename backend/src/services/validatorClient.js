import axios from 'axios';
import env from '../config/env.js';
import { logger } from '../utils/logger.js';

/**
 * Thin client for the Python FastAPI validation service.
 * React never talks to Python directly — only this module does.
 */
const client = axios.create({
  baseURL: env.validatorUrl,
  timeout: env.validatorTimeoutMs,
  headers: { 'Content-Type': 'application/json' },
});

let serviceAvailable = null;
let lastCheckedAt = 0;

export async function pingValidator({ ttlMs = 5000 } = {}) {
  const now = Date.now();
  if (serviceAvailable !== null && now - lastCheckedAt < ttlMs) {
    return serviceAvailable;
  }
  try {
    const { data } = await client.get('/health', { timeout: 3000 });
    serviceAvailable = Boolean(data?.status === 'ok');
  } catch (err) {
    serviceAvailable = false;
    logger.debug('Validator unreachable:', err.message);
  }
  lastCheckedAt = now;
  return serviceAvailable;
}

export function resetValidatorCache() {
  serviceAvailable = null;
  lastCheckedAt = 0;
}

/**
 * Validate one batch of emails against Python.
 * Throws on transport errors so the job runner can retry/backoff.
 */
export async function validateBatch(emails) {
  if (!emails.length) return [];
  const { data } = await client.post('/validate/batch', { emails });
  const results = Array.isArray(data?.results) ? data.results : [];
  if (results.length !== emails.length) {
    logger.warn(`Validator returned ${results.length} results for ${emails.length} emails`);
  }
  return results;
}
