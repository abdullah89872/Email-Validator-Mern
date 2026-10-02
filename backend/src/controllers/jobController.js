import fs from 'node:fs';
import path from 'node:path';
import mongoose from 'mongoose';
import ValidationJob from '../models/ValidationJob.js';
import EmailResult from '../models/EmailResult.js';
import {
  parseSpreadsheet, extractEmails, removeFile, sanitizeDisplayFilename,
} from '../services/fileService.js';
import { startJob, isJobRunning } from '../services/jobRunner.js';
import { streamResultsCsv } from '../services/downloadService.js';
import { pingValidator } from '../services/validatorClient.js';
import { uploadDir } from '../middleware/upload.js';
import { asyncHandler, HttpError } from '../middleware/errors.js';
import { logger } from '../utils/logger.js';
import env from '../config/env.js';

const isId = (value) => mongoose.Types.ObjectId.isValid(value);

/** Cap on how many unique emails a single upload may enqueue. */
const MAX_UNIQUE_EMAILS = 500000;

const stagedPath = (job) => (job.storedName ? path.join(uploadDir, job.storedName) : null);

async function loadJob(req) {
  const { jobId } = req.params;
  if (!isId(jobId)) throw new HttpError(400, 'Invalid job id.');
  const job = await ValidationJob.findById(jobId);
  if (!job) throw new HttpError(404, 'Job not found.');
  return job;
}

/**
 * Insert PENDING result rows in chunks so a 200k-row file never becomes one
 * giant insertMany payload.
 */
async function persistEmails(jobId, emails) {
  const CHUNK = 1000;
  for (let i = 0; i < emails.length; i += CHUNK) {
    const docs = emails.slice(i, i + CHUNK).map((email) => ({ jobId, email, status: 'PENDING' }));
    await EmailResult.insertMany(docs, { ordered: false });
  }
}

/** Recompute job counters from stored rows (used by retry). */
async function recountJob(jobId) {
  const rows = await EmailResult.aggregate([
    { $match: { jobId: new mongoose.Types.ObjectId(String(jobId)) } },
    { $group: { _id: '$status', count: { $sum: 1 } } },
  ]);
  const byStatus = Object.fromEntries(rows.map((r) => [r._id, r.count]));
  const done = (byStatus.VALID || 0) + (byStatus.INVALID || 0)
    + (byStatus.RISKY || 0) + (byStatus.UNKNOWN || 0) + (byStatus.ERROR || 0);
  await ValidationJob.updateOne({ _id: jobId }, {
    $set: {
      validCount: byStatus.VALID || 0,
      invalidCount: byStatus.INVALID || 0,
      riskyCount: byStatus.RISKY || 0,
      unknownCount: byStatus.UNKNOWN || 0,
      processedEmails: done,
    },
  });
  return byStatus;
}

// ---------------------------------------------------------------------------
// POST /api/jobs/upload
// ---------------------------------------------------------------------------
export const uploadJob = asyncHandler(async (req, res) => {
  if (!req.file) throw new HttpError(400, 'No file uploaded. Send a CSV, XLS, or XLSX file.');

  const filePath = req.file.path;
  let parsed;
  try {
    parsed = parseSpreadsheet(filePath);
  } catch (err) {
    await removeFile(filePath);
    throw new HttpError(400, `Could not read file: ${err.message}`);
  }

  const { headers, dataRows, detection } = parsed;
  const requestedColumn = req.body?.emailColumn;

  // Allow the client to nominate the column at upload time.
  let columnIndex = detection.index;
  if (requestedColumn !== undefined && requestedColumn !== null && requestedColumn !== '') {
    const idx = Number(requestedColumn);
    if (!Number.isInteger(idx) || idx < 0 || idx >= headers.length) {
      await removeFile(filePath);
      throw new HttpError(400, `Column index out of range: ${requestedColumn}`);
    }
    columnIndex = idx;
  }

  const job = await ValidationJob.create({
    filename: sanitizeDisplayFilename(req.file.originalname),
    originalName: sanitizeDisplayFilename(req.file.originalname),
    storedName: req.file.filename,
    columns: headers,
    emailColumn: columnIndex >= 0 ? headers[columnIndex] : null,
    status: 'pending',
    progress: 0,
  });

  // Detection failed and no column was given: ask the client to choose.
  if (columnIndex < 0) {
    return res.status(201).json({
      success: true,
      needsColumnSelection: true,
      detection,
      job,
      message: 'No email column detected. Choose a column and start the job.',
    });
  }

  const { uniqueEmails, totalEmails, duplicateCount, malformedCount } =
    extractEmails(dataRows, columnIndex);

  if (uniqueEmails.length === 0) {
    await removeFile(filePath);
    await ValidationJob.deleteOne({ _id: job._id });
    throw new HttpError(400, 'No email addresses were found in the selected column.');
  }
  if (uniqueEmails.length > MAX_UNIQUE_EMAILS) {
    await removeFile(filePath);
    await ValidationJob.deleteOne({ _id: job._id });
    throw new HttpError(413, `Too many emails (limit ${MAX_UNIQUE_EMAILS.toLocaleString()}).`);
  }

  await persistEmails(job._id, uniqueEmails);

  const updated = await ValidationJob.findByIdAndUpdate(
    job._id,
    {
      $set: {
        emailColumn: headers[columnIndex],
        totalEmails,
        uniqueEmails: uniqueEmails.length,
        duplicateCount,
        progress: 0,
      },
    },
    { new: true }
  );

  logger.info(`Uploaded "${updated.originalName}": ${uniqueEmails.length} unique emails.`);

  return res.status(201).json({
    success: true,
    needsColumnSelection: false,
    malformedCount,
    detection: { ...detection, index: columnIndex, header: headers[columnIndex] },
    job: updated,
  });
});

