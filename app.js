'use strict';
/* =====================================================================
   EKONOMICHEFEN – appen (offline-first)
   Allt sparas först på enheten och synkroniseras automatiskt
   med ditt Google-konto när det finns internet.
   ===================================================================== */
const APP_VERSION = '0.2.0';

/* ---------- Kategorier och BAS-förslag ---------- */
const KAT = {
  Privatekonomi: {
    Utgift: [
      { n: 'Boende', fast: true }, { n: 'Mat & hushåll' }, { n: 'Transport' }, { n: 'Försäkringar', fast: true },
      { n: 'Abonnemang', fast: true }, { n: 'Lån & avbetalningar', fast: true }, { n: 'Hälsa' }, { n: 'Kläder' },
      { n: 'Nöje & restaurang' }, { n: 'Resor' }, { n: 'Gåvor' }, { n: 'Övrigt' }
    ],
    Inkomst: [{ n: 'Lön' }, { n: 'Ersättning & bidrag' }, { n: 'Återbetalning' }, { n: 'Övrigt' }],
    Sparande: [{ n: 'Buffert' }, { n: 'Långsiktigt sparande' }, { n: 'Investeringar' }]
  },
  Företag: {
    Utgift: [
      { n: 'Lokalhyra', bas: '5010', moms: 25 },
      { n: 'Utrustning & inventarier', bas: '5410', moms: 25 },
      { n: 'Förbrukningsmaterial', bas: '5460', moms: 25 },
      { n: 'Programvara & appar', bas: '5420', moms: 25 },
      { n: 'Telefon', bas: '6212', moms: 25 },
      { n: 'Internet', bas: '6230', moms: 25 },
      { n: 'Marknadsföring', bas: '5910', moms: 25 },
      { n: 'Representation', bas: '6071', moms: 25 },
      { n: 'Resor', bas: '5800', moms: 6 },
      { n: 'Drivmedel', bas: '5611', moms: 25 },
      { n: 'Utbildning', bas: '6991', moms: 25 },
      { n: 'Facklitteratur', bas: '6970', moms: 6 },
      { n: 'Kontorsmaterial', bas: '6110', moms: 25 },
      { n: 'Arbetskläder', bas: '5480', moms: 25 },
      { n: 'Försäkring', bas: '6310', moms: 0 },
      { n: 'Bankavgifter', bas: '6570', moms: 0 },
      { n: 'Redovisning', bas: '6530', moms: 25 },
      { n: 'Övrigt', bas: '6991', moms: 25 }
    ],
    Inkomst: [
      { n: 'Tjänster', bas: '3041', moms: 25 },
      { n: 'Paket & abonnemang', bas: '3041', moms: 25 },
      { n: 'Kurser & utbildning', bas: '3041', moms: 25 },
      { n: 'Rådgivning', bas: '3041', moms: 25 },
      { n: 'Övrig försäljning', bas: '3041', moms: 25 }
    ],
    'Eget uttag': [{ n: 'Eget uttag', bas: '2013', moms: 0 }],
    'Egen insättning': [{ n: 'Egen insättning', bas: '2018', moms: 0 }]
  }
};
const FASTA = new Set(KAT.Privatekonomi.Utgift.filter(k => k.fast).map(k => k.n));
const KONTO_TYPER = {
  Privatekonomi: ['Lönekonto', 'Sparkonto', 'Buffert', 'Investering', 'Kreditkort', 'Övrigt'],
  Företag: ['Företagskonto', 'Skattekonto', 'Sparkonto', 'Övrigt']
};
const SETTINGS_META = [
  { k: 'malDisponibelt', l: 'Mål: privat disponibelt per månad', s: 'kr', d: '40000' },
  { k: 'malOmsattning', l: 'Mål: Företags omsättning per månad (exkl. moms)', s: 'kr', d: '100000' },
  { k: 'malBuffert', l: 'Mål: buffert', s: 'kr', d: '100000' },
  { k: 'snittprisPerPass', l: 'Snittpris per försäljning (exkl. moms)', s: 'kr', d: '700' },
  { k: 'egenavgiftProcent', l: 'Egenavgifter – kontrollera aktuell sats hos Skatteverket', s: '%', d: '28.97' },
  { k: 'kommunalskattProcent', l: 'Kommunal- och regionskatt', s: '%', d: '32' },
  { k: 'schablonavdragProcent', l: 'Schablonavdrag för egenavgifter', s: '%', d: '25' }
];

/* ---------- Hjälpfunktioner ---------- */
const $ = s => document.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const NF = new Intl.NumberFormat('sv-SE', { style: 'currency', currency: 'SEK', maximumFractionDigits: 0 });
const kr = v => NF.format(Math.round(Number(v) || 0));
const round2 = v => Math.round(v * 100) / 100;
const parseAmt = v => { const n = Number(String(v == null ? '' : v).replace(/\s|kr/gi, '').replace(',', '.')); return isFinite(n) ? round2(n) : NaN; };
const pad = n => String(n).padStart(2, '0');
const today = () => { const d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
const MONTHS = ['januari', 'februari', 'mars', 'april', 'maj', 'juni', 'juli', 'augusti', 'september', 'oktober', 'november', 'december'];
const monthLabel = ym => { const [y, m] = ym.split('-'); return MONTHS[+m - 1] + ' ' + y; };
const monthShort = ym => MONTHS[+ym.slice(5, 7) - 1].slice(0, 3);
const shiftMonth = (ym, n) => { let [y, m] = ym.split('-').map(Number); m += n; while (m < 1) { m += 12; y--; } while (m > 12) { m -= 12; y++; } return y + '-' + pad(m); };
const shortKr = v => Math.abs(v) >= 1000 ? Math.round(v / 1000) + ' tkr' : Math.round(v) + '';
const timeLabel = iso => { if (!iso) return ''; const d = new Date(iso); const sameDay = d.toDateString() === new Date().toDateString(); return (sameDay ? '' : d.getDate() + '/' + (d.getMonth() + 1) + ' ') + pad(d.getHours()) + ':' + pad(d.getMinutes()); };
function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16)); b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
  const h = [...b].map(x => x.toString(16).padStart(2, '0')).join('');
  return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
}
const DEVICE = (() => {
  const u = navigator.userAgent;
  if (/iPhone/.test(u)) return 'iPhone';
  if (/iPad/.test(u) || (/Macintosh/.test(u) && navigator.maxTouchPoints > 1)) return 'iPad';
  if (/Windows/.test(u)) return 'Windows-dator';
  if (/Android/.test(u)) return 'Android';
  if (/Macintosh/.test(u)) return 'Mac';
  return 'Webbläsare';
})();

/* =====================================================================
   LOKAL DATABAS (IndexedDB) – fungerar utan internet
   ===================================================================== */
const DB = (() => {
  let dbp;
  const open = () => dbp || (dbp = new Promise((res, rej) => {
    const r = indexedDB.open('ekonomichefen', 1);
    r.onupgradeneeded = () => {
      const d = r.result;
      d.createObjectStore('records', { keyPath: 'id' });  // lokal kopia av all data
      d.createObjectStore('outbox', { keyPath: 'opId' }); // ändringar som väntar på synk
      d.createObjectStore('files', { keyPath: 'id' });    // kvitton som väntar på uppladdning
      d.createObjectStore('meta');                        // inställningar, koppling, synkstatus
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  }));
  const wrap = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const done = t => new Promise((res, rej) => { t.oncomplete = () => res(); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error); });
  return {
    async get(store, key) { const d = await open(); return wrap(d.transaction(store).objectStore(store).get(key)); },
    async all(store) { const d = await open(); return wrap(d.transaction(store).objectStore(store).getAll()); },
    async put(store, val, key) { const d = await open(); const t = d.transaction(store, 'readwrite'); key === undefined ? t.objectStore(store).put(val) : t.objectStore(store).put(val, key); return done(t); },
    async del(store, key) { const d = await open(); const t = d.transaction(store, 'readwrite'); t.objectStore(store).delete(key); return done(t); },
    async wipe() { const d = await open(); d.close(); dbp = null; return wrap(indexedDB.deleteDatabase('ekonomichefen')); }
  };
})();

/* =====================================================================
   TILLSTÅND
   ===================================================================== */
