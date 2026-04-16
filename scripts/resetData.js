import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentFilePath = fileURLToPath(import.meta.url);
const currentDir = path.dirname(currentFilePath);
const rootDir = path.resolve(currentDir, '..');
const dataDir = path.join(rootDir, 'data');
const tilesDir = path.join(dataDir, 'tiles');
const dbPath = path.join(dataDir, 'db.json');

async function resetData() {
  await fs.mkdir(dataDir, { recursive: true });
  await fs.rm(tilesDir, { recursive: true, force: true });
  await fs.mkdir(tilesDir, { recursive: true });

  const emptyDb = {
    images: {},
    folders: {},
    settings: {},
  };

  await fs.writeFile(dbPath, JSON.stringify(emptyDb, null, 2), 'utf8');
  console.log('Local gallery data reset.');
}

resetData().catch((error) => {
  console.error('Failed to reset local gallery data:', error);
  process.exitCode = 1;
});
