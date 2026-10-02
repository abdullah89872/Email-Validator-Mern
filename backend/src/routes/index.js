import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { upload } from '../middleware/upload.js';
import { asyncHandler } from '../middleware/errors.js';
import env from '../config/env.js';
import {
  uploadJob, startJobRoute, listJobs, getJob, getResults,
  deleteJob, retryJob, downloadResults, health,
} from '../controllers/jobController.js';

const router = Router();

// Stricter limiter for the expensive upload endpoint.
const uploadLimiter = rateLimit({
  windowMs: env.rateLimitWindowMs,
  limit: Math.max(5, Math.floor(env.rateLimitMax / 10)),
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many uploads, please slow down.' },
});

router.get('/health', health);

router.post('/jobs/upload', uploadLimiter, upload.single('file'), uploadJob);
router.post('/jobs/:jobId/start', startJobRoute);
router.get('/jobs', listJobs);
router.get('/jobs/:jobId', getJob);
router.get('/jobs/:jobId/results', getResults);
router.delete('/jobs/:jobId', deleteJob);
router.post('/jobs/:jobId/retry', retryJob);

router.get('/jobs/:jobId/download/:kind', asyncHandler(downloadResults));

export default router;