const S = {
  config: null, tx: [], konton: [], outbox: [], pendingFiles: 0,
  settings: {}, lankar: null, lastSync: '', syncing: false, authError: '',
  view: 'oversikt', month: today().slice(0, 7), form: null, devices: null
};
const set = k => { const v = Number(String(S.settings[k] ?? (SETTINGS_META.find(m => m.k === k) || {}).d ?? 0).replace(',', '.')); return isFinite(v) ? v : 0; };

async function loadLocal() {
  const recs = await DB.all('records');
  S.tx = recs.filter(r => r._sheet === 'Transaktioner');
  S.konton = recs.filter(r => r._sheet === 'Konton').sort((a, b) => a.namn.localeCompare(b.namn, 'sv'));
  S.outbox = await DB.all('outbox');
  S.pendingFiles = (await DB.all('files')).length;
  S.settings = (await DB.get('meta', 'settings')) || {};
  S.lankar = await DB.get('meta', 'lankar');
  S.lastSync = (await DB.get('meta', 'lastSync')) || '';
}

/* =====================================================================
   KOMMUNIKATION MED GOOGLE
   ===================================================================== */
async function call(action, payload, opts = {}) {
  const cfg = opts.config || S.config;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeout || 45000);
  try {
    const r = await fetch(cfg.apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(Object.assign({ action, deviceKey: cfg.deviceKey }, payload || {})),
      signal: ctrl.signal,
      redirect: 'follow'
    });
    if (!r.ok) throw new Error('Google svarade med fel (' + r.status + ').');
    let j;
    try { j = await r.json(); } catch (e) { throw new Error('Oväntat svar från Google. Kontrollera webbappens adress och att åtkomsten är "Alla".'); }
    if (!j.ok) { const e = new Error(j.error || 'Okänt fel'); e.auth = !!j.auth; throw e; }
    return j;
  } catch (e) {
    if (e.name === 'AbortError' || e instanceof TypeError) {
      const n = new Error('Ingen kontakt med Google just nu.'); n.offline = true; throw n;
    }
    throw e;
  } finally { clearTimeout(timer); }
}

/* =====================================================================
   ÄNDRINGSKÖ – allt sparas lokalt först
   ===================================================================== */
const strip = r => { const o = {}; Object.keys(r).forEach(k => { if (k[0] !== '_') o[k] = r[k]; }); return o; };

async function queueSave(sheet, rec) {
  const outbox = await DB.all('outbox');
  const prev = outbox.find(o => o.record && o.record.id === rec.id && o.status !== 'sent');
  await DB.put('records', Object.assign({}, rec, { _sheet: sheet, _pending: true }));
  const op = { opId: uuid(), type: 'save', sheet, record: strip(rec), status: 'pending', t: Date.now() };
  if (prev) {
    // Slå ihop med tidigare osynkad ändring av samma post
    op.baseVersion = prev.status === 'conflict' && prev.server ? Number(prev.server.version) : prev.baseVersion;
    await DB.del('outbox', prev.opId);
  } else {
    op.baseVersion = Number(rec.version) || 0;
  }
  await DB.put('outbox', op);
  await afterLocalChange();
}

async function queueDelete(sheet, rec) {
  const outbox = await DB.all('outbox');
  const prev = outbox.find(o => o.record && o.record.id === rec.id);
  let base = Number(rec.version) || 0;
  if (prev) {
    await DB.del('outbox', prev.opId);
    base = prev.status === 'conflict' && prev.server ? Number(prev.server.version) : prev.baseVersion;
  }
  if (String(rec.kvittoId || '').startsWith('local:')) await DB.del('files', rec.kvittoId.slice(6));
  await DB.del('records', rec.id);
  if (base > 0) await DB.put('outbox', { opId: uuid(), type: 'delete', sheet, record: { id: rec.id }, baseVersion: base, status: 'pending', t: Date.now() });
  await afterLocalChange();
}

async function queueSettings(values) {
  S.settings = Object.assign({}, S.settings, values);
  await DB.put('meta', S.settings, 'settings');
  const prev = (await DB.all('outbox')).find(o => o.type === 'settings' && o.status === 'pending');
  if (prev) await DB.del('outbox', prev.opId);
  await DB.put('outbox', { opId: uuid(), type: 'settings', values: Object.assign({}, prev ? prev.values : {}, values), status: 'pending', t: Date.now() });
  await afterLocalChange();
}

async function afterLocalChange() { await loadLocal(); render(); sync(); }

/* =====================================================================
   SYNKRONISERING
   1. Ladda upp väntande kvitton till Drive
   2. Skicka väntande ändringar
   3. Hämta det som ändrats på andra enheter
   ===================================================================== */
async function sync(manual) {
  if (!S.config) return;
  if (S.syncing) { S.syncAgain = true; return; } // kör igen direkt efter pågående synk
  if (!navigator.onLine && !manual) { renderSync(); return; }
  S.syncing = true; renderSync();
  try {
    // 1. Kvitton
    for (const f of await DB.all('files')) {
      const up = await call('upload', { file: { id: f.id, ekonomi: f.ekonomi, datum: f.datum, kategori: f.kategori, namn: f.namn, mime: f.mime, data: f.data.split(',')[1] } }, { timeout: 120000 });
      await replaceLocalFile(f.id, up);
      await DB.del('files', f.id);
    }

    // 2 + 3. Ändringar
    const ops = (await DB.all('outbox')).filter(o => o.status === 'pending').sort((a, b) => a.t - b.t);
    if (ops.some(o => o.record && String(o.record.kvittoId || '').startsWith('local:'))) throw new Error('Kvitton väntar fortfarande på uppladdning.');
    const since = (await DB.get('meta', 'since')) || '';
    const res = await call('sync', {
      since,
      ops: ops.map(o => ({ opId: o.opId, type: o.type, sheet: o.sheet, record: o.record, baseVersion: o.baseVersion, values: o.values }))
    }, { timeout: 90000 });

    for (const r of res.results) {
      const op = ops.find(o => o.opId === r.opId);
      if (!op) continue;
      if (r.status === 'ok') {
        await DB.del('outbox', op.opId);
        if (r.record) await DB.put('records', Object.assign({}, r.record, { _sheet: op.sheet }));
      } else {
        op.status = r.status === 'conflict' ? 'conflict' : 'error';
        op.server = r.server || null;
        op.error = r.error;
        await DB.put('outbox', op);
      }
    }

    const waiting = new Set((await DB.all('outbox')).filter(o => o.record).map(o => o.record.id));
    const seen = new Set();
    for (const sheet of ['Transaktioner', 'Konton']) {
      for (const rec of res.changes[sheet] || []) {
        seen.add(rec.id);
        if (waiting.has(rec.id)) continue; // din osynkade ändring vinner tills den är skickad
        if (rec.status === 'Raderad') await DB.del('records', rec.id);
        else await DB.put('records', Object.assign({}, rec, { _sheet: sheet }));
      }
    }
    if (res.full) {
      for (const r of await DB.all('records')) if (!seen.has(r.id) && !waiting.has(r.id) && !r._pending) await DB.del('records', r.id);
    }

    const pendingSettings = (await DB.all('outbox')).some(o => o.type === 'settings');
    if (!pendingSettings) await DB.put('meta', res.installningar || {}, 'settings');
    await DB.put('meta', res.lankar, 'lankar');
    await DB.put('meta', res.serverTime, 'since');
    await DB.put('meta', new Date().toISOString(), 'lastSync');
    S.authError = '';
    await loadLocal();
    render();
    if (manual) toast('Synkroniserat ✓');
  } catch (e) {
    if (e.auth) { S.authError = e.message; render(); }
    else if (manual || !e.offline) toast(e.message, 'err');
  } finally {
    S.syncing = false;
    renderSync();
    if (S.syncAgain) { S.syncAgain = false; setTimeout(() => sync(), 150); }
  }
}

async function replaceLocalFile(fileId, up) {
  const ref = 'local:' + fileId;
  for (const r of await DB.all('records')) {
    if (r.kvittoId === ref) { r.kvittoId = up.kvittoId; r.kvittoNamn = up.kvittoNamn; await DB.put('records', r); }
  }
  for (const o of await DB.all('outbox')) {
    if (o.record && o.record.kvittoId === ref) { o.record.kvittoId = up.kvittoId; o.record.kvittoNamn = up.kvittoNamn; await DB.put('outbox', o); }
  }
}

