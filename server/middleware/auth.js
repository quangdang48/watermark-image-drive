export function requireJwt(req, _res, next) {
  req.user = {
    sub: 'anonymous',
    role: 'viewer',
  };

  return next();
}
