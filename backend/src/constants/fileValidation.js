// Module 4: Medical Record Upload
//
// Validation rules for uploaded medical record files. Kept as constants
// so later modules (e.g. a hospital bulk-upload flow) reuse the same
// rules instead of redefining them.

const ALLOWED_MIME_TYPES = Object.freeze([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'text/plain',
]);

// Max size of the actual file content (not the whole multipart body).
const MAX_UPLOAD_SIZE_BYTES =
  Number(process.env.MAX_UPLOAD_SIZE_BYTES) || 5 * 1024 * 1024; // 5 MB default

// Multipart framing (boundaries, headers, the patientId field) adds a
// small amount of overhead on top of the raw file bytes. This is the
// ceiling for the *whole* request body while it's being buffered, kept
// separate from MAX_UPLOAD_SIZE_BYTES (which validates the file itself).
const MULTIPART_BODY_OVERHEAD_BYTES = 64 * 1024; // 64 KB

module.exports = {
  ALLOWED_MIME_TYPES,
  MAX_UPLOAD_SIZE_BYTES,
  MULTIPART_BODY_OVERHEAD_BYTES,
};