// ---------------------------------------------------------------------------
// POST /api/jobs/:jobId/start  (body: { emailColumn?: number })
// ---------------------------------------------------------------------------
export const startJobRoute = asyncHandler(async (req, res) => {
  const job = await loadJob(req);
  if (isJobRunning(job._id)) throw new HttpError(409, 'Job is already running.');
  if (job.status === 'completed') throw new HttpError(409, 'Job already completed.');

  // Lazy case: upload could not detect a column, so emails were never extracted.
  if (job.uniqueEmails === 0) {
    const idx = Number(req.body?.emailColumn);
    const filePath = stagedPath(job);
    if (!Number.isInteger(idx) || idx < 0) {
      throw new HttpError(400, 'emailColumn index is required to start this job.');
    }
    if (!filePath || !fs.existsSync(filePath)) {
      throw new HttpError(410, 'The uploaded file is no longer available. Please upload again.');
    }
    if (idx >= job.columns.length) throw new HttpError(400, 'Column index out of range.');

    const parsed = parseSpreadsheet(filePath);
    const { uniqueEmails, totalEmails, duplicateCount } = extractEmails(parsed.dataRows, idx);
    if (!uniqueEmails.length) throw new HttpError(400, 'No emails found in that column.');
    if (uniqueEmails.length > MAX_UNIQUE_EMAILS) {
      throw new HttpError(413, `Too many emails (limit ${MAX_UNIQUE_EMAILS.toLocaleString()}).`);
    }

    await persistEmails(job._id, uniqueEmails);
    job.totalEmails = totalEmails;
    job.uniqueEmails = uniqueEmails.length;
    job.duplicateCount = duplicateCount;
    job.emailColumn = job.columns[idx];
    await job.save();
  }

  startJob(job._id);
  const fresh = await ValidationJob.findById(job._id);
  res.json({ success: true, job: fresh });
});

// ---------------------------------------------------------------------------
// GET /api/jobs
// ---------------------------------------------------------------------------
export const listJobs = asyncHandler(async (req, res) => {
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 10));
  const filter = {};
  if (req.query.status) {
    const allowed = ['pending', 'running', 'completed', 'failed', 'cancelled'];
    if (!allowed.includes(req.query.status)) throw new HttpError(400, 'Invalid status filter.');
    filter.status = req.query.status;
  }
  if (req.query.q) {
    filter.originalName = { $regex: String(req.query.q).slice(0, 120).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
  }

  const [items, total] = await Promise.all([
    ValidationJob.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    ValidationJob.countDocuments(filter),
  ]);

  res.json({
    success: true,
    jobs: items,
    pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
  });
});

// ---------------------------------------------------------------------------
// GET /api/jobs/:jobId
// ---------------------------------------------------------------------------
export const getJob = asyncHandler(async (req, res) => {
  const job = await loadJob(req);
  res.json({ success: true, job, running: isJobRunning(job._id) });
});

