import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import {
  ensureStorageReady,
  resolveImagePath,
  resolveImageRoot,
} from './storage.js';

async function normalizeGeneratedTiles(imageId) {
  const legacyTilesDir = resolveImagePath(imageId, 'image_files');
  const entries = await fs.readdir(legacyTilesDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory() || !/^\d+$/.test(entry.name)) {
      continue;
    }

    const sourceLevelDir = path.join(legacyTilesDir, entry.name);
    const targetLevelDir = resolveImagePath(imageId, entry.name);
    await fs.mkdir(targetLevelDir, { recursive: true });

    const tiles = await fs.readdir(sourceLevelDir, { withFileTypes: true });
    for (const tile of tiles) {
      if (!tile.isFile()) {
        continue;
      }

      const sourceTilePath = path.join(sourceLevelDir, tile.name);
      const targetTileName = tile.name.replace(/\.jpeg$/i, '.jpg');
      const targetTilePath = path.join(targetLevelDir, targetTileName);
      await fs.copyFile(sourceTilePath, targetTilePath);
    }
  }

  await fs.rm(legacyTilesDir, { recursive: true, force: true });
}

async function rewriteManifestUrl(imageId) {
  const manifestPath = resolveImagePath(imageId, 'image.dzi');
  const manifest = await fs.readFile(manifestPath, 'utf8');
  const rewrittenManifest = manifest
    .replace(/Url="[^"]*"/, 'Url=""')
    .replace(/Format="jpeg"/, 'Format="jpg"');

  await fs.writeFile(manifestPath, rewrittenManifest, 'utf8');
}

async function listGeneratedLevels(imageId) {
  const entries = await fs.readdir(resolveImageRoot(imageId), { withFileTypes: true });

  return entries
    .filter((entry) => entry.isDirectory() && /^\d+$/.test(entry.name))
    .map((entry) => Number(entry.name))
    .sort((left, right) => left - right);
}

export async function processImageUpload({ buffer }) {
  await ensureStorageReady();

  const imageId = crypto.randomUUID();
  const imageRoot = resolveImageRoot(imageId);
  await fs.mkdir(imageRoot, { recursive: true });

  const metadata = await sharp(buffer).rotate().metadata();
  const manifestBasePath = resolveImagePath(imageId, 'image');
  const manifestPath = resolveImagePath(imageId, 'image.dzi');
  const downloadPath = resolveImagePath(imageId, 'download.jpg');

  await sharp(buffer)
    .rotate()
    .jpeg({ quality: 92 })
    .toFile(downloadPath);

  await sharp(buffer)
    .rotate()
    .jpeg({ quality: 90 })
    .tile({
      size: 256,
      overlap: 0,
      layout: 'dz',
    })
    .toFile(manifestBasePath);

  await normalizeGeneratedTiles(imageId);
  await rewriteManifestUrl(imageId);

  return {
    imageId,
    metadata: {
      width: metadata.width,
      height: metadata.height,
      format: metadata.format,
      space: metadata.space,
    },
    levels: await listGeneratedLevels(imageId),
    manifestPath,
  };
}
