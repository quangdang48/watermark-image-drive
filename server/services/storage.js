import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentFilePath = fileURLToPath(import.meta.url);
const currentDir = path.dirname(currentFilePath);
const rootDir = path.resolve(currentDir, '../..');
const dataDir = path.join(rootDir, 'data');
const tilesDir = path.join(dataDir, 'tiles');
const dbPath = path.join(dataDir, 'db.json');

function createDefaultDatabase() {
  return {
    images: {},
    settings: {},
  };
}

export async function ensureStorageReady() {
  await fs.mkdir(tilesDir, { recursive: true });

  try {
    await fs.access(dbPath);
  } catch {
    await writeDatabase(createDefaultDatabase());
  }
}

export async function readDatabase() {
  await ensureStorageReady();

  try {
    const raw = await fs.readFile(dbPath, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      images: parsed?.images || {},
      settings: parsed?.settings || {},
    };
  } catch {
    return createDefaultDatabase();
  }
}

export async function writeDatabase(database) {
  await fs.mkdir(dataDir, { recursive: true });
  const tempPath = `${dbPath}.${process.pid}.tmp`;
  await fs.writeFile(tempPath, JSON.stringify(database, null, 2), 'utf8');
  await fs.rename(tempPath, dbPath);
}

export async function saveImageRecord(record) {
  const database = await readDatabase();
  database.images[record.imageId] = record;
  await writeDatabase(database);
  return record;
}

export async function updateImageRecord(imageId, updates) {
  const database = await readDatabase();
  const existingRecord = database.images[imageId];

  if (!existingRecord) {
    return null;
  }

  const nextRecord = {
    ...existingRecord,
    ...updates,
  };

  database.images[imageId] = nextRecord;
  await writeDatabase(database);
  return nextRecord;
}

export async function renameFolderRecords(folderId, nextFolderName) {
  const database = await readDatabase();
  const updatedRecords = [];

  for (const imageRecord of Object.values(database.images)) {
    if ((imageRecord.folder || 'General') === folderId) {
      const updatedRecord = {
        ...imageRecord,
        folder: nextFolderName,
      };

      database.images[imageRecord.imageId] = updatedRecord;
      updatedRecords.push(updatedRecord);
    }
  }

  if (updatedRecords.length > 0) {
    await writeDatabase(database);
  }

  return updatedRecords;
}

export async function deleteImageRecord(imageId) {
  const database = await readDatabase();
  const existingRecord = database.images[imageId] || null;

  if (!existingRecord) {
    return null;
  }

  delete database.images[imageId];
  await writeDatabase(database);
  return existingRecord;
}

export async function deleteFolderRecords(folderId) {
  const database = await readDatabase();
  const deletedRecords = [];

  for (const imageRecord of Object.values(database.images)) {
    if ((imageRecord.folder || 'General') === folderId) {
      deletedRecords.push(imageRecord);
      delete database.images[imageRecord.imageId];
    }
  }

  if (deletedRecords.length > 0) {
    await writeDatabase(database);
  }

  return deletedRecords;
}

export async function getImageRecord(imageId) {
  const database = await readDatabase();
  return database.images[imageId] || null;
}

export async function listImageRecords() {
  const database = await readDatabase();

  return Object.values(database.images)
    .sort((left, right) => new Date(right.createdAt || 0).getTime() - new Date(left.createdAt || 0).getTime());
}

export function resolveImageRoot(imageId) {
  if (!/^[a-zA-Z0-9-]+$/.test(imageId)) {
    throw new Error('Invalid image id');
  }

  return path.join(tilesDir, imageId);
}

export function resolveImagePath(imageId, ...segments) {
  const imageRoot = resolveImageRoot(imageId);
  const resolvedPath = path.resolve(imageRoot, ...segments);

  if (!resolvedPath.startsWith(imageRoot)) {
    throw new Error('Invalid tile path');
  }

  return resolvedPath;
}
