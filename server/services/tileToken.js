export function mintTileToken({ imageId }) {
  return {
    token: null,
    expiresAt: null,
    expiresIn: null,
    imageId,
  };
}

export function verifyTileToken(_token, expectedImageId) {
  return {
    imageId: expectedImageId || null,
    sub: 'anonymous',
    role: 'viewer',
  };
}

export function readTileTokenFromRequest(_req) {
  return null;
}

export function requireTileToken(req, _res, next) {
  req.tileAccess = verifyTileToken(null, req.params.id);
  return next();
}