/* =====================================================================
   BERÄKNINGAR
   Omsättning och kostnader i firman räknas exklusive moms.
   Eget uttag är INTE en kostnad och INTE lön – det är pengar du flyttar
   från firman till dig själv, och räknas därför som privat inflöde.
   ===================================================================== */
const inMonth = ym => t => String(t.datum).slice(0, 7) === ym;
const inYearTo = ym => t => String(t.datum).slice(0, 4) === ym.slice(0, 4) && String(t.datum).slice(0, 7) <= ym;

function firm(filter) {
  const r = { oms: 0, kost: 0, momsUt: 0, momsIn: 0, uttag: 0, ins: 0, kat: {}, ink: {} };
  for (const t of S.tx) {
    if (t.ekonomi !== 'Företag' || !filter(t)) continue;
    const b = Number(t.belopp) || 0, m = Number(t.moms) || 0;
    if (t.typ === 'Inkomst') { r.oms += b - m; r.momsUt += m; r.ink[t.kategori] = (r.ink[t.kategori] || 0) + b - m; }
    else if (t.typ === 'Utgift') { r.kost += b - m; r.momsIn += m; r.kat[t.kategori] = (r.kat[t.kategori] || 0) + b - m; }
    else if (t.typ === 'Eget uttag') r.uttag += b;
    else if (t.typ === 'Egen insättning') r.ins += b;
  }
  r.res = r.oms - r.kost;
  r.moms = r.momsUt - r.momsIn;
  return r;
}

function priv(filter) {
  const r = { ink: 0, utg: 0, fast: 0, rorl: 0, spar: 0, kat: {} };
  for (const t of S.tx) {
    if (t.ekonomi !== 'Privatekonomi' || !filter(t)) continue;
    const b = Number(t.belopp) || 0;
    if (t.typ === 'Inkomst') r.ink += b;
    else if (t.typ === 'Utgift') { r.utg += b; FASTA.has(t.kategori) ? r.fast += b : r.rorl += b; r.kat[t.kategori] = (r.kat[t.kategori] || 0) + b; }
    else if (t.typ === 'Sparande') r.spar += b;
  }
  return r;
}

// Grov prognos: utan grundavdrag och statlig skatt → hamnar något högt, vilket är säkert håll.
function tax(res) {
  const underlag = Math.max(0, res) * (1 - set('schablonavdragProcent') / 100);
  const eg = underlag * set('egenavgiftProcent') / 100;
  const sk = underlag * set('kommunalskattProcent') / 100;
  return { eg, sk, tot: eg + sk };
}

const saldo = (filter) => S.konton.filter(filter).reduce((s, k) => s + (Number(k.saldo) || 0), 0);

/* =====================================================================
   RENDERING
   ===================================================================== */
const ICON = {
  oversikt: '<path d="M3 13h8V3H3zM13 21h8V11h-8zM3 21h8v-6H3zM13 3v6h8V3z"/>',
  privat: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/>',
  firma: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  konton: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>',
  installningar: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  kvitto: '<path d="M6 2h12v20l-3-2-3 2-3-2-3 2z"/><path d="M9 7h6M9 11h6M9 15h4"/>'
};
const icon = (n, cls = '') => `<svg class="ic ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[n]}</svg>`;
const NAV = [['oversikt', 'Översikt'], ['privat', 'Privatekonomi'], ['firma', 'Företag'], ['konton', 'Konton'], ['installningar', 'Inställningar']];

function renderShell() {
  $('#sidenav').innerHTML = NAV.map(([v, l]) => `<button class="nav" data-act="go" data-v="${v}">${icon(v)}<span>${l}</span></button>`).join('');
  const b = [NAV[0], NAV[1], null, NAV[2], NAV[3]];
  $('#bottomnav').innerHTML = b.map(x => x
    ? `<button class="nav" data-act="go" data-v="${x[0]}">${icon(x[0])}<span>${x[0] === 'privat' ? 'Privat' : x[1]}</span></button>`
    : `<button class="fab" data-act="new-tx" aria-label="Registrera">${icon('plus')}</button>`).join('');
}

function render() {
  if (!S.config) return renderPairing();
  document.body.classList.remove('pairing');
  document.querySelectorAll('.nav').forEach(n => n.classList.toggle('on', n.dataset.v === S.view));
  const views = { oversikt: vOversikt, privat: vPrivat, firma: vFirma, konton: vKonton, installningar: vInstallningar };
  $('#main').innerHTML = (S.authError ? `<div class="alert">${esc(S.authError)} <button class="btn small" data-act="repair">Koppla igen</button></div>` : '') + views[S.view]();
  renderSync();
}

function renderSync() {
  const pending = S.outbox.filter(o => o.status === 'pending').length + S.pendingFiles;
  const conflicts = S.outbox.filter(o => o.status === 'conflict').length;
  const errors = S.outbox.filter(o => o.status === 'error').length;
  let text, cls;
  if (S.syncing) { text = 'Synkroniserar…'; cls = 'wait'; }
  else if (conflicts) { text = conflicts + (conflicts > 1 ? ' konflikter' : ' konflikt') + ' – åtgärda'; cls = 'warn'; }
  else if (errors) { text = 'Synkfel – se Inställningar'; cls = 'warn'; }
  else if (!navigator.onLine) { text = 'Offline' + (pending ? ' · ' + pending + ' väntar' : ' · sparas på enheten'); cls = 'off'; }
  else if (pending) { text = pending + ' väntar på synk'; cls = 'wait'; }
  else { text = S.lastSync ? 'Synkad ' + timeLabel(S.lastSync) : 'Inte synkad än'; cls = 'ok'; }
  document.querySelectorAll('.syncpill').forEach(el => { el.className = 'syncpill ' + cls; el.innerHTML = `<i></i>${esc(text)}`; });
}

function go(v) { S.view = v; render(); window.scrollTo(0, 0); }

/* ---------- Byggstenar ---------- */
const monthBar = () => `<div class="monthbar"><button data-act="mo" data-v="-1" aria-label="Föregående månad">‹</button><span>${monthLabel(S.month)}</span><button data-act="mo" data-v="1" aria-label="Nästa månad">›</button></div>`;
const head = (eyebrow, title, extra = '') => `<div class="head"><div><div class="eyebrow">${eyebrow}</div><h1>${title}</h1></div>${extra}</div>`;
const stat = (label, value, sub = '', cls = '') => `<div class="card stat ${cls}"><div class="lbl">${label}</div><div class="num">${value}</div>${sub ? `<div class="sub">${sub}</div>` : ''}</div>`;
const prog = (pct) => `<div class="prog"><span style="width:${Math.max(0, Math.min(100, pct)).toFixed(1)}%"></span></div>`;
const signed = v => `<span class="${v < 0 ? 'neg' : ''}">${kr(v)}</span>`;

function goal(label, val, target, extra = '') {
  const pct = target > 0 ? val / target * 100 : 0;
  return `<div class="goal"><div class="gr"><span>${label}</span><b>${kr(val)} <small>av ${kr(target)}</small></b></div>${prog(pct)}<div class="gs">${Math.round(pct)} %${extra ? ' · ' + extra : ''}</div></div>`;
}

function chart(rows, names, colors) {
  const W = 560, H = 190, L = 46;
  const max = Math.max(1, ...rows.flatMap(r => [r.a, r.b]));
  const bw = (W - L) / rows.length;
  let s = `<svg viewBox="0 0 ${W} ${H + 26}" class="chart" role="img" aria-label="${esc(names.join(' och '))}">`;
  [0, 0.5, 1].forEach(f => {
    const y = H - f * (H - 12);
    s += `<line x1="${L}" x2="${W}" y1="${y}" y2="${y}" class="grid"/><text x="${L - 8}" y="${y + 4}" class="ax" text-anchor="end">${shortKr(max * f)}</text>`;
  });
  rows.forEach((r, i) => {
    const w = Math.min(22, bw * 0.28), x0 = L + i * bw + bw / 2 - w - 2;
    [r.a, r.b].forEach((v, j) => {
      const h = Math.max(0, v) / max * (H - 12);
      s += `<rect x="${x0 + j * (w + 4)}" y="${H - h}" width="${w}" height="${h}" rx="3" fill="${colors[j]}"><title>${esc(names[j])} ${esc(r.label)}: ${kr(v)}</title></rect>`;
    });
    s += `<text x="${L + i * bw + bw / 2}" y="${H + 18}" class="ax" text-anchor="middle">${esc(r.label)}</text>`;
  });
  s += '</svg>';
  return s + `<div class="legend">${names.map((n, i) => `<span><i style="background:${colors[i]}"></i>${esc(n)}</span>`).join('')}</div>`;
}

