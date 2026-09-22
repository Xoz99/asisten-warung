import { JWT_SECRET } from '../config/jwt.js';
import jwt from 'jsonwebtoken';

export function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Token tidak ada - silakan login dulu' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (typeof payload.warungId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(payload.warungId)) throw new Error('Invalid tenant');
    req.warungId = payload.warungId;
    next();
  } catch {
    return res.status(401).json({ error: 'Token tidak valid atau kedaluwarsa' });
  }
}
