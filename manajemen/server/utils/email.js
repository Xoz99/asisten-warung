import nodemailer from 'nodemailer';

// Kirim email lewat SMTP (Google Workspace, Zoho, Brevo, Resend, Amazon SES, dll - semuanya punya SMTP).
// Belum disetel (SMTP_HOST / EMAIL_DARI kosong) = nggak ngirim apa-apa, sama kayak WA_TOKEN kosong.
//   SMTP_HOST=smtp.contoh.com  SMTP_PORT=587  SMTP_USER=...  SMTP_PASS=...  EMAIL_DARI="Makalin <noreply@konsulin.com>"
// SMTP_HOST=uji = nggak nyambung ke mana-mana, emailnya cuma dibalikin sebagai JSON (buat tes lokal).
let transport = null;
export const emailAktif = () => Boolean(process.env.SMTP_HOST && process.env.EMAIL_DARI);
export const URL_MAKALIN = () => (process.env.MAKALIN_URL || 'https://makalin.konsulin.com').replace(/\/+$/, '');

function ambilTransport() {
  if (!transport) {
    const port = Number(process.env.SMTP_PORT || 587);
    transport =
      process.env.SMTP_HOST === 'uji'
        ? nodemailer.createTransport({ jsonTransport: true })
        : nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port,
            secure: port === 465,
            auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
          });
  }
  return transport;
}

const escHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// Email polos: paragraf teks + satu tombol. `paragraf` = array string (teks biasa, di-escape).
export function susunEmail({ sapaan, paragraf, tombol }) {
  const teks = [sapaan, '', ...paragraf.flatMap((p) => [p, '']), ...(tombol ? [`${tombol.label}: ${tombol.url}`, ''] : []), 'Makalin · Konsulin'].join('\n');
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#111;max-width:520px">
<p>${escHtml(sapaan)}</p>
${paragraf.map((p) => `<p>${escHtml(p)}</p>`).join('\n')}
${tombol ? `<p><a href="${escHtml(tombol.url)}" style="display:inline-block;background:#1D4ED8;color:#fff;text-decoration:none;font-weight:bold;padding:12px 18px;border-radius:8px">${escHtml(tombol.label)}</a></p>` : ''}
<p style="color:#666;font-size:13px">Makalin · Konsulin</p>
</div>`;
  return { teks, html };
}

// Balikin { terkirim, alasan }. Nggak pernah throw - gagal kirim email nggak boleh ngegagalin aksi utamanya.
export async function kirimEmail({ ke, judul, teks, html }) {
  if (!ke) return { terkirim: false, alasan: 'sales belum ngisi email' };
  if (!emailAktif()) return { terkirim: false, alasan: 'email belum disetel di server' };
  try {
    const info = await ambilTransport().sendMail({ from: process.env.EMAIL_DARI, to: ke, subject: judul, text: teks, html });
    return { terkirim: true, info };
  } catch (e) {
    console.error('Kirim email gagal:', e.message);
    return { terkirim: false, alasan: 'gagal: ' + e.message.slice(0, 120) };
  }
}
