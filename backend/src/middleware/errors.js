import { logger } from '../utils/logger.js';

export function notFound(req, res) {
  res.status(404).json({ success: false, error: `Route not found: ${req.method} ${req.originalUrl}` });
}

/** Central error handler — keeps stack traces out of production responses. */
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, _req, res, _next) {
  let status = err.status || err.statusCode || 500;
  let message = err.message || 'Unexpected server error';

  if (err.name === 'MulterError') {
    status = 400;
    message = err.code === 'LIMIT_FILE_SIZE'
      ? 'File is too large.'
      : `Upload failed: ${err.message}`;
  }
  if (err.name === 'CastError') {
    status = 400;
    message = 'Invalid identifier.';
  }
  if (err.name === 'ValidationError') {
    status = 400;
    message = Object.values(err.errors).map((e) => e.message).join('; ');
  }

  if (status >= 500) logger.error(err);
  else logger.warn(`${status} ${message}`);

  res.status(status).json({
    success: false,
    error: message,
    ...(process.env.NODE_ENV !== 'production' && status >= 500 ? { detail: err.stack } : {}),
  });
}

/** Wrap async route handlers so rejections reach errorHandler. */
export const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
