import ValidationJob from '../models/ValidationJob.js';
import EmailResult from '../models/EmailResult.js';
import { validateBatch } from './validatorClient.js';
import env from '../config/env.js';
import { logger } from '../utils/logger.js';

/**
 * Job runner.
 *
 * Emails are stored in MongoDB at upload time (status "PENDING") so we never
 * hold large datasets in memory. Processing walks a cursor over the pending
 * rows in fixed-size batches, posts each batch to Python, then bulk-writes the
 * answers back and updates the job's progress counters.
 */

/** In-process registry so only one worker runs per job, per process. */
const runningJobs = new Map();

export function isJobRunning(jobId) {
  return runningJobs.has(String(jobId));
}

export function cancelJob(jobId) {
  const token = runningJobs.get(String(jobId));
  if (token) token.cancelled = true;
}

/** Run async tasks with bounded concurrency (never floods Python/DNS). */
async function mapWithConcurrency(items, limit, worker) {
  const queue = [...items];
  const runners = Array.from({ length: Math.max(1, Math.min(limit, queue.length)) }, async () => {
    while (queue.length) {
      const item = queue.shift();
      if (item === undefined) return;
      await worker(item);
    }
  });
  await Promise.all(runners);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Persist batch answers + roll counters up onto the job document. */
async function persistBatch(jobId, answers, token) {
  const bulkOps = answers.map((answer) => ({
    updateOne: {
      filter: { jobId, email: answer.email },
      update: {
        $set: {
          status: answer.status,
          syntaxValid: Boolean(answer.syntaxValid),
          domainValid: Boolean(answer.domainValid),
          mxFound: Boolean(answer.mxFound),
          disposable: Boolean(answer.disposable),
          roleAccount: Boolean(answer.roleAccount),
          mailboxVerification: answer.mailboxVerification || 'not_checked',
          reasons: Array.isArray(answer.reasons) ? answer.reasons : [],
          checkedAt: answer.checkedAt ? new Date(answer.checkedAt) : new Date(),
        },
      },
    },
  }));

  if (bulkOps.length) {
    await EmailResult.bulkWrite(bulkOps, { ordered: false });
  }

  // Roll counters up atomically so concurrent batches never drift.
  const inc = { processedEmails: answers.length };
  for (const answer of answers) {
    if (answer.status === 'VALID') inc.validCount = (inc.validCount || 0) + 1;
    else if (answer.status === 'INVALID') inc.invalidCount = (inc.invalidCount || 0) + 1;
    else if (answer.status === 'RISKY') inc.riskyCount = (inc.riskyCount || 0) + 1;
    else inc.unknownCount = (inc.unknownCount || 0) + 1;
  }

  const job = await ValidationJob.findByIdAndUpdate(jobId, { $inc: inc }, { new: true });
  if (job && job.uniqueEmails > 0) {
    const progress = Math.min(100, Math.round((job.processedEmails / job.uniqueEmails) * 100));
    await ValidationJob.updateOne({ _id: jobId }, { $set: { progress } });
  }
  if (token) token.processed = (token.processed || 0) + answers.length;
  return job;
}


/**
 * Process all PENDING results for a job.
 * Resumable: a retry simply re-runs this over whatever is still PENDING.
 */
export async function processJob(jobId) {
  const key = String(jobId);
  if (runningJobs.has(key)) return runningJobs.get(key);

  const token = { cancelled: false, processed: 0 };
  runningJobs.set(key, token);

  try {
    const job = await ValidationJob.findById(jobId);
    if (!job) throw new Error('Job not found.');
    if (job.status === 'completed') return token;

    await ValidationJob.updateOne(
      { _id: jobId },
      { $set: { status: 'running', error: null, startedAt: job.startedAt || new Date() } }
    );

    const batchSize = env.batchSize;
    let sweepPasses = 0;

    // Loop instead of recursing so the `finally` cleanup stays correct.
    // Normally one pass is enough; extra passes only run if rows were left.
    for (;;) {
      const cursor = EmailResult.find({ jobId, status: 'PENDING' })
        .select({ email: 1 })
        .sort({ _id: 1 })
        .lean()
        .cursor();

      let buffer = [];
      let pendingBatches = [];

      const flush = async () => {
        const batches = pendingBatches;
        pendingBatches = [];
        await mapWithConcurrency(batches, env.concurrency, async (emails) => {
          if (token.cancelled) return;
          const answers = await validateBatchWithRetry(emails);
          await persistBatch(jobId, answers, token);
        });
      };

      for await (const doc of cursor) {
        if (token.cancelled) break;
        buffer.push(doc.email);
        if (buffer.length >= batchSize) {
          pendingBatches.push(buffer);
          buffer = [];
          // Keep at most a couple of batches queued to bound memory.
          if (pendingBatches.length >= 2) await flush();
        }
      }
      if (buffer.length && !token.cancelled) pendingBatches.push(buffer);
      if (!token.cancelled) await flush();

      if (token.cancelled) break;

      // Defensive sweep: anything still PENDING means the cursor missed rows.
      const remaining = await EmailResult.countDocuments({ jobId, status: 'PENDING' });
      if (remaining === 0) break;

      sweepPasses += 1;
      if (sweepPasses >= 3) {
        logger.warn(`Job ${jobId} still had ${remaining} pending rows after 3 passes.`);
        break;
      }
      logger.warn(`Job ${jobId} had ${remaining} pending rows; sweep pass ${sweepPasses}.`);
    }

    if (token.cancelled) {
      await ValidationJob.updateOne({ _id: jobId }, { $set: { status: 'cancelled' } });
      return token;
    }

    const finalJob = await ValidationJob.findById(jobId).lean();
    await ValidationJob.updateOne(
      { _id: jobId },
      {
        $set: {
          status: 'completed',
          progress: 100,
          completedAt: new Date(),
          error: null,
          processedEmails: finalJob?.uniqueEmails ?? token.processed,
        },
      }
    );
    logger.info(`Job ${jobId} completed (${token.processed} emails).`);
    return token;
  } catch (err) {
    logger.error(`Job ${jobId} failed:`, err.message);
    await ValidationJob.updateOne(
      { _id: jobId },
      { $set: { status: 'failed', error: String(err.message || err).slice(0, 500) } }
    );
    throw err;
  } finally {
    runningJobs.delete(key);
  }
}

/** Retry a batch with exponential backoff before failing the job. */
async function validateBatchWithRetry(emails, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await validateBatch(emails);
    } catch (err) {
      lastError = err;
      const delay = 500 * 2 ** (attempt - 1);
      logger.warn(`Batch attempt ${attempt}/${attempts} failed: ${err.message} (retry in ${delay}ms)`);
      await sleep(delay);
    }
  }
  throw lastError;
}

/** Kick off processing without blocking the caller (used by start/retry routes). */
export function startJob(jobId) {
  processJob(jobId).catch((err) => logger.error('Background job error:', err.message));
}
