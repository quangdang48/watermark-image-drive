import fs from 'node:fs/promises';
import path from 'node:path';
import { Router } from 'express';
import { uploadSingleImage } from '../middleware/upload.js';
import { processImageUpload } from '../services/imagePipeline.js';
import {
  deleteFolderRecords,
  deleteImageRecord,
  getImageRecord,
  listImageRecords,
  renameFolderRecords,
  resolveImageRoot,
  saveImageRecord,
  updateImageRecord,
} from '../services/storage.js';

const router = Router();

function normalizeFolderName(value) {
  const folder = String(value || '').trim();
  return folder || 'General';
}

function normalizeImageName(value, originalFileName) {
  const imageName = String(value || '').trim();
  return imageName || path.parse(originalFileName || 'Untitled image').name;
}

function toImagePayload(imageRecord) {
  return {
    status: 'ok',
    imageId: imageRecord.imageId,
    dziUrl: `/tiles/${imageRecord.imageId}/image.dzi`,
    metadata: imageRecord.metadata,
    levels: imageRecord.levels,
    originalFileName: imageRecord.originalFileName,
    createdAt: imageRecord.createdAt,
    folder: imageRecord.folder || 'General',
    imageName: imageRecord.imageName || imageRecord.originalFileName,
  };
}

async function removeImageAssets(imageId) {
  await fs.rm(resolveImageRoot(imageId), { recursive: true, force: true });
}

router.get('/library', async (_req, res, next) => {
  try {
    const imageRecords = await listImageRecords();
    const groupedFolders = new Map();

    for (const imageRecord of imageRecords) {
      const folderId = imageRecord.folder || 'General';

      if (!groupedFolders.has(folderId)) {
        groupedFolders.set(folderId, {
          folderId,
          images: [],
        });
      }

      groupedFolders.get(folderId).images.push({
        imageId: imageRecord.imageId,
        imageName: imageRecord.imageName || imageRecord.originalFileName,
        originalFileName: imageRecord.originalFileName,
        createdAt: imageRecord.createdAt,
      });
    }

    return res.status(200).json({
      status: 'ok',
      folders: Array.from(groupedFolders.values()),
    });
  } catch (error) {
    return next(error);
  }
});

router.patch('/folders/:folderId', async (req, res, next) => {
  try {
    const nextFolderName = normalizeFolderName(req.body.nextFolderName);
    const updatedRecords = await renameFolderRecords(req.params.folderId, nextFolderName);

    if (!updatedRecords.length) {
      return res.status(404).json({ error: 'Folder not found' });
    }

    return res.status(200).json({
      status: 'ok',
      folderId: nextFolderName,
      updatedCount: updatedRecords.length,
    });
  } catch (error) {
    return next(error);
  }
});

router.delete('/folders/:folderId', async (req, res, next) => {
  try {
    const deletedRecords = await deleteFolderRecords(req.params.folderId);

    if (!deletedRecords.length) {
      return res.status(404).json({ error: 'Folder not found' });
    }

    await Promise.all(deletedRecords.map((imageRecord) => removeImageAssets(imageRecord.imageId)));

    return res.status(200).json({
      status: 'ok',
      folderId: req.params.folderId,
      deletedCount: deletedRecords.length,
    });
  } catch (error) {
    return next(error);
  }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const imageRecord = await getImageRecord(req.params.id);

    if (!imageRecord) {
      return res.status(404).json({ error: 'Image not found' });
    }

    const updatedImage = await updateImageRecord(req.params.id, {
      folder: normalizeFolderName(req.body.folder ?? imageRecord.folder),
      imageName: normalizeImageName(req.body.imageName ?? imageRecord.imageName, imageRecord.originalFileName),
    });

    return res.status(200).json(toImagePayload(updatedImage));
  } catch (error) {
    return next(error);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const deletedImage = await deleteImageRecord(req.params.id);

    if (!deletedImage) {
      return res.status(404).json({ error: 'Image not found' });
    }

    await removeImageAssets(req.params.id);

    return res.status(200).json({
      status: 'ok',
      imageId: req.params.id,
      deleted: true,
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const imageRecord = await getImageRecord(req.params.id);

    if (!imageRecord) {
      return res.status(404).json({ error: 'Image not found' });
    }

    return res.status(200).json(toImagePayload(imageRecord));
  } catch (error) {
    return next(error);
  }
});

router.post(
  '/',
  (req, res, next) => {
    uploadSingleImage(req, res, (error) => {
      if (error) {
        next(error);
        return;
      }

      next();
    });
  },
  async (req, res, next) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'An image file is required' });
      }

      const processedImage = await processImageUpload({
        buffer: req.file.buffer,
      });

      const savedImage = await saveImageRecord({
        imageId: processedImage.imageId,
        owner: {
          sub: 'anonymous',
          role: 'viewer',
        },
        originalFileName: req.file.originalname,
        mimeType: req.file.mimetype,
        metadata: processedImage.metadata,
        levels: processedImage.levels,
        folder: normalizeFolderName(req.body.folder),
        imageName: normalizeImageName(req.body.imageName, req.file.originalname),
        createdAt: new Date().toISOString(),
      });

      return res.status(200).json(toImagePayload(savedImage));
    } catch (error) {
      return next(error);
    }
  },
);

export default router;
