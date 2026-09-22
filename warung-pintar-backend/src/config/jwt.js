import 'dotenv/config';

export const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.trim().length < 32) {
  throw new Error('JWT_SECRET wajib diisi minimal 32 karakter acak.');
}