function katList(obj) {
  const e = Object.entries(obj).sort((a, b) => b[1] - a[1]);
  if (!e.length) return '<p class="empty">Inget registrerat ännu.</p>';
  const tot = e.reduce((s, x) => s + x[1], 0) || 1;
  return e.map(([k, v]) => `<div class="kat"><div class="kr"><span>${esc(k)}</span><b>${kr(v)}</b></div><div class="prog thin"><span style="width:${(v / tot * 100).toFixed(1)}%"></span></div></div>`).join('');
}

function txList(list) {
  if (!list.length) return '<p class="empty">Inga registreringar den här månaden. Tryck på + för att lägga till.</p>';
  const out = { 'Utgift': 1, 'Sparande': 1, 'Eget uttag': 1 };
  return '<div class="txl">' + list.slice().sort((a, b) => String(b.datum).localeCompare(a.datum) || String(b.skapad || '').localeCompare(a.skapad || '')).map(t => {
    const neg = out[t.typ];
    const d = String(t.datum);
    return `<button class="tx" data-act="edit-tx" data-v="${esc(t.id)}">
      <span class="d"><b>${+d.slice(8, 10)}</b><small>${monthShort(d.slice(0, 7))}</small></span>
      <span class="m"><b>${esc(t.beskrivning || t.kategori)}</b><small>${esc(t.typ)}${t.beskrivning ? ' · ' + esc(t.kategori) : ''}${t.motpart ? ' · ' + esc(t.motpart) : ''}</small></span>
      <span class="r">${t.kvittoId ? icon('kvitto', 'tiny') : ''}${t._pending ? '<i class="dot" title="Väntar på synk"></i>' : ''}<b class="${neg ? 'neg' : 'pos'}">${neg ? '−' : '+'}${kr(t.belopp)}</b></span>
    </button>`;
  }).join('') + '</div>';
}

/* ---------- Vy: Översikt ---------- */
function vOversikt() {
  const ym = S.month;
  const f = firm(inMonth(ym)), p = priv(inMonth(ym)), fy = firm(inYearTo(ym));
  const skatt = tax(fy.res);
  const mojligt = fy.res - skatt.tot - fy.uttag + fy.ins;
  const disp = p.ink + f.uttag;
  const pengarP = saldo(k => k.ekonomi === 'Privatekonomi'), pengarF = saldo(k => k.ekonomi === 'Företag');
  const buffert = saldo(k => k.typ === 'Buffert');
  const pris = set('snittprisPerPass'), malOms = set('malOmsattning');
  const saknas = Math.max(0, malOms - f.oms);
  const passInfo = saknas > 0 && pris > 0 ? `${Math.ceil(saknas / pris)} försäljningar kvar à ${kr(pris)}` : (f.oms >= malOms ? 'målet nått' : '');

  const last6 = [...Array(6)].map((_, i) => shiftMonth(ym, i - 5));
  const fRows = last6.map(m => { const x = firm(inMonth(m)); return { label: monthShort(m), a: x.oms, b: x.kost }; });
  const pRows = last6.map(m => { const x = priv(inMonth(m)), y = firm(inMonth(m)); return { label: monthShort(m), a: x.ink + y.uttag, b: x.utg }; });

  return head('Ekonomisk överblick', 'Översikt', monthBar()) + `
  <section class="hero card">
    <div><div class="lbl">Dina pengar just nu</div><div class="num xl">${kr(pengarP + pengarF)}</div>
    <div class="sub">Privatekonomi ${kr(pengarP)} · Företag ${kr(pengarF)}${S.konton.length ? '' : ' · lägg in dina konton under Konton'}</div></div>
    <div class="hero-side"><div class="lbl">Möjligt att ta ut i år</div><div class="num">${kr(Math.max(0, mojligt))}</div><div class="sub">efter skattereserv och redan gjorda uttag</div></div>
  </section>
  <div class="grid4">
    ${stat('Omsättning', kr(f.oms), 'Företag, exkl. moms')}
    ${stat('Resultat', signed(f.res), 'omsättning − kostnader')}
    ${stat('Disponibelt privat', kr(disp), `inkomster ${kr(p.ink)} + eget uttag ${kr(f.uttag)}`)}
    ${stat('Reservera för skatt', kr(skatt.tot), 'hittills i år (prognos)', 'gold')}
  </div>
  <div class="grid2">
    <section class="card"><h3>Mål</h3>
      ${goal('Disponibelt denna månad', disp, set('malDisponibelt'))}
      ${goal('Omsättning denna månad', f.oms, malOms, passInfo)}
      ${goal('Buffert', buffert, set('malBuffert'), S.konton.some(k => k.typ === 'Buffert') ? '' : 'skapa ett konto av typen Buffert')}
    </section>
    <section class="card"><h3>Företag ${ym.slice(0, 4)}</h3>
      <div class="rows">
        <div><span>Resultat hittills i år</span><b>${signed(fy.res)}</b></div>
        <div><span>Egenavgifter (prognos)</span><b>${kr(skatt.eg)}</b></div>
        <div><span>Inkomstskatt (prognos)</span><b>${kr(skatt.sk)}</b></div>
        <div><span>Egna uttag hittills</span><b>${kr(fy.uttag)}</b></div>
        <div class="tot"><span>Kvar att ta ut</span><b>${signed(mojligt)}</b></div>
      </div>
      <p class="hint">Prognosen är förenklad och räknar utan grundavdrag och statlig skatt. Den är ett planeringsstöd, inte ett beslut från Skatteverket.</p>
    </section>
  </div>
  <div class="grid2">
    <section class="card"><h3>Företag – 6 månader</h3>${chart(fRows, ['Omsättning', 'Kostnader'], ['var(--g7)', 'var(--gold)'])}</section>
    <section class="card"><h3>Privatekonomi – 6 månader</h3>${chart(pRows, ['Disponibelt', 'Utgifter'], ['var(--g7)', 'var(--gold)'])}</section>
  </div>`;
}

/* ---------- Vy: Privatekonomi ---------- */
function vPrivat() {
  const ym = S.month, p = priv(inMonth(ym)), f = firm(inMonth(ym));
  const disp = p.ink + f.uttag, kvar = disp - p.utg - p.spar;
  return head('Personlig ekonomi', 'Privatekonomi', monthBar()) + `
  <div class="grid4">
    ${stat('Disponibelt', kr(disp), `inkomster ${kr(p.ink)} + eget uttag ${kr(f.uttag)}`)}
    ${stat('Utgifter', kr(p.utg), `fasta ${kr(p.fast)} · rörliga ${kr(p.rorl)}`)}
    ${stat('Sparande', kr(p.spar), 'buffert, sparande, investeringar')}
    ${stat('Kvar', signed(kvar), 'efter utgifter och sparande', 'gold')}
  </div>
  <div class="grid2">
    <section class="card"><h3>Utgifter per kategori</h3>${katList(p.kat)}</section>
    <section class="card"><h3>Mot målet</h3>${goal('Disponibelt', disp, set('malDisponibelt'))}${goal('Buffert', saldo(k => k.typ === 'Buffert'), set('malBuffert'))}</section>
  </div>
  <section class="card"><div class="ch"><h3>Registreringar</h3><button class="btn small primary" data-act="new-tx" data-v="Privatekonomi">${icon('plus')} Ny</button></div>
  ${txList(S.tx.filter(t => t.ekonomi === 'Privatekonomi' && inMonth(ym)(t)))}</section>`;
}

