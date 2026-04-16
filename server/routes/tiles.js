import fs from 'node:fs';
import { access, readFile } from 'node:fs/promises';
import { Router } from 'express';
import sharp from 'sharp';
import { getImageRecord, resolveImagePath } from '../services/storage.js';

const router = Router();

function readCookieValue(cookieHeader, name) {
  const cookie = String(cookieHeader || '')
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`));

  if (!cookie) {
    return '';
  }

  return decodeURIComponent(cookie.slice(name.length + 1));
}

function sanitizeViewerName(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 48);
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getViewerNameFromRequest(req) {
  return sanitizeViewerName(
    req.query?.viewerName || req.get('x-viewer-name') || readCookieValue(req.headers.cookie, 'viewerName'),
  );
}

function createWatermarkSvg(viewerName, width = 256, height = 256) {
  const safeName = escapeXml(viewerName);
  const fontSize = Math.max(12, Math.round(Math.min(width, height) * 0.12));
  const padding = Math.max(2, Math.round(Math.min(width, height) * 0.05));
  const boxWidth = Math.max(1, Math.min(width - padding, Math.max(18, Math.round(width * 0.5))));
  const boxHeight = Math.max(1, Math.min(height - padding, Math.max(18, Math.round(height * 0.22))));
  const x = Math.max(0, width - boxWidth - padding);
  const y = Math.max(0, height - boxHeight - padding);

  return Buffer.from(`
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
      <g>
        <rect
          x="${x}"
          y="${y}"
          width="${boxWidth}"
          height="${boxHeight}"
          rx="6"
          fill="rgba(0,0,0,0.50)"
        />
        <rect
          x="${Math.max(0, width - Math.max(2, Math.ceil(width * 0.08)))}"
          y="0"
          width="${Math.max(2, Math.ceil(width * 0.08))}"
          height="${Math.max(2, Math.ceil(height * 0.08))}"
          fill="rgba(255,255,255,0.85)"
        />
        <text
          x="${x + Math.max(4, Math.round(boxWidth * 0.08))}"
          y="${Math.min(height - 4, y + Math.max(12, Math.round(boxHeight * 0.72)))}"
          fill="#ffffff"
          font-size="${fontSize}"
          font-family="Arial, sans-serif"
          font-weight="700"
        >
          ${safeName}
        </text>
      </g>
    </svg>
  `);
}

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

    const viewerName = getViewerNameFromRequest(req);

    res.set('Cache-Control', viewerName ? 'private, no-store' : 'private, max-age=60');
    res.set('Vary', 'Cookie');

    if (viewerName) {
      const tileImage = sharp(tilePath);
      const metadata = await tileImage.metadata();
      const renderedTile = await tileImage
        .composite([{ input: createWatermarkSvg(viewerName, metadata.width || 256, metadata.height || 256) }])
        .jpeg({ quality: 90 })
        .toBuffer();

      res.type('image/jpeg');
      return res.send(renderedTile);
    }

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
