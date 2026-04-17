import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import uploadRouter from './routes/upload.js';
import tilesRouter from './routes/tiles.js';
import { uploadErrorHandler } from './middleware/upload.js';
import { getMemoryMetrics } from './services/runtimeMetrics.js';

const currentFilePath = fileURLToPath(import.meta.url);
const currentDir = path.dirname(currentFilePath);
const publicDir = path.resolve(currentDir, '../public');
const indexFile = path.join(publicDir, 'index.html');

export function createApp() {
  const app = express();
  app.use(express.json());
  app.use(express.static(publicDir));

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.get('/api/metrics/memory', (_req, res) => {
    res.json(getMemoryMetrics());
  });

  app.get(['/', '/teacher', '/student'], (_req, res) => {
    res.sendFile(indexFile);
  });

  app.use('/upload', uploadRouter);
  app.use('/tiles', tilesRouter);
  app.use(uploadErrorHandler);

  app.use((req, res) => {
    res.status(404).json({ error: 'Route not found' });
  });

  app.use((error, _req, res, _next) => {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}

export default createApp;
