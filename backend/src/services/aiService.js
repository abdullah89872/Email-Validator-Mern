import axios from 'axios';
import mongoose from 'mongoose';
import ValidationJob from '../models/ValidationJob.js';
import EmailResult from '../models/EmailResult.js';
import env from '../config/env.js';
import { HttpError } from '../middleware/errors.js';

/**
 * OPTIONAL AI assistant layer.
 *
 * Every tool below reads real MongoDB data and returns it verbatim. Nothing
 * here is used by the validation pipeline — validation works with or without
 * an AI key. The contract for a future assistant is: call a tool, then answer
 * ONLY from the returned payload. Never invent counts or reasons.
 */

const isId = (v) => mongoose.Types.ObjectId.isValid(v);

async function resolveJob(jobId) {
  if (!jobId) {
    const latest = await ValidationJob.findOne().sort({ createdAt: -1 }).lean();
    if (!latest) throw new HttpError(404, 'No jobs exist yet.');
    return latest;
  }
  if (!isId(jobId)) throw new HttpError(400, 'Invalid job id.');
  const job = await ValidationJob.findById(jobId).lean();
  if (!job) throw new HttpError(404, 'Job not found.');
  return job;
}

/** "How many valid emails are in my latest job?" */
export async function getJobSummary(jobId) {
  const job = await resolveJob(jobId);
  return {
    jobId: job._id,
    filename: job.originalName,
    status: job.status,
    progress: job.progress,
    totalEmails: job.totalEmails,
    uniqueEmails: job.uniqueEmails,
    duplicateCount: job.duplicateCount,
    processedEmails: job.processedEmails,
    counts: {
      valid: job.validCount,
      invalid: job.invalidCount,
      risky: job.riskyCount,
      unknown: job.unknownCount,
    },
    createdAt: job.createdAt,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
    error: job.error,
    note: 'Counts come directly from the ValidationJob document.',
  };
}

/** Page through real result rows with optional filters. */
export async function getJobResults(jobId, { status, search, limit = 25, page = 1 } = {}) {
  const job = await resolveJob(jobId);
  const safeLimit = Math.min(200, Math.max(1, Number(limit) || 25));
  const safePage = Math.max(1, Number(page) || 1);

  const filter = { jobId: job._id };
  if (status) filter.status = String(status).toUpperCase();
  if (search) {
    const safe = String(search).slice(0, 200).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.email = { $regex: safe, $options: 'i' };
  }

  const [items, total] = await Promise.all([
    EmailResult.find(filter).sort({ _id: 1 }).skip((safePage - 1) * safeLimit)
      .limit(safeLimit).lean(),
    EmailResult.countDocuments(filter),
  ]);

  return {
    jobId: job._id,
    total,
    page: safePage,
    limit: safeLimit,
    totalPages: Math.max(1, Math.ceil(total / safeLimit)),
    results: items,
  };
}

/** Dashboard "recent jobs" list. */
export async function getRecentJobs({ limit = 10 } = {}) {
  const safeLimit = Math.min(50, Math.max(1, Number(limit) || 10));
  const jobs = await ValidationJob.find().sort({ createdAt: -1 }).limit(safeLimit).lean();
  return { count: jobs.length, jobs };
}

/** Cross-job totals for the dashboard tiles. */
export async function getValidationStatistics() {
  const [jobAgg, resultAgg] = await Promise.all([
    ValidationJob.aggregate([
      {
        $group: {
          _id: null,
          totalJobs: { $sum: 1 },
          emailsProcessed: { $sum: '$processedEmails' },
          valid: { $sum: '$validCount' },
          invalid: { $sum: '$invalidCount' },
          risky: { $sum: '$riskyCount' },
          unknown: { $sum: '$unknownCount' },
          duplicates: { $sum: '$duplicateCount' },
        },
      },
    ]),
    EmailResult.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          disposable: { $sum: { $cond: ['$disposable', 1, 0] } },
          roleAccount: { $sum: { $cond: ['$roleAccount', 1, 0] } },
        },
      },
    ]),
  ]);

  return {
    totals: jobAgg[0] || {
      totalJobs: 0, emailsProcessed: 0, valid: 0,
      invalid: 0, risky: 0, unknown: 0, duplicates: 0,
    },
    byStatus: resultAgg.map((r) => ({
      status: r._id, count: r.count, disposable: r.disposable, roleAccount: r.roleAccount,
    })),
  };
}

