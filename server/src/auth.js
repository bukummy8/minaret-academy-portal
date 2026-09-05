import jwt from 'jsonwebtoken';
import { query } from './db.js';
const secret = process.env.JWT_SECRET;
if (!secret) throw new Error('JWT_SECRET is required');
export function signUser(user) { return jwt.sign({ sub: user.id, role: user.role }, secret, { expiresIn: '8h' }); }
export async function requireAuth(req,res,next) {
  try {
    const token = req.cookies?.session;
    if (!token) return res.status(401).json({ error: 'Authentication required' });
    const payload = jwt.verify(token, secret);
    const { rows } = await query('SELECT id,name,email,phone,role,active,timezone FROM users WHERE id=$1', [payload.sub]);
    if (!rows[0] || !rows[0].active) return res.status(401).json({ error: 'Account unavailable' });
    req.user = rows[0]; next();
  } catch { res.status(401).json({ error: 'Invalid or expired session' }); }
}
export function requireRole(...roles) { return (req,res,next) => roles.includes(req.user.role) ? next() : res.status(403).json({ error: 'Forbidden' }); }
