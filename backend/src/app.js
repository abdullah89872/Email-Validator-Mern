import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import fs from 'node:fs';
import path from 'node:path';
import env from './config/env.js';
import routes from './routes/index.js';
import { errorHandler, notFound } from './middleware/errors.js';

// Ensure the staging directory exists before multer needs it.
fs.mkdirSync(path.resolve(env.uploadDir), { recursive: true });

const app = express();

app.set('trust proxy', 1);

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin: env.corsOrigins, credentials: false, optionsSuccessStatus: 204 }));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

app.use(
  rateLimit({
    windowMs: env.rateLimitWindowMs,
    limit: env.rateLimitMax,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: 'Too many requests, please try again shortly.' },
  })
);

app.use('/api', routes);

app.use(notFound);
app.use(errorHandler);

export default app;