/**
 * "Why were these emails marked risky?" / "Summarize this validation job."
 * Samples real rows so the assistant can quote genuine reasons.
 */
export async function generateReport(jobId, { sampleSize = 20 } = {}) {
  const job = await resolveJob(jobId);
  const size = Math.min(100, Math.max(1, Number(sampleSize) || 20));

  const [reasonAgg, samples] = await Promise.all([
    EmailResult.aggregate([
      { $match: { jobId: job._id } },
      { $unwind: '$reasons' },
      { $group: { _id: { status: '$status', reason: '$reasons' }, count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 40 },
    ]),
    EmailResult.find({ jobId: job._id, status: { $in: ['RISKY', 'INVALID', 'UNKNOWN'] } })
      .sort({ _id: 1 }).limit(size).lean(),
  ]);

  const completion = job.uniqueEmails > 0
    ? Math.round((job.processedEmails / job.uniqueEmails) * 100)
    : 0;

  return {
    job: {
      id: job._id, filename: job.originalName, status: job.status,
      progress: job.progress, completionPercent: completion,
      uniqueEmails: job.uniqueEmails, duplicateCount: job.duplicateCount,
      counts: {
        valid: job.validCount, invalid: job.invalidCount,
        risky: job.riskyCount, unknown: job.unknownCount,
      },
    },
    topReasons: reasonAgg.map((r) => ({ status: r._id.status, reason: r._id.reason, count: r.count })),
    samples,
    disclaimer:
      'mailboxVerification is "not_checked" — MX records only prove the domain '
      + 'accepts mail, not that the mailbox exists. No SMTP probing is performed.',
  };
}

/** Explicit tool registry the future assistant will consume. */
export const aiTools = [
  { name: 'getJobSummary', description: 'Counts and status for one job (defaults to latest).', fn: getJobSummary },
  { name: 'getJobResults', description: 'Paginated result rows with status/search filters.', fn: getJobResults },
  { name: 'getRecentJobs', description: 'Most recent validation jobs.', fn: getRecentJobs },
  { name: 'getValidationStatistics', description: 'Aggregate stats across all jobs.', fn: getValidationStatistics },
  { name: 'generateReport', description: 'Reason breakdown + samples for one job.', fn: generateReport },
];

/** Guard: the AI path is fully optional and never affects validation. */
export function isAiConfigured() {
  return Boolean(env.aiApiKey);
}

/**
 * Optional LLM call. Returns null when no key is configured so callers can
 * degrade gracefully to the raw tool data above.
 */
export async function askAssistant(question, toolResults) {
  if (!env.aiApiKey) return null;
  try {
    const { data } = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: env.aiModel,
        messages: [
          {
            role: 'system',
            content:
              'You are the EmailClean AI assistant. Answer ONLY from the provided tool '
              + 'data. Never invent counts, emails, or reasons. If the data is missing, say so. '
              + 'Reminder: MX records do not prove a mailbox exists.',
          },
          { role: 'user', content: `Question: ${question}\n\nTool data:\n${JSON.stringify(toolResults)}` },
        ],
        temperature: 0.2,
      },
      { headers: { Authorization: `Bearer ${env.aiApiKey}` }, timeout: 20000 }
    );
    return data?.choices?.[0]?.message?.content ?? null;
  } catch (err) {
    throw new HttpError(502, `Assistant request failed: ${err.message}`);
  }
}