/* ---------- Vy: Företag ---------- */
function vFirma() {
  const ym = S.month, f = firm(inMonth(ym)), fy = firm(inYearTo(ym)), skatt = tax(fy.res);
  return head('Enskild firma', 'Företag', monthBar()) + `
  <div class="grid4">
    ${stat('Omsättning', kr(f.oms), 'exkl. moms')}
    ${stat('Kostnader', kr(f.kost), 'exkl. moms')}
    ${stat('Resultat', signed(f.res), 'före skatt och egenavgifter')}
    ${stat('Moms att redovisa', signed(f.moms), `utgående ${kr(f.momsUt)} − ingående ${kr(f.momsIn)}`, 'gold')}
  </div>
  <div class="grid2">
    <section class="card"><h3>Intäkter per tjänst</h3>${katList(f.ink)}</section>
    <section class="card"><h3>Kostnader per kategori</h3>${katList(f.kat)}</section>
  </div>
  <section class="card"><h3>Hittills i år</h3>
    <div class="rows cols">
      <div><span>Omsättning</span><b>${kr(fy.oms)}</b></div>
      <div><span>Resultat</span><b>${signed(fy.res)}</b></div>
      <div><span>Skatt + egenavgifter (prognos)</span><b>${kr(skatt.tot)}</b></div>
      <div><span>Egna uttag</span><b>${kr(fy.uttag)}</b></div>
    </div>
    <p class="hint">Egna uttag är inte en kostnad och påverkar inte resultatet. Appen är ett administrativt stöd och ersätter inte ett bokföringsprogram.</p>
  </section>
  <section class="card"><div class="ch"><h3>Affärshändelser</h3><button class="btn small primary" data-act="new-tx" data-v="Företag">${icon('plus')} Ny</button></div>
  ${txList(S.tx.filter(t => t.ekonomi === 'Företag' && inMonth(ym)(t)))}</section>`;
}

/* ---------- Vy: Konton ---------- */
function vKonton() {
  const group = e => {
    const list = S.konton.filter(k => k.ekonomi === e);
    return `<section class="card"><div class="ch"><h3>${e}</h3><b class="num sm">${kr(saldo(k => k.ekonomi === e))}</b></div>
    ${list.length ? '<div class="txl">' + list.map(k => `<button class="tx" data-act="edit-konto" data-v="${esc(k.id)}">
      <span class="m"><b>${esc(k.namn)}</b><small>${esc(k.typ)}${k.saldodatum ? ' · saldo per ' + esc(k.saldodatum) : ''}</small></span>
      <span class="r">${k._pending ? '<i class="dot"></i>' : ''}<b class="${k.saldo < 0 ? 'neg' : ''}">${kr(k.saldo)}</b></span></button>`).join('') + '</div>' : '<p class="empty">Inga konton ännu.</p>'}
    </section>`;
  };
  return head('Bankkonton och saldon', 'Konton', `<button class="btn primary" data-act="new-konto">${icon('plus')} Nytt konto</button>`)
    + `<p class="hint lead">Uppdatera saldona när du vill ha en aktuell bild – till exempel en gång i veckan. Appen kopplas inte till banken.</p>`
    + `<div class="grid2">${group('Privatekonomi')}${group('Företag')}</div>`;
}

/* ---------- Vy: Inställningar ---------- */
function vInstallningar() {
  const problems = S.outbox.filter(o => o.status === 'conflict' || o.status === 'error');
  const pending = S.outbox.filter(o => o.status === 'pending').length + S.pendingFiles;
  const describe = o => {
    const r = o.record || {}, local = S.tx.concat(S.konton).find(x => x.id === r.id) || r;
    if (o.type === 'settings') return 'Inställningar';
    return esc([local.ekonomi, local.datum, local.namn || local.beskrivning || local.kategori, local.belopp != null ? kr(local.belopp) : (local.saldo != null ? kr(local.saldo) : '')].filter(Boolean).join(' · ') || 'Borttagen post');
  };
  return head('System', 'Inställningar') + `
  <div class="grid2">
    <section class="card"><h3>Synkronisering</h3>
      <div class="rows">
        <div><span>Status</span><b><span class="syncpill"></span></b></div>
        <div><span>Senast synkad</span><b>${S.lastSync ? timeLabel(S.lastSync) : '–'}</b></div>
        <div><span>Väntar på synk</span><b>${pending}</b></div>
        <div><span>Den här enheten</span><b>${esc(S.config.deviceName)}</b></div>
      </div>
      ${problems.map(o => `<div class="conflict"><div><b>${o.status === 'conflict' ? 'Konflikt' : 'Kunde inte sparas'}</b><small>${describe(o)}<br>${esc(o.error || '')}</small></div>
        <div class="btns">${o.status === 'conflict'
          ? `<button class="btn small primary" data-act="keep-mine" data-v="${o.opId}">Behåll min</button><button class="btn small ghost" data-act="use-server" data-v="${o.opId}">Använd den andra</button>`
          : `<button class="btn small primary" data-act="retry" data-v="${o.opId}">Försök igen</button><button class="btn small ghost" data-act="discard" data-v="${o.opId}">Släng ändringen</button>`}</div></div>`).join('')}
      <div class="btnrow"><button class="btn primary" data-act="sync">Synka nu</button></div>
    </section>
    <section class="card"><h3>Enheter</h3>
      <p class="hint">Varje enhet kopplas en gång med en engångskod. Tappar du bort en mobil kopplar du bort den här.</p>
      <div id="devices">${devicesHtml()}</div>
      <div class="btnrow"><button class="btn primary" data-act="pair-code">Koppla ny enhet</button><button class="btn ghost" data-act="devices">Visa enheter</button></div>
    </section>
  </div>
  <section class="card"><h3>Mål och skatteantaganden</h3>
    <div class="setgrid">${SETTINGS_META.map(m => `<label class="fld"><span>${esc(m.l)}</span><div class="suffix"><input id="set-${m.k}" inputmode="decimal" value="${esc(S.settings[m.k] ?? m.d)}"><em>${m.s}</em></div></label>`).join('')}</div>
    <div class="btnrow"><button class="btn primary" data-act="save-settings">Spara inställningar</button></div>
  </section>
  <div class="grid2">
    <section class="card"><h3>Säkerhetskopior och export</h3>
      <p class="hint">Kalkylarket kopieras automatiskt varje natt till mappen Ekonomichefen/Backup (de senaste 30 sparas). Du kan även exportera allt härifrån – det fungerar offline.</p>
      <div class="btnrow wrap"><button class="btn ghost" data-act="backup">Gör säkerhetskopia nu</button><button class="btn ghost" data-act="export-csv">Exportera Excel (CSV)</button><button class="btn ghost" data-act="export-json">Exportera allt (JSON)</button></div>
      ${S.lankar ? `<div class="btnrow wrap"><a class="btn ghost" href="${esc(S.lankar.data)}" target="_blank" rel="noopener">Öppna kalkylarket</a><a class="btn ghost" href="${esc(S.lankar.mapp)}" target="_blank" rel="noopener">Öppna Drive-mappen</a></div>` : ''}
    </section>
    <section class="card"><h3>Om appen</h3>
      <div class="rows"><div><span>Version</span><b>${APP_VERSION}</b></div><div><span>Data lagras i</span><b>Ditt Google-konto</b></div></div>
      <p class="hint">Ekonomichefen är ett administrativt stöd. Den ersätter inte ett bokföringsprogram och garanterar inte att bokföringsreglerna uppfylls.</p>
      <div class="btnrow"><button class="btn ghost danger" data-act="unpair">Koppla bort den här enheten</button></div>
    </section>
  </div>`;
}

function devicesHtml() {
  if (!S.devices) return '';
  return '<div class="txl">' + S.devices.map(d => `<div class="tx static"><span class="m"><b>${esc(d.name)}${d.current ? ' <small class="tag">den här</small>' : ''}</b><small>Senast aktiv ${esc(timeLabel(d.lastSeen))}</small></span>
    <span class="r">${d.current ? '' : `<button class="btn small ghost danger" data-act="revoke" data-v="${esc(d.id)}">Koppla bort</button>`}</span></div>`).join('') + '</div>';
}

