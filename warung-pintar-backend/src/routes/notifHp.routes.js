import { Router } from 'express';
import { ambilNotifBaru } from '../services/notifHp.service.js';

// Dipanggil APK Asisten Warung dari latar belakang (NotifWorker.java) tiap ±15 menit. Lihat notifHp.service.js.
const router = Router();

router.get('/baru', async (req, res, next) => {
  try {
    const sejak = /^\d{1,18}$/.test(String(req.query.sejak || '')) ? req.query.sejak : null;
    res.json(await ambilNotifBaru(req.warungId, sejak));
  } catch (e) {
    next(e);
  }
});

export default router;
