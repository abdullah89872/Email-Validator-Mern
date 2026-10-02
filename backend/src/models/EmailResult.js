import mongoose from 'mongoose';

/**
 * One row per unique email per job.
 * `mailboxVerification` is deliberately always "not_checked" unless a
 * mailbox-verification provider is configured — we never claim a mailbox
 * exists based on MX records alone, and we never do SMTP probing.
 */
const emailResultSchema = new mongoose.Schema(
  {
    jobId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ValidationJob',
      required: true,
      index: true,
    },
    email: { type: String, required: true, trim: true, lowercase: true },
    // VALID | INVALID | RISKY | UNKNOWN | PENDING | ERROR
    status: {
      type: String,
      enum: ['VALID', 'INVALID', 'RISKY', 'UNKNOWN', 'PENDING', 'ERROR'],
      default: 'PENDING',
      index: true,
    },
    syntaxValid: { type: Boolean, default: false },
    domainValid: { type: Boolean, default: false },
    mxFound: { type: Boolean, default: false },
    disposable: { type: Boolean, default: false, index: true },
    roleAccount: { type: Boolean, default: false, index: true },
    mailboxVerification: {
      type: String,
      default: 'not_checked',
      enum: ['not_checked', 'valid', 'invalid', 'unknown', 'risky'],
    },
    reasons: { type: [String], default: [] },
    checkedAt: { type: Date, default: null },
  },
  { versionKey: false }
);

// Composite indexes supporting the job detail page's filters + pagination.
emailResultSchema.index({ jobId: 1, status: 1, _id: -1 });
emailResultSchema.index({ jobId: 1, email: 1 });
emailResultSchema.index({ jobId: 1, disposable: 1, status: 1 });
emailResultSchema.index({ jobId: 1, roleAccount: 1, status: 1 });

export default mongoose.model('EmailResult', emailResultSchema);