/* ---------- Koppla enhet (första gången) ---------- */
function renderPairing() {
  document.body.classList.add('pairing');
  $('#main').innerHTML = `<div class="pair card">
    <div class="brandmark">E</div>
    <h1>Välkommen till Ekonomichefen</h1>
    <p class="hint lead">Koppla den här enheten till ditt Google-konto. Det gör du en gång per enhet.${/iPhone|iPad/.test(DEVICE) && !navigator.standalone ? '<br><b>Tips:</b> Lägg först till appen på hemskärmen (Dela → Lägg till på hemskärmen) och koppla den därifrån.' : ''}</p>
    <label class="fld"><span>Webbappens adress (från Apps Script)</span><input id="p-url" placeholder="https://script.google.com/macros/s/…/exec" autocomplete="off" autocapitalize="off" spellcheck="false"></label>
    <label class="fld"><span>Kopplingskod</span><input id="p-code" placeholder="ABCD-EFGH" autocomplete="one-time-code" autocapitalize="characters" spellcheck="false"></label>
    <label class="fld"><span>Namn på enheten</span><input id="p-name" value="${esc(DEVICE)}"></label>
    <button class="btn primary block" data-act="pair" id="p-btn">Koppla enheten</button>
    <p class="hint">Saknar du kod? Kör <b>kopplaEnhet</b> i Apps Script, eller välj <b>Koppla ny enhet</b> under Inställningar på en enhet som redan är kopplad.</p>
  </div>`;
  if (S.prevUrl) $('#p-url').value = S.prevUrl;
}

async function doPair() {
  const apiUrl = $('#p-url').value.trim(), code = $('#p-code').value.trim(), deviceName = $('#p-name').value.trim() || DEVICE;
  if (!/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(apiUrl) && !/^http:\/\/localhost[:/]/.test(apiUrl)) return toast('Adressen ska börja med https://script.google.com/macros/s/ och sluta med /exec', 'err');
  if (code.replace(/[^A-Za-z0-9]/g, '').length !== 8) return toast('Kopplingskoden har 8 tecken.', 'err');
  if (!navigator.onLine) return toast('Du behöver internet för att koppla enheten.', 'err');
  const btn = $('#p-btn'); btn.disabled = true; btn.textContent = 'Kopplar…';
  try {
    const r = await call('pair', { code, deviceName }, { config: { apiUrl } });
    S.config = { apiUrl, deviceKey: r.deviceKey, deviceId: r.deviceId, deviceName: r.deviceName };
    await DB.put('meta', S.config, 'config');
    await DB.put('meta', '', 'since');
    S.authError = '';
    await loadLocal();
    render();
    toast('Enheten är kopplad ✓');
    sync(true);
  } catch (e) {
    toast(e.offline ? 'Fick ingen kontakt. Kontrollera adressen och att webbappen har åtkomst "Alla".' : e.message, 'err');
    btn.disabled = false; btn.textContent = 'Koppla enheten';
  }
}

/* =====================================================================
   FORMULÄR: Registrera transaktion
   ===================================================================== */
function applyKat(f) {
  const k = (KAT[f.ekonomi][f.typ] || []).find(x => x.n === f.kategori);
  if (k && f.ekonomi === 'Företag') { f.baskonto = k.bas || ''; f.momssats = k.moms ?? 25; }
}

function openTx(id, ekonomi) {
  const t = id ? S.tx.find(x => x.id === id) : null;
  if (t) S.form = Object.assign({}, t, { _orig: t.kvittoId || '' });
  else {
    const eko = ekonomi || (S.view === 'privat' ? 'Privatekonomi' : 'Företag');
    S.form = { id: uuid(), version: 0, _new: true, ekonomi: eko, typ: 'Utgift', datum: today(), belopp: '', kategori: '', momssats: 25, baskonto: '', konto: '', beskrivning: '', motpart: '', kvittoId: '', kvittoNamn: '' };
  }
  renderTxForm();
}

function collectTx() {
  const f = S.form; if (!f || !$('#f-belopp')) return;
  const v = id => { const el = $(id); return el ? el.value : undefined; };
  f.belopp = v('#f-belopp'); f.datum = v('#f-datum'); f.kategori = v('#f-kat'); f.beskrivning = v('#f-besk'); f.motpart = v('#f-motpart'); f.konto = v('#f-konto');
  if ($('#f-moms')) { f.momssats = Number(v('#f-moms')); f.baskonto = v('#f-bas'); }
}

function renderTxForm() {
  const f = S.form;
  const typer = Object.keys(KAT[f.ekonomi]);
  if (!typer.includes(f.typ)) f.typ = typer[0];
  const kats = KAT[f.ekonomi][f.typ];
  if (!kats.some(k => k.n === f.kategori)) { f.kategori = kats[0].n; applyKat(f); }
  const firma = f.ekonomi === 'Företag';
  const konton = S.konton.filter(k => k.ekonomi === f.ekonomi);
  modal(`<div class="mhead"><h2>${f._new ? 'Registrera' : 'Ändra'}</h2><button class="x" data-act="close" aria-label="Stäng">×</button></div>
  <div class="seg">${['Privatekonomi', 'Företag'].map(e => `<button type="button" class="${f.ekonomi === e ? 'on' : ''}" data-act="seg-eko" data-v="${e}">${e}</button>`).join('')}</div>
  <div class="chips">${typer.map(t => `<button type="button" class="chip ${f.typ === t ? 'on' : ''}" data-act="seg-typ" data-v="${esc(t)}">${esc(t)}</button>`).join('')}</div>
  <label class="fld big"><span>Belopp${firma ? ' inkl. moms' : ''}</span><div class="suffix"><input id="f-belopp" inputmode="decimal" placeholder="0" value="${esc(f.belopp)}" autocomplete="off"><em>kr</em></div></label>
  <div class="row2">
    <label class="fld"><span>Datum</span><input id="f-datum" type="date" value="${esc(f.datum)}"></label>
    <label class="fld"><span>Kategori</span><select id="f-kat">${kats.map(k => `<option ${k.n === f.kategori ? 'selected' : ''}>${esc(k.n)}</option>`).join('')}</select></label>
  </div>
  ${firma ? `<div class="row2">
    <label class="fld"><span>Moms</span><select id="f-moms">${[25, 12, 6, 0].map(m => `<option value="${m}" ${Number(f.momssats) === m ? 'selected' : ''}>${m} %</option>`).join('')}</select></label>
    <label class="fld"><span>BAS-konto (förslag)</span><input id="f-bas" value="${esc(f.baskonto)}" inputmode="numeric" maxlength="6"></label>
  </div><p class="hint" id="f-momsinfo"></p>` : ''}
  <label class="fld"><span>Beskrivning</span><input id="f-besk" value="${esc(f.beskrivning)}" placeholder="${firma ? 'T.ex. Faktura 1023' : 'T.ex. Veckohandling'}"></label>
  <div class="row2">
    <label class="fld"><span>${firma && f.typ === 'Inkomst' ? 'Kund' : 'Motpart'}</span><input id="f-motpart" value="${esc(f.motpart)}"></label>
    <label class="fld"><span>Konto</span><select id="f-konto"><option value="">–</option>${konton.map(k => `<option ${k.namn === f.konto ? 'selected' : ''}>${esc(k.namn)}</option>`).join('')}</select></label>
  </div>
  <div id="f-kvitto">${kvittoHtml()}</div>
  <div class="mfoot">${f._new ? '<span></span>' : '<button class="btn ghost danger" data-act="del-tx">Ta bort</button>'}<button class="btn primary" data-act="save-tx" id="f-save">Spara</button></div>`);
  updateMomsInfo();
  if (f._new) setTimeout(() => $('#f-belopp') && $('#f-belopp').focus({ preventScroll: true }), 60);
}

function kvittoHtml() {
  const f = S.form;
  const picker = `<label class="btn ghost filebtn">${icon('kvitto')} ${f._file || f.kvittoId ? 'Byt kvitto' : 'Fotografera eller välj kvitto'}<input type="file" id="f-fil" accept="image/*,application/pdf" hidden></label>`;
  if (f._file) return `<div class="kv">${f._file.mime.startsWith('image/') ? `<img src="${f._file.data}" alt="Kvitto">` : '<span class="pdf">PDF</span>'}<div><b>${esc(f._file.namn)}</b><small>Sparas på enheten och laddas upp vid synk</small></div><button class="x" data-act="kv-remove" aria-label="Ta bort kvitto">×</button></div>${picker}`;
  if (f.kvittoId) return `<div class="kv"><span class="pdf">${icon('kvitto')}</span><div><b>${esc(f.kvittoNamn || 'Kvitto')}</b><small>${f.kvittoId.startsWith('local:') ? 'Väntar på uppladdning' : 'Sparat i Google Drive'}</small></div><button class="btn small ghost" data-act="kv-view">Visa</button><button class="x" data-act="kv-remove" aria-label="Ta bort kvitto">×</button></div>${picker}`;
  return picker;
}

