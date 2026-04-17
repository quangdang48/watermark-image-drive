import fs from 'node:fs/promises';
import path from 'node:path';
import { Queue, QueueEvents, Worker } from 'bullmq';
import { processImageUpload } from './imagePipeline.js';
import { saveImageRecord } from './storage.js';
import { recordMemorySnapshot } from './runtimeMetrics.js';

const UPLOAD_QUEUE_NAME = 'image-processing';
const USE_BULLMQ = true;
const redisHost = process.env.REDIS_HOST || '127.0.0.1';
const redisPort = Number(process.env.REDIS_PORT || 6382);
const workerConcurrency = Math.max(1, Number(process.env.UPLOAD_WORKER_CONCURRENCY || 1));
const isTestRuntime = process.env.NODE_ENV === 'test'
  || process.env.npm_lifecycle_event === 'test'
  || process.argv.some((arg) => arg.includes('--test'));

let uploadQueue = null;
let uploadQueueEvents = null;
let uploadWorker = null;
let queueAvailable = null;
let nextReconnectAttemptAt = 0;

function createRedisConnection(connectionName) {
  return {
    host: redisHost,
    port: redisPort,
    maxRetriesPerRequest: null,
    connectTimeout: 1000,
    enableReadyCheck: false,
    lazyConnect: false,
    connectionName,
  };
}

function getUploadQueue() {
  if (!uploadQueue) {
    uploadQueue = new Queue(UPLOAD_QUEUE_NAME, {
      connection: createRedisConnection('upload-queue'),
      defaultJobOptions: {
        removeOnComplete: 100,
        removeOnFail: 100,
        attempts: 2,
        backoff: {
          type: 'exponential',
          delay: 1000,
        },
      },
    });
  }

  return uploadQueue;
}

function getUploadQueueEvents() {
  if (!uploadQueueEvents) {
    uploadQueueEvents = new QueueEvents(UPLOAD_QUEUE_NAME, {
      connection: createRedisConnection('upload-queue-events'),
    });
  }

  return uploadQueueEvents;
}

export function shouldUseUploadQueue() {
  if (isTestRuntime) {
    return false;
  }

  if (process.env.UPLOAD_QUEUE_ENABLED !== undefined) {
    return String(process.env.UPLOAD_QUEUE_ENABLED).toLowerCase() === 'true';
  }

  return USE_BULLMQ;
}

export async function processStoredUpload(uploadData) {
  const {
    tempFilePath,
    originalFileName,
    mimeType,
    folder,
    imageName,
    owner = { sub: 'anonymous', role: 'viewer' },
  } = uploadData;

  recordMemorySnapshot('upload:processing-start', {
    folder,
    imageName,
    tempFileName: tempFilePath ? path.basename(tempFilePath) : null,
  });

  try {
    const processedImage = await processImageUpload({ filePath: tempFilePath });

    const savedRecord = await saveImageRecord({
      imageId: processedImage.imageId,
      owner,
      originalFileName,
      mimeType,
      metadata: processedImage.metadata,
      levels: processedImage.levels,
      folder,
      imageName,
      createdAt: new Date().toISOString(),
    });

    recordMemorySnapshot('upload:processing-complete', {
      folder,
      imageName,
      imageId: processedImage.imageId,
    });

    return savedRecord;
  } finally {
    if (tempFilePath) {
      await fs.rm(tempFilePath, { force: true }).catch(() => undefined);
    }

    recordMemorySnapshot('upload:cleanup-complete', {
      folder,
      imageName,
    });
  }
}

async function isQueueReady() {
  if (!shouldUseUploadQueue()) {
    return false;
  }

  if (queueAvailable === true) {
    return true;
  }

  if (queueAvailable === false && Date.now() < nextReconnectAttemptAt) {
    return false;
  }

  try {
    await getUploadQueue().waitUntilReady();
    await getUploadQueueEvents().waitUntilReady();
    queueAvailable = true;
    return true;
  } catch (error) {
    queueAvailable = false;
    nextReconnectAttemptAt = Date.now() + 10_000;
    console.warn(`Upload queue unavailable at redis://${redisHost}:${redisPort}; falling back to inline processing.`);
    console.warn(error.message);
    return false;
  }
}

export async function runUploadViaQueue(uploadData) {
  const ready = await isQueueReady();
  if (!ready) {
    recordMemorySnapshot('upload:inline-fallback', {
      folder: uploadData.folder,
      imageName: uploadData.imageName,
    });

    return {
      status: 'ok',
      imageRecord: await processStoredUpload(uploadData),
      mode: 'inline-fallback',
    };
  }

  const job = await getUploadQueue().add('process-upload', uploadData);
  recordMemorySnapshot('upload:queued', {
    folder: uploadData.folder,
    imageName: uploadData.imageName,
    jobId: String(job.id),
  });

  return {
    status: 'queued',
    jobId: String(job.id),
    mode: 'redis-worker',
  };
}

export async function getUploadJobStatus(jobId) {
  const ready = await isQueueReady();

  if (!ready) {
    return null;
  }

  const job = await getUploadQueue().getJob(jobId);

  if (!job) {
    return null;
  }

  const state = await job.getState();
  const result = state === 'completed' ? job.returnvalue : null;
  const failureReason = state === 'failed' ? job.failedReason : null;

  return {
    jobId: String(job.id),
    state,
    result,
    failureReason,
  };
}

export function startUploadWorker() {
  if (!shouldUseUploadQueue()) {
    return null;
  }

  if (uploadWorker) {
    return uploadWorker;
  }

  uploadWorker = new Worker(
    UPLOAD_QUEUE_NAME,
    async (job) => processStoredUpload(job.data),
    {
      connection: createRedisConnection('upload-worker'),
      concurrency: workerConcurrency,
    },
  );

  uploadWorker.on('ready', () => {
    queueAvailable = true;
    console.log(`Upload worker listening on redis://${redisHost}:${redisPort} with concurrency ${workerConcurrency}`);
  });

  uploadWorker.on('error', (error) => {
    queueAvailable = false;
    nextReconnectAttemptAt = Date.now() + 10_000;
    console.error('Upload worker error:', error.message);
  });

  return uploadWorker;
}

export async function closeUploadQueueResources() {
  await uploadWorker?.close().catch(() => undefined);
  await uploadQueueEvents?.close().catch(() => undefined);
  await uploadQueue?.close().catch(() => undefined);
  uploadWorker = null;
  uploadQueueEvents = null;
  uploadQueue = null;
}
