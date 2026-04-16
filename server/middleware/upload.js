import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import multer from 'multer';

const maxFileSizeMb = Number(process.env.MAX_UPLOAD_SIZE_MB || 15);
const maxFileSizeBytes = maxFileSizeMb * 1024 * 1024;
const allowedMimeTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
const currentFilePath = fileURLToPath(import.meta.url);
const currentDir = path.dirname(currentFilePath);
const rootDir = path.resolve(currentDir, '../..');
const tempUploadDir = path.join(rootDir, 'data', 'tmp');

const storage = multer.diskStorage({
  destination: async (_req, _file, callback) => {
    try {
      await fs.mkdir(tempUploadDir, { recursive: true });
      callback(null, tempUploadDir);
    } catch (error) {
      callback(error, tempUploadDir);
    }
  },
  filename: (_req, file, callback) => {
    const extension = path.extname(file.originalname || '').toLowerCase() || '.bin';
    callback(null, `${Date.now()}-${crypto.randomUUID()}${extension}`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: maxFileSizeBytes,
  },
  fileFilter: (_req, file, callback) => {
    if (!allowedMimeTypes.has(file.mimetype)) {
      callback(new Error('Unsupported MIME type. Allowed types: JPEG, PNG, WEBP'));
      return;
    }

    callback(null, true);
  },
});

export const uploadSingleImage = upload.single('image');

export function uploadErrorHandler(error, _req, res, next) {
  if (!error) {
    return next();
  }

  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        error: `File is too large. Maximum size is ${maxFileSizeMb} MB`,
      });
    }

    return res.status(400).json({ error: error.message });
  }

  return res.status(400).json({ error: error.message || 'Upload validation failed' });
}