function updateMomsInfo() {
  const el = $('#f-momsinfo'); if (!el) return;
  const b = parseAmt($('#f-belopp').value), m = Number($('#f-moms').value);
  el.textContent = b > 0 ? `Varav moms ${kr(b * m / (100 + m))} · exkl. moms ${kr(b - b * m / (100 + m))}` : '';
}

async function onFile(input) {
  const file = input.files && input.files[0]; if (!file) return;
  try {
    collectTx();
    let data, mime = file.type || '', namn = file.name || 'kvitto';
    if (mime === 'application/pdf') {
      if (file.size > 12e6) throw new Error('PDF:en är för stor (max 12 MB).');
      data = await readDataUrl(file);
    } else if (mime.startsWith('image/') || /\.(heic|heif)$/i.test(namn)) {
      try { data = await compressImage(file); mime = 'image/jpeg'; namn = namn.replace(/\.[^.]+$/, '') + '.jpg'; }
      catch (e) { if (file.size > 12e6) throw new Error('Bilden är för stor.'); data = await readDataUrl(file); mime = mime || 'image/heic'; }
    } else throw new Error('Välj en bild eller en PDF.');
    S.form._file = { data, mime, namn };
    $('#f-kvitto').innerHTML = kvittoHtml();
  } catch (e) { toast(e.message, 'err'); }
}

function readDataUrl(file) {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(new Error('Kunde inte läsa filen.')); r.readAsDataURL(file); });
}
function compressImage(file) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => {
      const max = 1800, s = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas'); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
      const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url); res(c.toDataURL('image/jpeg', 0.75));
    };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('Kunde inte läsa bilden.')); };
    img.src = url;
  });
}

async function saveTx() {
  collectTx();
  const f = S.form, belopp = parseAmt(f.belopp);
  if (!(belopp > 0)) return toast('Ange ett belopp större än 0.', 'err');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f.datum || '')) return toast('Ange ett datum.', 'err');
  const firma = f.ekonomi === 'Företag', ms = firma ? Number(f.momssats) || 0 : 0;
  const rec = {
    id: f.id, version: f.version || 0, ekonomi: f.ekonomi, typ: f.typ, datum: f.datum, belopp, momssats: ms,
    moms: firma ? round2(belopp * ms / (100 + ms)) : 0, kategori: f.kategori, baskonto: firma ? (f.baskonto || '') : '',
    konto: f.konto || '', beskrivning: (f.beskrivning || '').trim(), motpart: (f.motpart || '').trim(),
    kvittoId: f.kvittoId || '', kvittoNamn: f.kvittoNamn || '', skapad: f.skapad || ''
  };
  $('#f-save').disabled = true;
  try {
    if (f._file) {
      const fid = uuid();
      await DB.put('files', { id: fid, data: f._file.data, mime: f._file.mime, namn: f._file.namn, ekonomi: rec.ekonomi, datum: rec.datum, kategori: rec.kategori });
      rec.kvittoId = 'local:' + fid; rec.kvittoNamn = f._file.namn;
    }
    if (f._orig && f._orig.startsWith('local:') && f._orig !== rec.kvittoId) await DB.del('files', f._orig.slice(6));
    closeModal();
    await queueSave('Transaktioner', rec);
    toast(navigator.onLine ? 'Sparat ✓' : 'Sparat på enheten – synkas när du är online');
  } catch (e) { toast('Kunde inte spara: ' + e.message, 'err'); const b = $('#f-save'); if (b) b.disabled = false; }
}

async function viewKvitto() {
  const id = S.form.kvittoId;
  if (id.startsWith('local:')) {
    const f = await DB.get('files', id.slice(6));
    if (!f) return toast('Kvittot hittades inte på enheten.', 'err');
    if (f.mime.startsWith('image/')) { const w = window.open(); if (w) w.document.write(`<title>Kvitto</title><img src="${f.data}" style="max-width:100%">`); }
    else toast('PDF:en visas när den har laddats upp till Drive.');
  } else window.open('https://drive.google.com/file/d/' + encodeURIComponent(id) + '/view', '_blank', 'noopener');
}

/* =====================================================================
   FORMULÄR: Konto
   ===================================================================== */
