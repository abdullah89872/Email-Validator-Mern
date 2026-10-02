import EmailResult from '../models/EmailResult.js';

/** RFC 4180 quoting; also neutralizes CSV/formula injection in Excel. */
function csvEscape(value) {
  let str = value === null || value === undefined ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(str)) str = `'${str}`;
  if (/[",\n\r]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

const BASE_HEADER = ['email', 'status', 'syntaxValid', 'domainValid', 'mxFound',
  'disposable', 'roleAccount', 'mailboxVerification', 'reasons', 'checkedAt'];

function toRow(doc) {
  return [
    doc.email,
    doc.status,
    doc.syntaxValid,
    doc.domainValid,
    doc.mxFound,
    doc.disposable,
    doc.roleAccount,
    doc.mailboxVerification,
    (doc.reasons || []).join('; '),
    doc.checkedAt ? new Date(doc.checkedAt).toISOString() : '',
  ].map(csvEscape).join(',');
}

/** statusFilter: one of VALID/INVALID/RISKY/UNKNOWN, or null for everything. */
export function streamResultsCsv(res, jobId, statusFilter, filename) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.write(`${BASE_HEADER.join(',')}\n`);

  const query = { jobId };
  if (statusFilter) query.status = statusFilter;

  // Cursor + streaming keeps memory flat regardless of result count.
  const cursor = EmailResult.find(query).sort({ _id: 1 }).lean().cursor();

  return new Promise((resolve, reject) => {
    let failed = false;
    const fail = (err) => {
      if (failed) return;
      failed = true;
      res.end();
      reject(err);
    };

    (async () => {
      try {
        for await (const doc of cursor) {
          if (!res.write(`${toRow(doc)}\n`)) {
            await new Promise((r) => res.once('drain', r));
          }
          if (failed) break;
        }
        res.end();
        resolve();
      } catch (err) {
        fail(err);
      }
    })();

    res.on('close', () => {
      if (!res.writableEnded) {
        failed = true;
        cursor.close?.().catch?.(() => {});
      }
    });
    res.on('error', fail);
  });
}
