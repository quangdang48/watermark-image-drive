function formatMegabytes(bytes) {
  return Number((bytes / (1024 * 1024)).toFixed(2));
}

const recentSnapshots = [];

export function buildMemorySnapshot(label = 'current', extra = {}) {
  const usage = process.memoryUsage();

  return {
    label,
    at: new Date().toISOString(),
    rssBytes: usage.rss,
    heapTotalBytes: usage.heapTotal,
    heapUsedBytes: usage.heapUsed,
    externalBytes: usage.external,
    arrayBuffersBytes: usage.arrayBuffers || 0,
    rssMB: formatMegabytes(usage.rss),
    heapTotalMB: formatMegabytes(usage.heapTotal),
    heapUsedMB: formatMegabytes(usage.heapUsed),
    externalMB: formatMegabytes(usage.external),
    arrayBuffersMB: formatMegabytes(usage.arrayBuffers || 0),
    ...extra,
  };
}

export function recordMemorySnapshot(label, extra = {}) {
  const snapshot = buildMemorySnapshot(label, extra);
  recentSnapshots.unshift(snapshot);

  if (recentSnapshots.length > 200) {
    recentSnapshots.length = 200;
  }

  console.log(
    `[memory] ${snapshot.label} rss=${snapshot.rssMB}MB heapUsed=${snapshot.heapUsedMB}MB external=${snapshot.externalMB}MB`,
  );

  return snapshot;
}

export function getMemoryMetrics(limit = 50) {
  return {
    status: 'ok',
    current: buildMemorySnapshot('current'),
    recent: recentSnapshots.slice(0, limit),
  };
}

recordMemorySnapshot('process:startup');
