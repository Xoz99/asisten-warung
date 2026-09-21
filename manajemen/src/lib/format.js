export const rupiah = (n) => (n < 0 ? '-Rp ' : 'Rp ') + Math.abs(Math.round(n || 0)).toLocaleString('id-ID');
export const tgl = (t) => (t ? new Date(t).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : '-');
export const waktu = (t) => (t ? new Date(t).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '-');
// "2026-09" -> "Sep 2026"
export const bulanLabel = (b, panjang = false) => {
  const [y, m] = String(b).split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('id-ID', { month: panjang ? 'long' : 'short', year: panjang ? 'numeric' : undefined });
};
export const waktuRelatif = (t) => {
  const d = (Date.now() - new Date(t).getTime()) / 1000;
  if (d < 60) return 'barusan';
  if (d < 3600) return `${Math.floor(d / 60)} menit lalu`;
  if (d < 86400) return `${Math.floor(d / 3600)} jam lalu`;
  if (d < 86400 * 7) return `${Math.floor(d / 86400)} hari lalu`;
  return tgl(t);
};
export const tampilHp = (hp) => (hp ? (hp.startsWith('62') ? '0' + hp.slice(2) : hp) : '-');
