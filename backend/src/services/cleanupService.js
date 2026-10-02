import fs from 'node:fs';
import path from 'node:path';
import env from '../config/env.js';
import { logger } from '../utils/logger.js';

/**
 * Delete staged upload files older than UPLOAD_TTL_MS.
 * Completed jobs keep their parsed data in MongoDB, so the raw file is only
 * needed while a job is pending/running (for the manual column-selection path).
 */
export async function cleanupStaleUploads() {
  const dir = path.resolve(env.uploadDir);
  let entries;
  try {
    entries = await fs.promises.readdir(dir);
  } catch {
    return { removed: 0 };
  }

  const now = Date.now();
  let removed = 0;

  for (const name of entries) {
    if (name.startsWith('.')) continue;
    const full = path.join(dir, name);
    try {
      const stat = await fs.promises.stat(full);
      if (!stat.isFile()) continue;
      if (now - stat.mtimeMs > env.uploadTtlMs) {
        await fs.promises.unlink(full);
        removed += 1;
      }
    } catch {
      /* file vanished mid-cleanup; ignore */
    }
  }

  if (removed) logger.debug(`Cleanup removed ${removed} stale upload file(s).`);
  return { removed };
}