// ---------------------------------------------------------------------------
// GET /api/jobs/:jobId/results?page&limit&status&q&disposable&roleAccount
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// DELETE /api/jobs/:jobId
// ---------------------------------------------------------------------------
export const deleteJob = asyncHandler(async (req, res) => {
  const job = await loadJob(req);
  if (isJobRunning(job._id)) throw new HttpError(409, 'Cannot delete a running job.');

  await Promise.all([
    EmailResult.deleteMany({ jobId: job._id }),
    ValidationJob.deleteOne({ _id: job._id }),
  ]);
  if (job.storedName) await removeFile(path.join(uploadDir, job.storedName));

  res.json({ success: true, deleted: job._id });
});

// ---------------------------------------------------------------------------
// POST /api/jobs/:jobId/retry
// ---------------------------------------------------------------------------
export const retryJob = asyncHandler(async (req, res) => {
  const job = await loadJob(req);
  if (isJobRunning(job._id)) throw new HttpError(409, 'Job is already running.');
  if (job.status === 'completed') {
    throw new HttpError(409, 'Job already completed. Delete and re-upload to run again.');
  }
  if (job.uniqueEmails === 0) throw new HttpError(400, 'This job has no emails queued. Start it first.');

  // Reset ERROR rows to PENDING so they get another attempt, then recount.
  await EmailResult.updateMany(
    { jobId: job._id, status: 'ERROR' },
    { $set: { status: 'PENDING', reasons: [] } }
  );
  await recountJob(job._id);
  await ValidationJob.updateOne(
    { _id: job._id },
    { $set: { status: 'pending', error: null, completedAt: null }, $unset: { startedAt: '' } }
  );

  startJob(job._id);
  const fresh = await ValidationJob.findById(job._id);
  res.json({ success: true, job: fresh });
});

// ---------------------------------------------------------------------------
// GET /api/jobs/:jobId/download/:kind
// ---------------------------------------------------------------------------
const DOWNLOAD_KINDS = { valid: 'VALID', invalid: 'INVALID', risky: 'RISKY', unknown: 'UNKNOWN', all: null };

export const downloadResults = asyncHandler(async (req, res) => {
  const job = await loadJob(req);
  const kind = String(req.params.kind || '').toLowerCase();
  if (!(kind in DOWNLOAD_KINDS)) throw new HttpError(404, 'Unknown download type.');

  const base = (job.originalName || 'results').replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '_') || 'results';
  await streamResultsCsv(res, job._id, DOWNLOAD_KINDS[kind], `${base}-${kind}.csv`);
});

// ---------------------------------------------------------------------------
// GET /api/health
// ---------------------------------------------------------------------------
export const health = asyncHandler(async (_req, res) => {
  const validatorUp = await pingValidator({ ttlMs: 3000 });
  res.json({
    status: 'ok',
    service: 'emailclean-ai-api',
    time: new Date().toISOString(),
    mongo: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    validator: validatorUp ? 'up' : 'down',
    version: '1.0.0',
  });
});

export const getResults = asyncHandler(async (req, res) => {
  const job = await loadJob(req);
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const limit = Math.min(200, Math.max(1, Number.parseInt(req.query.limit, 10) || 25));

  const filter = { jobId: job._id };
  if (req.query.status) {
    const allowed = ['VALID', 'INVALID', 'RISKY', 'UNKNOWN', 'PENDING', 'ERROR'];
    const status = String(req.query.status).toUpperCase();
    if (!allowed.includes(status)) throw new HttpError(400, 'Invalid status filter.');
    filter.status = status;
  }
  if (req.query.q) {
    // Escape regex metacharacters so user input can't blow up the query.
    const safe = String(req.query.q).slice(0, 200).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.email = { $regex: safe, $options: 'i' };
  }
  if (req.query.disposable === 'true') filter.disposable = true;
  if (req.query.disposable === 'false') filter.disposable = false;
  if (req.query.roleAccount === 'true') filter.roleAccount = true;

  const [items, total] = await Promise.all([
    EmailResult.find(filter).sort({ _id: 1 }).skip((page - 1) * limit).limit(limit).lean(),
    EmailResult.countDocuments(filter),
  ]);

  res.json({
    success: true,
    jobId: job._id,
    counts: {
      total: job.uniqueEmails,
      valid: job.validCount,
      invalid: job.invalidCount,
      risky: job.riskyCount,
      unknown: job.unknownCount,
      pending: Math.max(0, job.uniqueEmails - job.processedEmails),
    },
    results: items,
    pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
  });
});

