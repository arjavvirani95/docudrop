export const MAX_FILE_BYTES = 100 * 1024 * 1024; // 100 MB
export const MAX_FILES_PER_DROP = 20;
export const DROP_TTL_DAYS = 7;
export const UPLOAD_URL_TTL_SECONDS = 300;
export const DOWNLOAD_URL_TTL_SECONDS = 3600;

export const ALLOWED_TYPES = [
  "application/pdf",
  "application/zip",
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "text/plain",
  "text/csv",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
];
