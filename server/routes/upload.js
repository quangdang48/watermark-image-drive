import fs from 'node:fs/promises';
import path from 'node:path';
import { Router } from 'express';
import { uploadSingleImage } from '../middleware/upload.js';
import { getUploadJobStatus, runUploadViaQueue } from '../services/uploadQueue.js';
import { recordMemorySnapshot } from '../services/runtimeMetrics.js';
import {
  createFolderRecord,
  deleteFolderRecords,
  deleteImageRecord,
  getImageRecord,
  listFolderRecords,
  listImageRecords,
  renameFolderRecords,
  resolveImageRoot,
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
    downloadUrl: `/upload/${imageRecord.imageId}/download`,
    metadata: imageRecord.metadata,
    levels: imageRecord.levels,
    originalFileName: imageRecord.originalFileName,
    createdAt: imageRecord.createdAt,
    folder: imageRecord.folder || 'General',
    imageName: imageRecord.imageName || imageRecord.originalFileName,
  };
}

function createDownloadName(imageRecord) {
  const baseName = String(imageRecord.imageName || imageRecord.originalFileName || imageRecord.imageId)
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001F]+/g, '-')
    .replace(/\s+/g, '-');

  return (baseName || imageRecord.imageId).replace(/\.(jpg|jpeg|png|webp)$/i, '') + '.jpg';
}

async function removeImageAssets(imageId) {
  await fs.rm(resolveImageRoot(imageId), { recursive: true, force: true });
}

router.get('/library', async (_req, res, next) => {
  try {
    const [imageRecords, folderRecords] = await Promise.all([
      listImageRecords(),
      listFolderRecords(),
    ]);
    const groupedFolders = new Map();

    for (const folderRecord of folderRecords) {
      groupedFolders.set(folderRecord.folderId, {
        folderId: folderRecord.folderId,
        images: [],
      });
    }

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

router.post('/folders', async (req, res, next) => {
  try {
    const folderName = normalizeFolderName(req.body.folderName);
    const createdFolder = await createFolderRecord(folderName);

    if (!createdFolder) {
      return res.status(409).json({ error: 'Folder already exists' });
    }

    return res.status(201).json({
      status: 'ok',
      folderId: createdFolder.folderId,
      imageCount: 0,
    });
  } catch (error) {
    return next(error);
  }
});

router.patch('/folders/:folderId', async (req, res, next) => {
  try {
    const nextFolderName = normalizeFolderName(req.body.nextFolderName);
    const updatedRecords = await renameFolderRecords(req.params.folderId, nextFolderName);

    if (updatedRecords === null) {
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

    if (deletedRecords === null) {
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

router.get('/jobs/:jobId', async (req, res, next) => {
  try {
    const jobStatus = await getUploadJobStatus(req.params.jobId);

    if (!jobStatus) {
      return res.status(404).json({ error: 'Upload job not found' });
    }

    if (jobStatus.state === 'completed' && jobStatus.result) {
      return res.status(200).json({
        status: 'ok',
        jobId: jobStatus.jobId,
        state: jobStatus.state,
        image: toImagePayload(jobStatus.result),
        processingMode: 'redis-worker',
      });
    }

    if (jobStatus.state === 'failed') {
      return res.status(200).json({
        status: 'failed',
        jobId: jobStatus.jobId,
        state: jobStatus.state,
        failureReason: jobStatus.failureReason,
      });
    }

    return res.status(200).json({
      status: 'queued',
      jobId: jobStatus.jobId,
      state: jobStatus.state,
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/:id/download', async (req, res, next) => {
  try {
    const imageRecord = await getImageRecord(req.params.id);

    if (!imageRecord) {
      return res.status(404).json({ error: 'Image not found' });
    }

    const downloadPath = resolveImageRoot(req.params.id);
    const filePath = path.join(downloadPath, 'download.jpg');
    await fs.access(filePath);

    res.set('Cache-Control', 'private, max-age=60');
    return res.download(filePath, createDownloadName(imageRecord));
  } catch (error) {
    if (error.code === 'ENOENT') {
      return res.status(404).json({ error: 'Download not available for this image' });
    }

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

      recordMemorySnapshot('upload:request-accepted', {
        folder: normalizeFolderName(req.body.folder),
        imageName: normalizeImageName(req.body.imageName, req.file.originalname),
        fileSizeBytes: req.file.size || 0,
      });

      const uploadResult = await runUploadViaQueue({
        tempFilePath: req.file.path,
        owner: {
          sub: 'anonymous',
          role: 'viewer',
        },
        originalFileName: req.file.originalname,
        mimeType: req.file.mimetype,
        folder: normalizeFolderName(req.body.folder),
        imageName: normalizeImageName(req.body.imageName, req.file.originalname),
      });

      if (uploadResult.status === 'queued') {
        return res.status(202).json({
          status: 'queued',
          jobId: uploadResult.jobId,
          message: 'Upload accepted and is being processed by the Redis worker.',
        });
      }

      return res.status(200).json({
        ...toImagePayload(uploadResult.imageRecord),
        processingMode: uploadResult.mode,
      });
    } catch (error) {
      return next(error);
    }
  },
);

export default router;
