export const rupiah = (n) => 'Rp ' + Math.round(n || 0).toLocaleString('id-ID');
export const tgl = (t) => (t ? new Date(t).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : '-');
