import { Router } from 'express';
import { pastikanTabelSales } from './db.js';
import salesRoutes from './sales.routes.js';
import akunDemoRoutes from './akunDemo.routes.js';
import pembayaranRoutes from './pembayaran.routes.js';
import leadsWarungRoutes from './leadsWarung.routes.js';
import katalogRoutes from './katalog.routes.js';

// Semua API manajemen buat Warung Pintar (dipasang di /api/warung-pintar).
const router = Router();
router.use(async (req, res, next) => {
  try {
    await pastikanTabelSales();
    next();
  } catch (e) {
    next(e);
  }
});
router.use(salesRoutes);
router.use(akunDemoRoutes);
router.use(pembayaranRoutes);
router.use(leadsWarungRoutes);
router.use(katalogRoutes);
export default router;
