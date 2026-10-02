import fs from 'node:fs';
import path from 'node:path';
// xlsx is CommonJS: a namespace import under ESM only surfaces the subset of
// exports Node's CJS lexer detects (readFile is missing), so use the default.
import XLSX from 'xlsx';

/** Matches a plausible email address (loose on purpose; the Python service is authoritative). */
const EMAIL_RE = /^[^\s@,;:<>()[\]\\"]+@[^\s@,;:<>()[\]\\"]+\.[A-Za-z0-9-]{2,}$/;

/** Header names that usually contain emails — used for detection scoring. */
const STRONG_HEADER_HINTS = [
  'email', 'e-mail', 'emailaddress', 'email address', 'mail', 'mailid', 'mail id',
  'primaryemail', 'contactemail', 'useremail', 'recipient', 'recipientemail',
];
const WEAK_HEADER_HINTS = ['address', 'contact', 'username', 'user', 'from', 'to'];

export const ALLOWED_EXTENSIONS = ['.csv', '.xls', '.xlsx'];
export const ALLOWED_MIMETYPES = [
  'text/csv', 'application/csv', 'text/plain', '',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/octet-stream',
];

/** Strip BOM and enforce an allow-listed extension + mimetype. */
export function isAllowedFile(originalName, mimetype) {
  const ext = path.extname(originalName || '').toLowerCase();
  if (!ALLOWED_EXTENSIONS.includes(ext)) return false;
  if (mimetype && !ALLOWED_MIMETYPES.includes(mimetype)) return false;
  return true;
}

/** Never trust user-supplied filenames for the filesystem. */
export function safeStoredName(originalName) {
  const ext = path.extname(originalName || '').toLowerCase() || '.csv';
  const base = path.basename(originalName || 'upload', ext)
    .replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 60);
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return `${base || 'upload'}-${unique}${ext}`;
}

export function sanitizeDisplayFilename(name) {
  return path.basename(String(name || 'file')).replace(/[\r\n\0]/g, '');
}

function normalizeHeader(value) {
  return String(value ?? '').trim().toLowerCase().replace(/[\s_-]+/g, '');
}

/** Read the first sheet — file sizes are capped by multer so this is bounded. */
function readSheet(filePath, ext) {
  const workbook = XLSX.readFile(filePath, {
    type: 'file',
    raw: false,
    cellDates: false,
    dense: ext !== '.csv',
  });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error('The spreadsheet contains no sheets.');
  // header:1 => array of arrays; defval:'' keeps ragged rows consistent.
  return XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
    header: 1, defval: '', blankrows: false,
  });
}

/**
 * Score each column for "contains emails" using header hints plus a sample
 * of the first `sampleSize` data rows. Returns the best column + confidence.
 */
function detectEmailColumn(headers, dataRows, sampleSize = 50) {
  const sample = dataRows.slice(0, sampleSize);
  let best = { index: -1, header: null, score: 0, confidence: 0, ratio: 0 };

  headers.forEach((header, index) => {
    const normalizedHeader = normalizeHeader(header);
    let score = 0;
    if (STRONG_HEADER_HINTS.includes(normalizedHeader)) score += 60;
    else if (WEAK_HEADER_HINTS.some((hint) => normalizedHeader.includes(hint))) score += 25;

    let hits = 0;
    let nonEmpty = 0;
    for (const row of sample) {
      const cell = String(row[index] ?? '').trim();
      if (!cell) continue;
      nonEmpty += 1;
      if (EMAIL_RE.test(cell)) hits += 1;
    }
    const ratio = nonEmpty === 0 ? 0 : hits / nonEmpty;
    score += ratio * 40;

    if (score > best.score) {
      best = { index, header: String(header ?? ''), score, ratio, confidence: 0 };
    }
  });

  if (best.index === -1 || best.score < 20) {
    return { index: -1, header: null, confidence: 0, ratio: 0 };
  }
  // Confidence band so the UI can tell "auto-detected" from "please choose".
  const confidence = Math.min(1, best.score / 80);
  return { ...best, confidence: Number(confidence.toFixed(2)) };
}

function looksLikeHeader(firstRow) {
  if (!firstRow) return false;
  const filled = firstRow.filter((cell) => String(cell ?? '').trim() !== '');
  if (filled.length === 0) return false;
  // A header row rarely contains a valid email itself.
  const emailLike = filled.filter((cell) => EMAIL_RE.test(String(cell).trim())).length;
  return emailLike === 0;
}

/**
 * Parse an uploaded CSV/XLS/XLSX file.
 * detection.index === -1 means detection failed and the caller must ask the
 * user to pick a column manually.
 */
export function parseSpreadsheet(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const rows = readSheet(filePath, ext);
  if (!rows.length) throw new Error('The file is empty.');

  const hasHeader = looksLikeHeader(rows[0]);
  const headerRow = hasHeader ? rows[0] : [];
  const dataRows = hasHeader ? rows.slice(1) : rows;

  const columnCount = Math.max(
    headerRow.length,
    ...dataRows.slice(0, 200).map((row) => row.length),
    0
  );

  const headers = Array.from({ length: columnCount }, (_, i) => {
    const raw = String(headerRow[i] ?? '').trim();
    return raw || `Column ${i + 1}`;
  });

  const detection = detectEmailColumn(headers, dataRows);
  return { headers, dataRows, detection, hasHeader, columnCount };
}

/**
 * Normalize + dedupe emails from one column. Iterates row-by-row so we never
 * build a second copy of the sheet in memory.
 */
export function extractEmails(dataRows, columnIndex, { maxEmails = 500000 } = {}) {
  const seen = new Set();
  const unique = [];
  let total = 0;
  let malformed = 0;

  for (const row of dataRows) {
    if (unique.length >= maxEmails) break;
    const raw = String(row[columnIndex] ?? '').trim().toLowerCase();
    if (!raw) continue;
    // Some exports use "Name <a@b.com>" — keep only the address part.
    const angleMatch = raw.match(/<([^>]+)>/);
    const candidate = (angleMatch ? angleMatch[1] : raw).trim();
    total += 1;
    // Malformed values are kept so they surface as INVALID instead of vanishing.
    if (!EMAIL_RE.test(candidate)) malformed += 1;
    if (seen.has(candidate)) continue;
    seen.add(candidate);
    unique.push(candidate);
  }

  return {
    uniqueEmails: unique,
    totalEmails: total,
    duplicateCount: total - unique.length,
    malformedCount: malformed,
  };
}

/** Delete a staged file, ignoring "already gone". */
export async function removeFile(filePath) {
  try {
    await fs.promises.access(filePath);
    await fs.promises.unlink(filePath);
  } catch {
    /* no-op */
  }
}