function openKonto(id) {
  const k = id ? S.konton.find(x => x.id === id) : null;
  S.form = k ? Object.assign({}, k) : { id: uuid(), version: 0, _new: true, ekonomi: 'Privatekonomi', namn: '', typ: 'Lönekonto', saldo: '', saldodatum: today() };
  renderKontoForm();
}
function renderKontoForm() {
  const f = S.form;
  if (!KONTO_TYPER[f.ekonomi].includes(f.typ)) f.typ = KONTO_TYPER[f.ekonomi][0];
  modal(`<div class="mhead"><h2>${f._new ? 'Nytt konto' : 'Ändra konto'}</h2><button class="x" data-act="close" aria-label="Stäng">×</button></div>
  <div class="seg">${['Privatekonomi', 'Företag'].map(e => `<button type="button" class="${f.ekonomi === e ? 'on' : ''}" data-act="seg-keko" data-v="${e}">${e}</button>`).join('')}</div>
  <label class="fld"><span>Namn</span><input id="k-namn" value="${esc(f.namn)}" placeholder="T.ex. Lönekonto Swedbank"></label>
  <div class="row2">
    <label class="fld"><span>Typ</span><select id="k-typ">${KONTO_TYPER[f.ekonomi].map(t => `<option ${t === f.typ ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
    <label class="fld"><span>Saldo per datum</span><input id="k-datum" type="date" value="${esc(f.saldodatum)}"></label>
  </div>
  <label class="fld big"><span>Saldo</span><div class="suffix"><input id="k-saldo" inputmode="decimal" value="${esc(f.saldo)}" placeholder="0"><em>kr</em></div></label>
  <p class="hint">Spara aldrig kontonummer eller kortnummer här – ett namn räcker.</p>
  <div class="mfoot">${f._new ? '<span></span>' : '<button class="btn ghost danger" data-act="del-konto">Ta bort</button>'}<button class="btn primary" data-act="save-konto">Spara</button></div>`);
}
function collectKonto() {
  const f = S.form; if (!$('#k-namn')) return;
  f.namn = $('#k-namn').value; f.typ = $('#k-typ').value; f.saldodatum = $('#k-datum').value; f.saldo = $('#k-saldo').value;
}
async function saveKonto() {
  collectKonto();
  const f = S.form, saldoV = parseAmt(f.saldo === '' ? 0 : f.saldo);
  if (!f.namn.trim()) return toast('Ge kontot ett namn.', 'err');
  if (isNaN(saldoV)) return toast('Ange saldot som ett tal.', 'err');
  if (/\d{8,}/.test(f.namn.replace(/[\s-]/g, ''))) return toast('Skriv inte kontonummer i namnet.', 'err');
  closeModal();
  await queueSave('Konton', { id: f.id, version: f.version || 0, ekonomi: f.ekonomi, namn: f.namn.trim(), typ: f.typ, saldo: saldoV, saldodatum: f.saldodatum || '', skapad: f.skapad || '' });
  toast('Sparat ✓');
}

/* =====================================================================
   KONFLIKTER, ENHETER, EXPORT
   ===================================================================== */
async function keepMine(opId) {
  const op = await DB.get('outbox', opId); if (!op) return;
  await DB.del('outbox', opId);
  op.opId = uuid(); op.baseVersion = op.server ? Number(op.server.version) : 0; op.status = 'pending'; op.server = null; op.error = '';
  await DB.put('outbox', op);
  await afterLocalChange();
}
async function useServer(opId) {
  const op = await DB.get('outbox', opId); if (!op) return;
  await DB.del('outbox', opId);
  if (op.record && String(op.record.kvittoId || '').startsWith('local:')) await DB.del('files', op.record.kvittoId.slice(6));
  if (op.server && op.server.status !== 'Raderad') await DB.put('records', Object.assign({}, op.server, { _sheet: op.sheet }));
  else if (op.record) await DB.del('records', op.record.id);
  await loadLocal(); render();
}
async function retryOp(opId) {
  const op = await DB.get('outbox', opId); if (!op) return;
  op.status = 'pending'; op.error = ''; await DB.put('outbox', op); await afterLocalChange();
}
async function discardOp(opId) {
  if (!confirm('Släng den här ändringen? Den finns då bara kvar i den version som ligger i Google.')) return;
  await useServer(opId);
  await DB.put('meta', '', 'since'); // hämta allt på nytt för att få serverns version
  sync(true);
}

async function loadDevices() {
  try { S.devices = (await call('devices')).devices; if ($('#devices')) $('#devices').innerHTML = devicesHtml(); }
  catch (e) { toast(e.offline ? 'Du behöver internet för att se enheterna.' : e.message, 'err'); }
}
async function newPairCode() {
  try {
    const { code } = await call('pairCode');
    modal(`<div class="mhead"><h2>Koppla ny enhet</h2><button class="x" data-act="close" aria-label="Stäng">×</button></div>
      <p class="hint lead">Öppna Ekonomichefen på den nya enheten och ange:</p>
      <div class="code">${esc(code)}</div>
      <label class="fld"><span>Webbappens adress</span><input readonly value="${esc(S.config.apiUrl)}" onclick="this.select()"></label>
      <p class="hint">Koden gäller i 10 minuter och kan bara användas en gång.</p>`);
  } catch (e) { toast(e.offline ? 'Du behöver internet för att skapa en kod.' : e.message, 'err'); }
}
async function revokeDevice(id) {
  if (!confirm('Koppla bort enheten? Den kommer inte längre åt din ekonomi.')) return;
  try { await call('revoke', { deviceId: id }); toast('Enheten är bortkopplad.'); loadDevices(); }
  catch (e) { toast(e.message, 'err'); }
}
async function backupNow() {
  try { const r = await call('backup'); toast('Säkerhetskopia skapad: ' + r.namn); }
  catch (e) { toast(e.offline ? 'Du behöver internet för att göra en säkerhetskopia.' : e.message, 'err'); }
}
function download(name, text, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
function exportJson() {
  download('ekonomichefen-' + today() + '.json', JSON.stringify({ exporterad: new Date().toISOString(), version: APP_VERSION, transaktioner: S.tx.map(strip), konton: S.konton.map(strip), installningar: S.settings }, null, 2), 'application/json');
}
function exportCsv() {
  const cols = ['datum', 'ekonomi', 'typ', 'kategori', 'beskrivning', 'motpart', 'belopp', 'momssats', 'moms', 'baskonto', 'konto', 'kvittoNamn'];
  const cell = v => { const s = String(v == null ? '' : v); return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const num = v => String(v == null ? '' : v).replace('.', ',');
  const rows = S.tx.slice().sort((a, b) => String(a.datum).localeCompare(b.datum)).map(t => cols.map(c => ['belopp', 'moms'].includes(c) ? num(t[c]) : cell(t[c])).join(';'));
  download('ekonomichefen-transaktioner-' + today() + '.csv', '\ufeff' + cols.join(';') + '\n' + rows.join('\n'), 'text/csv;charset=utf-8');
}
async function unpair() {
  const pending = S.outbox.length + S.pendingFiles;
  if (!confirm(pending ? `Det finns ${pending} osynkade ändringar som går förlorade. Koppla bort ändå?` : 'Koppla bort den här enheten och radera dess lokala data? Datan i Google påverkas inte.')) return;
  await DB.wipe();
  location.reload();
}
async function repair() {
  S.prevUrl = S.config && S.config.apiUrl;
  await DB.put('meta', null, 'config');
  S.config = null;
  render();
}

/* =====================================================================
   MODAL OCH TOAST
   ===================================================================== */
function modal(html) { $('#sheet').innerHTML = html; $('#modal').hidden = false; document.body.classList.add('noscroll'); }
function closeModal() { $('#modal').hidden = true; $('#sheet').innerHTML = ''; S.form = null; document.body.classList.remove('noscroll'); }
let toastTimer;
function toast(msg, kind) {
  const t = $('#toast'); t.textContent = msg; t.className = 'toast show ' + (kind || '');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.className = 'toast'; }, kind === 'err' ? 5500 : 2800);
}

/* =====================================================================
   HÄNDELSER
   ===================================================================== */
const ACTIONS = {
  go: v => go(v),
  mo: v => { S.month = shiftMonth(S.month, Number(v)); render(); },
  'new-tx': v => openTx(null, v),
  'edit-tx': v => openTx(v),
  'new-konto': () => openKonto(),
  'edit-konto': v => openKonto(v),
  close: () => closeModal(),
  'seg-eko': v => { collectTx(); S.form.ekonomi = v; S.form.kategori = ''; renderTxForm(); },
  'seg-typ': v => { collectTx(); S.form.typ = v; S.form.kategori = ''; renderTxForm(); },
  'seg-keko': v => { collectKonto(); S.form.ekonomi = v; renderKontoForm(); },
  'save-tx': () => saveTx(),
  'del-tx': async () => { if (confirm('Ta bort registreringen?')) { const f = S.form; closeModal(); await queueDelete('Transaktioner', f); toast('Borttagen'); } },
  'save-konto': () => saveKonto(),
  'del-konto': async () => { if (confirm('Ta bort kontot?')) { const f = S.form; closeModal(); await queueDelete('Konton', f); toast('Borttaget'); } },
  'kv-remove': () => { collectTx(); S.form._file = null; S.form.kvittoId = ''; S.form.kvittoNamn = ''; $('#f-kvitto').innerHTML = kvittoHtml(); },
  'kv-view': () => viewKvitto(),
  sync: () => sync(true),
  'keep-mine': v => keepMine(v),
  'use-server': v => useServer(v),
  retry: v => retryOp(v),
  discard: v => discardOp(v),
  'pair-code': () => newPairCode(),
  devices: () => loadDevices(),
  revoke: v => revokeDevice(v),
  backup: () => backupNow(),
  'export-json': () => exportJson(),
  'export-csv': () => exportCsv(),
  unpair: () => unpair(),
  repair: () => repair(),
  pair: () => doPair(),
  'save-settings': () => {
    const vals = {};
    for (const m of SETTINGS_META) {
      const n = parseAmt($('#set-' + m.k).value);
      if (isNaN(n) || n < 0) return toast('Kontrollera värdet för: ' + m.l, 'err');
      vals[m.k] = String(n);
    }
    queueSettings(vals).then(() => toast('Inställningarna är sparade ✓'));
  },
  sync_pill: () => go('installningar')
};

document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (el) { e.preventDefault(); const fn = ACTIONS[el.dataset.act]; if (fn) fn(el.dataset.v); return; }
  if (e.target.id === 'modal') closeModal();
  if (e.target.closest('.syncpill') && S.config && S.view !== 'installningar') go('installningar');
});
document.addEventListener('input', e => { if (e.target.id === 'f-belopp') updateMomsInfo(); });
document.addEventListener('change', e => {
  if (e.target.id === 'f-moms') updateMomsInfo();
  if (e.target.id === 'f-kat' && S.form) { collectTx(); applyKat(S.form); renderTxForm(); }
  if (e.target.id === 'f-fil') onFile(e.target);
});
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#modal').hidden) closeModal(); });

function setOnline() { document.body.classList.toggle('offline', !navigator.onLine); renderSync(); }

/* =====================================================================
   START
   ===================================================================== */
async function init() {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
  try { if (navigator.storage && navigator.storage.persist) await navigator.storage.persist(); } catch (e) { /* valfritt */ }
  renderShell();
  setOnline();
  window.addEventListener('online', () => { setOnline(); sync(); });
  window.addEventListener('offline', setOnline);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') sync(); });
  setInterval(() => { if (document.visibilityState === 'visible') sync(); }, 60000);
  S.config = await DB.get('meta', 'config');
  if (!S.config) return renderPairing();
  await loadLocal();
  render();
  sync();
}
init().catch(e => { $('#main').innerHTML = `<div class="alert">Appen kunde inte starta: ${esc(e.message)}</div>`; });
