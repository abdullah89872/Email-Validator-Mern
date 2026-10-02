import multer from 'multer';
import path from 'node:path';
import env from '../config/env.js';
import { isAllowedFile, safeStoredName } from '../services/fileService.js';

export const uploadDir = env.uploadDir;

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  // Filenames are regenerated server-side; never use the client's name on disk.
  filename: (_req, file, cb) => cb(null, safeStoredName(file.originalname)),
});

export const upload = multer({
  storage,
  limits: { fileSize: env.maxFileSize, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!isAllowedFile(file.originalname, file.mimetype)) {
      const err = new Error('Unsupported file type. Upload a CSV, XLS, or XLSX file.');
      err.status = 400;
      return cb(err);
    }
    cb(null, true);
  },
});

export function extensionOf(filename) {
  return path.extname(filename || '').toLowerCase();
}
