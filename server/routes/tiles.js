import fs from 'node:fs';
import { access, readFile } from 'node:fs/promises';
import { Router } from 'express';
import { getImageRecord, resolveImagePath } from '../services/storage.js';

const router = Router();

router.get('/:id/image.dzi', async (req, res, next) => {
  try {
    const record = await getImageRecord(req.params.id);
    if (!record) {
      return res.status(404).json({ error: 'Image not found' });
    }

    const manifestPath = resolveImagePath(req.params.id, 'image.dzi');
    const manifest = await readFile(manifestPath, 'utf8');

    res.set('Cache-Control', 'private, max-age=60');
    res.type('application/xml');
    return res.send(manifest);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return res.status(404).json({ error: 'Manifest not found' });
    }

    return next(error);
  }
});

async function serveTile(req, res, next) {
  try {
    const { id, z, tileName, tileRoot } = req.params;

    if (!/^\d+$/.test(z)) {
      return res.status(400).json({ error: 'Invalid zoom level' });
    }

    const normalizedTileName = tileName.replace(/\.(jpg|jpeg|png)$/i, '');
    if (!/^\d+_\d+$/.test(normalizedTileName)) {
      return res.status(400).json({ error: 'Invalid tile coordinates' });
    }

    if (tileRoot && !/^[a-zA-Z0-9._-]+$/.test(tileRoot)) {
      return res.status(400).json({ error: 'Invalid tile root' });
    }

    const directoryCandidates = [...new Set([tileRoot, '', 'image_files', 'image.dzi_files'].filter((value) => value !== undefined))];
    const candidates = [];

    for (const directory of directoryCandidates) {
      for (const extension of ['jpg', 'jpeg', 'png']) {
        candidates.push(
          directory
            ? resolveImagePath(id, directory, z, `${normalizedTileName}.${extension}`)
            : resolveImagePath(id, z, `${normalizedTileName}.${extension}`),
        );
      }
    }

    let tilePath = null;
    for (const candidate of candidates) {
      try {
        await access(candidate);
        tilePath = candidate;
        break;
      } catch {
        // try the next candidate
      }
    }

    if (!tilePath) {
      return res.status(404).json({ error: 'Tile not found' });
    }

    res.set('Cache-Control', 'private, max-age=60');
    res.type(tilePath.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg');
    fs.createReadStream(tilePath).on('error', next).pipe(res);
    return undefined;
  } catch (error) {
    if (error.message === 'Invalid image id' || error.message === 'Invalid tile path') {
      return res.status(400).json({ error: 'Invalid tile request' });
    }

    return next(error);
  }
}

router.get('/:id/:z/:tileName', serveTile);
router.get('/:id/:tileRoot/:z/:tileName', serveTile);

export default router;
