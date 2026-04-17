import fs from 'node:fs/promises';
import path from 'node:path';

function parseArgs(argv) {
  const options = {
    url: 'http://localhost:3000',
    count: 100,
    concurrency: 10,
    staggerMs: 100,
    folder: `stress-${Date.now()}`,
    imageName: 'stress-image',
    pollMs: 1000,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    if ((arg === '--file' || arg === '-f') && next) {
      options.file = next;
      index += 1;
      continue;
    }

    if ((arg === '--count' || arg === '-c') && next) {
      options.count = Number(next);
      index += 1;
      continue;
    }

    if ((arg === '--concurrency' || arg === '-C') && next) {
      options.concurrency = Number(next);
      index += 1;
      continue;
    }

    if ((arg === '--url' || arg === '-u') && next) {
      options.url = next.replace(/\/$/, '');
      index += 1;
      continue;
    }

    if ((arg === '--folder' || arg === '-d') && next) {
      options.folder = next;
      index += 1;
      continue;
    }

    if ((arg === '--name' || arg === '-n') && next) {
      options.imageName = next;
      index += 1;
      continue;
    }

    if ((arg === '--poll-ms' || arg === '-p') && next) {
      options.pollMs = Number(next);
      index += 1;
      continue;
    }

    if ((arg === '--stagger-ms' || arg === '-s') && next) {
      options.staggerMs = Number(next);
      index += 1;
      continue;
    }
  }

  options.count = Number.isFinite(options.count) ? Math.max(1, Math.floor(options.count)) : 1;
  options.concurrency = Number.isFinite(options.concurrency)
    ? Math.max(1, Math.min(options.count, Math.floor(options.concurrency)))
    : Math.min(options.count, 10);
  options.pollMs = Number.isFinite(options.pollMs) ? Math.max(100, Math.floor(options.pollMs)) : 1000;
  options.staggerMs = Number.isFinite(options.staggerMs) ? Math.max(0, Math.floor(options.staggerMs)) : 100;

  return options;
}

function getMimeType(filePath) {
  const extension = path.extname(filePath).toLowerCase();

  switch (extension) {
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.png':
      return 'image/png';
    case '.webp':
      return 'image/webp';
    default:
      return 'application/octet-stream';
  }
}

async function fetchJson(url, init) {
  const response = await fetch(url, init);
  const payload = await response.json();
  return { response, payload };
}

async function pollJobUntilDone(baseUrl, jobId, pollMs) {
  for (let attempt = 0; attempt < 300; attempt += 1) {
    const { response, payload } = await fetchJson(`${baseUrl}/upload/jobs/${encodeURIComponent(jobId)}`);

    if (!response.ok) {
      throw new Error(payload.error || `Job ${jobId} status request failed`);
    }

    if (payload.status === 'ok') {
      return payload;
    }

    if (payload.status === 'failed') {
      throw new Error(payload.failureReason || `Job ${jobId} failed`);
    }

    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }

  throw new Error(`Timed out while waiting for job ${jobId}`);
}

async function fetchMetrics(baseUrl) {
  const { response, payload } = await fetchJson(`${baseUrl}/api/metrics/memory`);

  if (!response.ok) {
    throw new Error(payload.error || 'Unable to read memory metrics');
  }

  return payload;
}

