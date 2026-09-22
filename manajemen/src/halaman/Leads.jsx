import { Kosong, Tabs } from '../komponen/Ui.jsx';
import Sales from '../produk/warung-pintar/Sales.jsx';
import LeadsCrm from './LeadsCrm.jsx';
import PelangganWp from './PelangganWp.jsx';

// Leads Management: CRM (prospek bisnis, sesuai referensi), WARUNG (otomatis dari pendaftaran Warung Pintar), SALES.
const TABS = [
  { id: 'crm', nama: 'Pipeline CRM' },
  { id: 'warung', nama: 'Pelanggan & sales' },
  { id: 'sales', nama: 'Sales' },
];

export default function Leads({ api, apiProduk, produkWp, tab }) {
  const aktif = TABS.some((t) => t.id === tab) ? tab : 'crm';
  const tabs = <Tabs daftar={TABS} aktif={aktif} href={(id) => `#/leads/${id}`} />;
  return (
    <>
      <h1 className="sr-only">Leads Management</h1>
      {aktif === 'crm' ? <LeadsCrm api={api} tabs={tabs} /> : tabs}
      {aktif === 'warung' && (apiProduk ? <PelangganWp api={apiProduk} /> : <ProdukMati />)}
      {aktif === 'sales' && (apiProduk ? <Sales api={apiProduk} produk={produkWp} /> : <ProdukMati />)}
    </>
  );
}

function ProdukMati() {
  return (
    <Kosong judul="Warung Pintar belum disambungin">
      Isi WARUNG_PINTAR_DATABASE_URL di .env server manajemen, lalu restart servernya.
    </Kosong>
  );
}
