import mongoose from 'mongoose';

/**
 * Represents one uploaded file and its validation run.
 * `emailColumn` and `columns` let the UI re-run / explain a job later.
 */
const validationJobSchema = new mongoose.Schema(
  {
    filename: { type: String, required: true, trim: true },
    originalName: { type: String, required: true, trim: true },
    storedName: { type: String, default: '' },
    columns: { type: [String], default: [] },
    emailColumn: { type: String, default: null },
    totalEmails: { type: Number, default: 0, min: 0 },
    uniqueEmails: { type: Number, default: 0, min: 0 },
    processedEmails: { type: Number, default: 0, min: 0 },
    validCount: { type: Number, default: 0, min: 0 },
    invalidCount: { type: Number, default: 0, min: 0 },
    riskyCount: { type: Number, default: 0, min: 0 },
    unknownCount: { type: Number, default: 0, min: 0 },
    duplicateCount: { type: Number, default: 0, min: 0 },
    // pending | running | completed | failed | cancelled
    status: {
      type: String,
      enum: ['pending', 'running', 'completed', 'failed', 'cancelled'],
      default: 'pending',
      index: true,
    },
    progress: { type: Number, default: 0, min: 0, max: 100 },
    error: { type: String, default: null },
    createdAt: { type: Date, default: Date.now, index: true },
    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
  },
  { versionKey: false }
);

// Job list is always newest-first for the dashboard.
validationJobSchema.index({ createdAt: -1 });
validationJobSchema.index({ status: 1, createdAt: -1 });

validationJobSchema.virtual('durationMs').get(function () {
  if (!this.startedAt) return null;
  const end = this.completedAt || new Date();
  return end.getTime() - this.startedAt.getTime();
});

validationJobSchema.set('toJSON', { virtuals: true });
validationJobSchema.set('toObject', { virtuals: true });

export default mongoose.model('ValidationJob', validationJobSchema);