function printMetrics(prefix, metrics) {
  const current = metrics.current || {};
  const recent = metrics.recent?.[0]?.label || 'n/a';

  console.log(
    `[metrics] ${prefix} rss=${current.rssMB}MB heapUsed=${current.heapUsedMB}MB external=${current.externalMB}MB recent=${recent}`,
  );
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function uploadOne({ index, baseUrl, fileBuffer, mimeType, fileName, folder, imageName, pollMs }) {
  const formData = new FormData();
  formData.append('folder', folder);
  formData.append('imageName', `${imageName}-${index + 1}`);
  formData.append('image', new Blob([fileBuffer], { type: mimeType }), fileName);

  const { response, payload } = await fetchJson(`${baseUrl}/upload`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    throw new Error(payload.error || `Upload ${index + 1} failed with status ${response.status}`);
  }

  if (payload.status === 'queued' && payload.jobId) {
    const done = await pollJobUntilDone(baseUrl, payload.jobId, pollMs);
    return {
      index: index + 1,
      mode: 'queued',
      jobId: payload.jobId,
      imageId: done.image?.imageId || null,
    };
  }

  return {
    index: index + 1,
    mode: payload.processingMode || 'inline',
    jobId: null,
    imageId: payload.imageId || null,
  };
}

async function runParallelUploads({ count, concurrency, staggerMs, ...uploadOptions }) {
  let nextIndex = 0;

  async function worker(workerId) {
    const results = [];

    while (nextIndex < count) {
      const currentIndex = nextIndex;
      nextIndex += 1;

      if (staggerMs > 0 && currentIndex >= concurrency) {
        await sleep(staggerMs);
      }

      try {
        const value = await uploadOne({
          index: currentIndex,
          ...uploadOptions,
        });
        results.push({ status: 'fulfilled', value, workerId });
      } catch (error) {
        results.push({ status: 'rejected', reason: error, workerId });
      }
    }

    return results;
  }

  const workerResults = await Promise.all(
    Array.from({ length: concurrency }, (_value, workerId) => worker(workerId + 1)),
  );

  return workerResults.flat();
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (!options.file) {
    console.error('Usage: node scripts/stressUpload.js --file <path-to-image> [--count 100] [--url http://localhost:3000]');
    process.exitCode = 1;
    return;
  }

  const absolutePath = path.resolve(options.file);
  const fileBuffer = await fs.readFile(absolutePath);
  const fileName = path.basename(absolutePath);
  const mimeType = getMimeType(absolutePath);

  console.log(`Starting stress upload test with ${options.count} requests using ${fileName}`);
  console.log(`Target server: ${options.url}`);
  console.log(`Folder: ${options.folder}`);
  console.log(`Concurrency: ${options.concurrency}`);
  console.log(`Stagger between requests per worker: ${options.staggerMs}ms`);

  const beforeMetrics = await fetchMetrics(options.url);
  printMetrics('before', beforeMetrics);

  const startedAt = Date.now();
  const metricsInterval = setInterval(async () => {
    try {
      const metrics = await fetchMetrics(options.url);
      const elapsedSeconds = ((Date.now() - startedAt) / 1000).toFixed(1);
      printMetrics(`t+${elapsedSeconds}s`, metrics);
    } catch (error) {
      console.warn(`[metrics] ${error.message}`);
    }
  }, options.pollMs);

  try {
    const results = await runParallelUploads({
      count: options.count,
      concurrency: options.concurrency,
      staggerMs: options.staggerMs,
      baseUrl: options.url,
      fileBuffer,
      mimeType,
      fileName,
      folder: options.folder,
      imageName: options.imageName,
      pollMs: options.pollMs,
    });

    const successCount = results.filter((result) => result.status === 'fulfilled').length;
    const failureCount = results.length - successCount;
    const modeBreakdown = results
      .filter((result) => result.status === 'fulfilled')
      .reduce((summary, result) => {
        const mode = result.value.mode || 'unknown';
        summary[mode] = (summary[mode] || 0) + 1;
        return summary;
      }, {});

    const afterMetrics = await fetchMetrics(options.url);
    printMetrics('after', afterMetrics);

    console.log('--- Summary ---');
    console.log(`Successful uploads: ${successCount}`);
    console.log(`Failed uploads: ${failureCount}`);
    console.log(`Elapsed time: ${((Date.now() - startedAt) / 1000).toFixed(2)}s`);
    console.log(`RSS delta: ${(afterMetrics.current.rssMB - beforeMetrics.current.rssMB).toFixed(2)}MB`);
    console.log(`Mode breakdown: ${JSON.stringify(modeBreakdown)}`);

    if (failureCount > 0) {
      results
        .filter((result) => result.status === 'rejected')
        .slice(0, 10)
        .forEach((result, index) => {
          console.error(`Failure ${index + 1}: ${result.reason?.message || result.reason}`);
        });
      process.exitCode = 1;
    }
  } finally {
    clearInterval(metricsInterval);
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
