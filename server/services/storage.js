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
    folders: {},
    settings: {},
  };
}

function ensureFolderRecord(database, folderId, createdAt = new Date().toISOString()) {
  const normalizedFolderId = String(folderId || 'General').trim() || 'General';

  if (!database.folders[normalizedFolderId]) {
    database.folders[normalizedFolderId] = {
      folderId: normalizedFolderId,
      createdAt,
    };
  }

  return database.folders[normalizedFolderId];
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
      folders: parsed?.folders || {},
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
  ensureFolderRecord(database, record.folder || 'General', record.createdAt);
  database.images[record.imageId] = record;
  await writeDatabase(database);
  return record;
}

export async function createFolderRecord(folderId) {
  const database = await readDatabase();
  const normalizedFolderId = String(folderId || 'General').trim() || 'General';

  if (database.folders[normalizedFolderId]) {
    return null;
  }

  const folderRecord = ensureFolderRecord(database, normalizedFolderId);
  await writeDatabase(database);
  return folderRecord;
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

  ensureFolderRecord(database, nextRecord.folder || 'General', existingRecord.createdAt);
  database.images[imageId] = nextRecord;
  await writeDatabase(database);
  return nextRecord;
}

export async function renameFolderRecords(folderId, nextFolderName) {
  const database = await readDatabase();
  const updatedRecords = [];
  const hasExistingFolder = Boolean(database.folders[folderId]);

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

  if (!hasExistingFolder && updatedRecords.length === 0) {
    return null;
  }

  delete database.folders[folderId];
  ensureFolderRecord(database, nextFolderName);
  await writeDatabase(database);
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
  const hasExistingFolder = Boolean(database.folders[folderId]);

  for (const imageRecord of Object.values(database.images)) {
    if ((imageRecord.folder || 'General') === folderId) {
      deletedRecords.push(imageRecord);
      delete database.images[imageRecord.imageId];
    }
  }

  if (!hasExistingFolder && deletedRecords.length === 0) {
    return null;
  }

  delete database.folders[folderId];
  await writeDatabase(database);
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

export async function listFolderRecords() {
  const database = await readDatabase();

  return Object.values(database.folders)
    .sort((left, right) => String(left.folderId).localeCompare(String(right.folderId)));
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
