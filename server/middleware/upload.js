import multer from 'multer';

const maxFileSizeMb = Number(process.env.MAX_UPLOAD_SIZE_MB || 15);
const maxFileSizeBytes = maxFileSizeMb * 1024 * 1024;
const allowedMimeTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);

const upload = multer({
  storage: multer.memoryStorage(),
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
