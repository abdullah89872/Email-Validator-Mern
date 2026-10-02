import axios from 'axios';

/**
 * The React app talks ONLY to the Node/Express API.
 * The Python validation service is never called from the browser.
 */
const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api',
  timeout: 60000,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    const message =
      err?.response?.data?.error ||
      err?.response?.data?.detail ||
      err?.message ||
      'Request failed';
    return Promise.reject(Object.assign(new Error(message), {
      status: err?.response?.status,
      data: err?.response?.data,
    }));
  }
);

export const apiBaseUrl = api.defaults.baseURL;

// --- Health ---------------------------------------------------------------
export const fetchHealth = () => api.get('/health').then((r) => r.data);

// --- Jobs -----------------------------------------------------------------
export const listJobs = (params = {}) => api.get('/jobs', { params }).then((r) => r.data);
export const getJob = (jobId) => api.get(`/jobs/${jobId}`).then((r) => r.data);
export const getJobResults = (jobId, params = {}) =>
  api.get(`/jobs/${jobId}/results`, { params }).then((r) => r.data);
export const startJob = (jobId, body = {}) =>
  api.post(`/jobs/${jobId}/start`, body).then((r) => r.data);
export const retryJob = (jobId) => api.post(`/jobs/${jobId}/retry`).then((r) => r.data);
export const deleteJob = (jobId) => api.delete(`/jobs/${jobId}`).then((r) => r.data);

/** Upload a spreadsheet file (multipart). */
export function uploadJob(file, onProgress, emailColumn) {
  const form = new FormData();
  form.append('file', file);
  if (emailColumn !== undefined && emailColumn !== null && emailColumn !== '') {
    form.append('emailColumn', String(emailColumn));
  }
  return api.post('/jobs/upload', form, {
    timeout: 300000,
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: (evt) => {
      if (!onProgress || !evt.total) return;
      onProgress(Math.round((evt.loaded / evt.total) * 100));
    },
  }).then((r) => r.data);
}

/** Absolute URL for a CSV download (opened via an anchor element). */
export const downloadUrl = (jobId, kind) =>
  `${api.defaults.baseURL}/jobs/${jobId}/download/${kind}`;

export default api;
