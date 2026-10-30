'use strict';
/* =====================================================================
   EKONOMICHEFEN – appen (offline-first)
   Allt sparas först på enheten och synkroniseras automatiskt
   med ditt Google-konto när det finns internet.
   ===================================================================== */
const APP_VERSION = '0.4.0';

/* ---------- Standardkategorier och BAS-förslag ----------
   Egna kategorier (t.ex. dina tjänster) läggs till i appen under
   Inställningar och sparas i ditt privata kalkylark – inte i koden. */
const KAT = {
  Privatekonomi: {
    Utgift: [
      { n: 'Boende', fast: true }, { n: 'Livsmedel' }, { n: 'Restaurang' }, { n: 'Transport' }, { n: 'Hälsa' }, { n: 'Kläder' },
      { n: 'Försäkringar', fast: true }, { n: 'Abonnemang', fast: true }, { n: 'Nöjen' }, { n: 'Lån & avbetalningar', fast: true },
      { n: 'Resor' }, { n: 'Gåvor' }, { n: 'Skatter & avgifter' }, { n: 'Övrigt' }
    ],
    Inkomst: [{ n: 'Lön' }, { n: 'Ersättning & bidrag' }, { n: 'Återbetalning' }, { n: 'Övrigt' }],
    Sparande: [{ n: 'Buffert' }, { n: 'Långsiktigt sparande' }, { n: 'Investeringar' }],
    'Överföring': [{ n: 'Interna överföringar' }]
  },
  Företag: {
    Utgift: [
      { n: 'Programvaror', bas: '5420', moms: 25 },
      { n: 'Marknadsföring', bas: '5910', moms: 25 },
      { n: 'Utrustning', bas: '5410', moms: 25 },
      { n: 'Kontorsmaterial', bas: '6110', moms: 25 },
      { n: 'Resor', bas: '5800', moms: 6 },
      { n: 'Bankavgifter', bas: '6570', moms: 0 },
      { n: 'Försäkringar', bas: '6310', moms: 0 },
      { n: 'Utbildning', bas: '6991', moms: 25 },
      { n: 'Lokalhyra', bas: '5010', moms: 25 },
      { n: 'Förbrukningsmaterial', bas: '5460', moms: 25 },
      { n: 'Telefon', bas: '6212', moms: 25 },
      { n: 'Internet', bas: '6230', moms: 25 },
      { n: 'Representation', bas: '6071', moms: 25 },
      { n: 'Drivmedel', bas: '5611', moms: 25 },
      { n: 'Facklitteratur', bas: '6970', moms: 6 },
      { n: 'Arbetskläder', bas: '5480', moms: 25 },
      { n: 'Redovisning', bas: '6530', moms: 25 },
      { n: 'Övriga verksamhetskostnader', bas: '6991', moms: 25 }
    ],
    Inkomst: [
      { n: 'Tjänster', bas: '3041', moms: 25 },
      { n: 'Paket & abonnemang', bas: '3041', moms: 25 },
      { n: 'Kurser & utbildning', bas: '3041', moms: 25 },
      { n: 'Rådgivning', bas: '3041', moms: 25 },
      { n: 'Övrig försäljning', bas: '3041', moms: 25 }
    ],
    'Eget uttag': [{ n: 'Eget uttag', bas: '2013', moms: 0 }],
    'Egen insättning': [{ n: 'Egen insättning', bas: '2018', moms: 0 }],
    'Överföring': [{ n: 'Intern överföring', bas: '', moms: 0 }]
  }
};
const TYPER = eko => Object.keys(KAT[eko]);
const sant = v => v === true || v === 'true';
// Standardkategorier + dina egna (minus dolda)
function kats(eko, typ) {
  const egna = (S.tables.Kategorier || []).filter(k => k.ekonomi === eko && k.typ === typ);
  const dolda = new Set(egna.filter(k => sant(k.dold)).map(k => k.namn));
  const list = (KAT[eko][typ] || []).filter(k => !dolda.has(k.n)).map(k => Object.assign({ standard: true }, k));
  const egnaAktiva = egna.filter(k => !sant(k.dold) && !list.some(x => x.n === k.namn))
    .map(k => ({ n: k.namn, bas: k.baskonto || '', moms: Number(k.momssats) || 0, fast: sant(k.fast), id: k.id }));
  return egnaAktiva.concat(list); // dina egna först
}
const isFast = namn => kats('Privatekonomi', 'Utgift').some(k => k.n === namn && k.fast);
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
    async putMany(store, vals) { if (!vals.length) return; const d = await open(); const t = d.transaction(store, 'readwrite'); const os = t.objectStore(store); vals.forEach(v => os.put(v)); return done(t); },
    async delMany(store, keys) { if (!keys.length) return; const d = await open(); const t = d.transaction(store, 'readwrite'); const os = t.objectStore(store); keys.forEach(k => os.delete(k)); return done(t); },
    // Läser och skriver poster + ändringskö i EN transaktion – inget kan hamna emellan.
    async atomic(build) {
      const d = await open();
      return new Promise((res, rej) => {
        const t = d.transaction(['records', 'outbox'], 'readwrite');
        const rs = t.objectStore('records'), os = t.objectStore('outbox');
        let recs = null, outs = null;
        const go = () => { const w = build(recs, outs); (w.recPuts || []).forEach(v => rs.put(v)); (w.recDels || []).forEach(k => rs.delete(k)); (w.outDels || []).forEach(k => os.delete(k)); (w.outPuts || []).forEach(v => os.put(v)); };
        rs.getAll().onsuccess = e => { recs = e.target.result; if (outs) go(); };
        os.getAll().onsuccess = e => { outs = e.target.result; if (recs) go(); };
        t.oncomplete = () => res(); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error);
      });
    },
    // Sparar serverns version – utom för poster som har en nyare lokal ändring på väg.
    putUnlessPending(puts, dels) {
      return this.atomic((recs, outs) => {
        const busy = new Set(outs.filter(o => o.record).map(o => o.record.id));
        return { recPuts: puts.filter(r => !busy.has(r.id)), recDels: (dels || []).filter(id => !busy.has(id)) };
      });
    },
    async wipe() { const d = await open(); d.close(); dbp = null; return wrap(indexedDB.deleteDatabase('ekonomichefen')); }
  };
})();

/* =====================================================================
   TILLSTÅND
   ===================================================================== */
const S = {
  config: null, tx: [], konton: [], tables: {}, outbox: [], pendingFiles: 0, inflight: new Set(),
  settings: {}, lankar: null, lastSync: '', syncing: false, authError: '',
  view: 'oversikt', month: today().slice(0, 7), form: null, devices: null
};
const set = k => { const v = Number(String(S.settings[k] ?? (SETTINGS_META.find(m => m.k === k) || {}).d ?? 0).replace(',', '.')); return isFinite(v) ? v : 0; };

async function loadLocal() {
  const recs = await DB.all('records');
  S.tables = {};
  for (const r of recs) (S.tables[r._sheet] || (S.tables[r._sheet] = [])).push(r);
  S.tx = S.tables.Transaktioner || [];
  S.konton = (S.tables.Konton || []).slice().sort((a, b) => String(a.namn).localeCompare(b.namn, 'sv'));
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

async function queueSave(sheet, rec) { return queueMany(sheet, [rec]); }

// Sparar många poster på en gång (t.ex. en bankimport) – allt lokalt först.
async function queueMany(sheet, recs, opts = {}) {
  if (!recs.length) return;
  await DB.atomic((dbRecs, outbox) => {
    // Senaste kända serverversion läses direkt ur databasen i samma transaktion
    const known = new Map(dbRecs.map(r => [r.id, Number(r.version) || 0]));
    const prevById = new Map(outbox.filter(o => o.record && o.type === 'save').sort((a, b) => a.t - b.t).map(o => [o.record.id, o]));
    const now = Date.now(), recPuts = [], outPuts = [], outDels = [];
    recs.forEach((rec, i) => {
      const ver = known.has(rec.id) ? known.get(rec.id) : (Number(rec.version) || 0);
      rec = Object.assign({}, rec, { version: ver });
      recPuts.push(Object.assign({}, rec, { _sheet: sheet, _pending: true }));
      const prev = prevById.get(rec.id);
      const op = { opId: uuid(), type: 'save', sheet, record: strip(rec), status: 'pending', t: now + i };
      if (prev && S.inflight.has(prev.opId)) {
        // Föregående ändring är på väg till Google just nu – den här läggs efter den
        op.baseVersion = (Number(prev.baseVersion) || 0) + 1;
      } else if (prev) {
        // Slå ihop med tidigare osynkad ändring av samma post
        op.baseVersion = prev.status === 'conflict' && prev.server ? Number(prev.server.version) : prev.baseVersion;
        outDels.push(prev.opId);
      } else {
        op.baseVersion = ver;
      }
      outPuts.push(op);
    });
    return { recPuts, outPuts, outDels };
  });
  if (opts.quiet) await loadLocal(); else await afterLocalChange();
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
    const allPending = (await DB.all('outbox')).filter(o => o.status === 'pending').sort((a, b) => a.t - b.t);
    const ops = allPending.slice(0, 300); // stora importer skickas i omgångar
    if (allPending.length > ops.length) S.syncAgain = true;
    ops.forEach(o => S.inflight.add(o.opId));
    if (ops.some(o => o.record && String(o.record.kvittoId || '').startsWith('local:'))) throw new Error('Kvitton väntar fortfarande på uppladdning.');
    const since = (await DB.get('meta', 'since')) || '';
    const res = await call('sync', {
      since,
      ops: ops.map(o => ({ opId: o.opId, type: o.type, sheet: o.sheet, record: o.record, baseVersion: o.baseVersion, values: o.values }))
    }, { timeout: 90000 });

    const okRecords = [];
    for (const r of res.results) {
      const op = ops.find(o => o.opId === r.opId);
      if (!op) continue;
      if (r.status === 'ok') {
        await DB.del('outbox', op.opId);
        if (r.record) okRecords.push(Object.assign({}, r.record, { _sheet: op.sheet }));
      } else {
        op.status = r.status === 'conflict' ? 'conflict' : 'error';
        op.server = r.server || null;
        op.error = r.error;
        await DB.put('outbox', op);
      }
    }

    const waiting = new Set((await DB.all('outbox')).filter(o => o.record).map(o => o.record.id));
    // En nyare lokal ändring av samma post vinner tills den också är skickad
    await DB.putUnlessPending(okRecords);
    const seen = new Set();
    const puts = [], dels = [];
    for (const sheet of Object.keys(res.changes || {})) {
      for (const rec of res.changes[sheet] || []) {
        seen.add(rec.id);
        if (waiting.has(rec.id)) continue; // din osynkade ändring vinner tills den är skickad
        if (rec.status === 'Raderad') dels.push(rec.id);
        else puts.push(Object.assign({}, rec, { _sheet: sheet }));
      }
    }
    await DB.putUnlessPending(puts, dels);
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
    renderSoft();
    if (manual) toast('Synkroniserat ✓');
  } catch (e) {
    if (e.auth) { S.authError = e.message; render(); }
    else if (manual || !e.offline) toast(e.message, 'err');
  } finally {
    S.inflight.clear();
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
// Momsstatus: momsbefriad tills ett datum anges under Inställningar.
const momsReg = datum => { const f = String(S.settings.momsRegistreradFran || ''); return !!f && String(datum) >= f; };
// Ingående moms dras bara av när du är momsregistrerad OCH underlaget visar avdragsgill moms.
const avdragsgill = t => momsReg(t.datum) && (t.momsbedomning === 'Avdragsgill' || (!t.momsbedomning && t.kalla !== 'Import' && !!t.kvittoId));
const inYearTo = ym => t => String(t.datum).slice(0, 4) === ym.slice(0, 4) && String(t.datum).slice(0, 7) <= ym;

function firm(filter) {
  const r = { oms: 0, kost: 0, momsUt: 0, momsIn: 0, uttag: 0, ins: 0, kat: {}, ink: {} };
  for (const t of S.tx) {
    if (t.ekonomi !== 'Företag' || !filter(t)) continue;
    const b = Number(t.belopp) || 0;
    if (t.typ === 'Inkomst') { const m = momsReg(t.datum) ? Number(t.moms) || 0 : 0; r.oms += b - m; r.momsUt += m; r.ink[t.kategori] = (r.ink[t.kategori] || 0) + b - m; }
    else if (t.typ === 'Utgift') { const m = avdragsgill(t) ? Number(t.moms) || 0 : 0; r.kost += b - m; r.momsIn += m; r.kat[t.kategori] = (r.kat[t.kategori] || 0) + b - m; }
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
    else if (t.typ === 'Utgift') { r.utg += b; isFast(t.kategori) ? r.fast += b : r.rorl += b; r.kat[t.kategori] = (r.kat[t.kategori] || 0) + b; }
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
  upload: '<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/>',
  granska: '<path d="M9 11l2 2 4-4"/><rect x="3" y="3" width="18" height="18" rx="3"/>',
  kvitto: '<path d="M6 2h12v20l-3-2-3 2-3-2-3 2z"/><path d="M9 7h6M9 11h6M9 15h4"/>'
};
const icon = (n, cls = '') => `<svg class="ic ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[n]}</svg>`;
const NAV = [['oversikt', 'Översikt'], ['privat', 'Privatekonomi'], ['firma', 'Företag'], ['granska', 'Granska'], ['konton', 'Konton'], ['installningar', 'Inställningar']];

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
  const views = { oversikt: vOversikt, privat: vPrivat, firma: vFirma, granska: vGranska, konton: vKonton, installningar: vInstallningar };
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
// Ritar inte om medan du skriver i ett fält – då väntar vi tills du är klar.
function renderSoft() {
  const a = document.activeElement;
  if (a && $('#main').contains(a) && /^(INPUT|SELECT|TEXTAREA)$/.test(a.tagName)) { S.dirty = true; renderSync(); return; }
  render();
}

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

  const imported = S.tx.filter(t => t.kalla === 'Import');
  const attGranska = imported.filter(t => !sant(t.utredning) && ['Föreslagen', 'Behöver granskas'].includes(statusOf(t))).length;
  const saknar = S.tx.filter(t => statusOf(t) === 'Saknar underlag').length;
  const omsKal = firm(t => String(t.datum).slice(0, 4) === ym.slice(0, 4)).oms;
  const last6 = [...Array(6)].map((_, i) => shiftMonth(ym, i - 5));
  const fRows = last6.map(m => { const x = firm(inMonth(m)); return { label: monthShort(m), a: x.oms, b: x.kost }; });
  const pRows = last6.map(m => { const x = priv(inMonth(m)), y = firm(inMonth(m)); return { label: monthShort(m), a: x.ink + y.uttag, b: x.utg }; });

  return head('Ekonomisk överblick', 'Översikt', monthBar()) + `
  <section class="hero card">
    <div><div class="lbl">Dina pengar just nu</div><div class="num xl">${kr(pengarP + pengarF)}</div>
    <div class="sub">Privatekonomi ${kr(pengarP)} · Företag ${kr(pengarF)}${S.konton.length ? '' : ' · lägg in dina konton under Konton'}</div></div>
    <div class="hero-side"><div class="lbl">Möjligt att ta ut i år</div><div class="num">${kr(Math.max(0, mojligt))}</div><div class="sub">efter skattereserv och redan gjorda uttag</div></div>
  </section>
  ${imported.length || saknar ? `<section class="card todo"><div><h3>Att göra</h3><p class="hint lead"><b>${attGranska}</b> transaktioner väntar på granskning · <b>${saknar}</b> företagsutgifter saknar underlag</p></div><div class="btnrow tight"><button class="btn primary" data-act="go" data-v="granska">Granska</button><button class="btn ghost" data-act="import">${icon('upload')} Importera</button></div></section>`
    : `<section class="card todo"><div><h3>Kom ikapp med bokföringen</h3><p class="hint lead">Importera ett helt års banktransaktioner – appen kategoriserar och du granskar.</p></div><div class="btnrow tight"><button class="btn primary" data-act="import">${icon('upload')} Importera bankfil</button></div></section>`}
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
      ${!momsReg(today()) ? `<div class="goal momsgrans">${goal('Omsättning ' + ym.slice(0, 4) + ' mot momsbefrielsens gräns', omsKal, 120000, omsKal > 100000 ? '⚠️ nära gränsen – se över momsregistrering' : 'momsbefriad')}</div>` : ''}
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
  <div class="grid2">
    <section class="card"><h3>Momsstatus</h3>
      <p class="hint lead">Lämna tomt så länge företaget är momsbefriat. Då räknas ingen moms som avdragsgill och kostnader bokförs inklusive moms. Fyll i datumet om du blir momsregistrerad.</p>
      <label class="fld"><span>Momsregistrerad från och med</span><input id="set-momsfran" type="date" value="${esc(S.settings.momsRegistreradFran || '')}"></label>
      <div class="btnrow"><button class="btn primary" data-act="save-moms">Spara momsstatus</button></div>
    </section>
    <section class="card"><h3>Kategorier</h3><div id="kg-box">${kategoriHtml()}</div></section>
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
  const k = kats(f.ekonomi, f.typ).find(x => x.n === f.kategori);
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
  if ($('#f-mb')) f.momsbedomning = v('#f-mb');
  if ($('#f-ant')) f.anteckning = v('#f-ant');
  if ($('#f-utr')) f.utredning = $('#f-utr').checked;
}

function renderTxForm() {
  const f = S.form;
  const typer = Object.keys(KAT[f.ekonomi]);
  if (!typer.includes(f.typ)) f.typ = typer[0];
  const katList = kats(f.ekonomi, f.typ);
  if (!katList.some(k => k.n === f.kategori)) { f.kategori = katList[0].n; applyKat(f); }
  const firma = f.ekonomi === 'Företag';
  const konton = S.konton.filter(k => k.ekonomi === f.ekonomi);
  modal(`<div class="mhead"><h2>${f._new ? 'Registrera' : 'Ändra'}</h2><button class="x" data-act="close" aria-label="Stäng">×</button></div>
  <div class="seg">${['Privatekonomi', 'Företag'].map(e => `<button type="button" class="${f.ekonomi === e ? 'on' : ''}" data-act="seg-eko" data-v="${e}">${e}</button>`).join('')}</div>
  <div class="chips">${typer.map(t => `<button type="button" class="chip ${f.typ === t ? 'on' : ''}" data-act="seg-typ" data-v="${esc(t)}">${esc(t)}</button>`).join('')}</div>
  <label class="fld big"><span>Belopp${firma ? ' inkl. moms' : ''}</span><div class="suffix"><input id="f-belopp" inputmode="decimal" placeholder="0" value="${esc(f.belopp)}" autocomplete="off"><em>kr</em></div></label>
  <div class="row2">
    <label class="fld"><span>Datum</span><input id="f-datum" type="date" value="${esc(f.datum)}"></label>
    <label class="fld"><span>Kategori</span><select id="f-kat">${katList.map(k => `<option ${k.n === f.kategori ? 'selected' : ''}>${esc(k.n)}</option>`).join('')}</select></label>
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
  ${firma && (f.typ === 'Utgift' || f.typ === 'Inkomst') ? `<label class="fld"><span>Momsbedömning</span><select id="f-mb">${['', 'Okänd', 'Avdragsgill', 'Ej avdragsgill', 'Momsfri', 'Utländskt köp', 'Omvänd skattskyldighet', 'Momsbefriad'].map(o => `<option value="${o}" ${(f.momsbedomning || '') === o ? 'selected' : ''}>${o || (momsReg(f.datum) ? 'Enligt underlag' : 'Momsbefriad (standard)')}</option>`).join('')}</select></label>` : ''}
  <label class="fld"><span>Egen anteckning</span><textarea id="f-ant" rows="2" placeholder="T.ex. vad det gällde eller vad som behöver utredas">${esc(f.anteckning || '')}</textarea></label>
  ${f.kalla === 'Import' ? `<div class="orig"><b>Ursprungligt från banken</b><span>${esc(f.origDatum)} · ${esc(f.origText)} · ${kr(f.origBelopp)}${f.origKonto ? ' · ' + esc(f.origKonto) : ''}</span>
    <small>Status: ${esc(sant(f.utredning) ? 'Utredning' : statusOf(f))}${f.sakerhet !== '' && f.sakerhet !== undefined ? ' · säkerhet ' + esc(f.sakerhet) + ' %' : ''}${f.regel ? ' · ' + esc(f.regel) : ''}${f.godkand ? ' · godkänd ' + esc(String(f.godkand).slice(0, 10)) : ''}${f.dublettAv ? ' · möjlig dublett' : ''}</small>
    <label class="chk"><input type="checkbox" id="f-utr" ${sant(f.utredning) ? 'checked' : ''}> Flytta till utredningslistan</label></div>` : ''}
  <div class="mfoot">${f._new ? '<span></span>' : '<button class="btn ghost danger" data-act="del-tx">Ta bort</button>'}<span class="btnrow tight">${!f._new && ['Föreslagen', 'Behöver granskas'].includes(statusOf(f)) ? '<button class="btn ghost" data-act="f-approve">Spara och godkänn</button>' : ''}<button class="btn primary" data-act="save-tx" id="f-save">Spara</button></span></div>`);
  updateMomsInfo();
  if (f._new && !S.formFocused) { S.formFocused = true; setTimeout(() => { const a = document.activeElement; if ($('#f-belopp') && !(a && /^(INPUT|SELECT|TEXTAREA)$/.test(a.tagName) && $('#sheet').contains(a))) $('#f-belopp').focus({ preventScroll: true }); }, 60); }
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

async function saveTx(godkann) {
  collectTx();
  const f = S.form, belopp = parseAmt(f.belopp);
  if (!(belopp > 0)) return toast('Ange ett belopp större än 0.', 'err');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f.datum || '')) return toast('Ange ett datum.', 'err');
  const firma = f.ekonomi === 'Företag', ms = firma ? Number(f.momssats) || 0 : 0;
  const orig = f._new ? null : S.tx.find(x => x.id === f.id);
  const extra = { anteckning: (f.anteckning || '').trim(), utredning: sant(f.utredning), momsbedomning: f.momsbedomning || '' };
  if (orig && orig.kalla === 'Import' && (orig.kategori !== f.kategori || orig.typ !== f.typ)) Object.assign(extra, { manuell: true, sakerhet: 100, regel: 'Vald av dig' });
  if (godkann) Object.assign(extra, { granskning: 'Godkänd', godkand: new Date().toISOString(), osaker: false });
  const rec = {
    ...(orig ? strip(orig) : {}), ...extra,
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
    if (godkann) { const n = await learn([rec]); if (n) { await afterLocalChange(); toast(`Godkänd ✓ · ${n} liknande fick uppdaterat förslag`); return; } }
    toast(godkann ? 'Godkänd ✓' : navigator.onLine ? 'Sparat ✓' : 'Sparat på enheten – synkas när du är online');
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
  const orig = S.konton.find(x => x.id === f.id);
  await queueSave('Konton', { ...(orig ? strip(orig) : {}), id: f.id, version: f.version || 0, ekonomi: f.ekonomi, namn: f.namn.trim(), typ: f.typ, saldo: saldoV, saldodatum: f.saldodatum || '', skapad: f.skapad || '' });
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
  download('ekonomichefen-' + today() + '.json', JSON.stringify({ exporterad: new Date().toISOString(), version: APP_VERSION, transaktioner: S.tx.map(strip), konton: S.konton.map(strip), regler: (S.tables.Regler || []).map(strip), kategorier: (S.tables.Kategorier || []).map(strip), importer: (S.tables.Importer || []).map(strip), installningar: S.settings }, null, 2), 'application/json');
}
function exportCsv() {
  const cols = ['datum', 'ekonomi', 'typ', 'kategori', 'beskrivning', 'motpart', 'belopp', 'momssats', 'moms', 'momsbedomning', 'baskonto', 'konto', 'kvittoNamn', 'status', 'godkand', 'anteckning', 'kalla', 'origDatum', 'origText', 'origBelopp', 'origKonto', 'sakerhet', 'regel'];
  const cell = v => { const s = String(v == null ? '' : v); return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const num = v => String(v == null ? '' : v).replace('.', ',');
  const rows = S.tx.slice().sort((a, b) => String(a.datum).localeCompare(b.datum)).map(t => cols.map(c => c === 'status' ? cell(sant(t.utredning) ? 'Utredning' : statusOf(t)) : ['belopp', 'moms', 'origBelopp'].includes(c) ? num(t[c]) : cell(t[c])).join(';'));
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
   REGELMOTOR – självlärande kategorisering utan betald AI
   1. Dina egna, inlärda regler (från godkända transaktioner) vinner först.
   2. Därefter generella standardregler för vanliga svenska butiker.
   3. Annars en försiktig gissning utifrån om pengarna gick in eller ut.
   ===================================================================== */
const STOPWORDS = new Set(['kortköp', 'kortkop', 'köp', 'kop', 'reservation', 'betalning', 'betaln', 'sek', 'kr', 'ab', 'hb', 'kb', 'se', 'www', 'com',
  'nu', 'the', 'och', 'för', 'till', 'från', 'via', 'pay', 'payment', 'debit', 'kort', 'card', 'vpay', 'visa', 'mastercard', 'autogiro', 'ag', 'bg', 'pg',
  'e-faktura', 'efaktura', 'faktura', 'överföring', 'overforing', 'insättning', 'uttag', 'direktbetalning', 'ocr', 'ref', 'sweden', 'sverige',
  'stockholm', 'göteborg', 'goteborg', 'malmö', 'malmo', 'uppsala', 'online', 'store', 'butik', 'k']);
const normText = s => String(s || '').toLowerCase().replace(/[0-9]+/g, ' ').replace(/[^a-zåäöéü&\- ]+/g, ' ').replace(/\s+/g, ' ').trim();
const merchantKey = s => normText(s).split(' ').map(w => w.replace(/^-+|-+$/g, '')).filter(w => w.length > 1 && !STOPWORDS.has(w)).slice(0, 2).join(' ');
const prettyText = s => String(s || '').replace(/^(k\*|kortköp|kortkop)\s*\d{0,8}\s*/i, '').replace(/\s+/g, ' ').trim();
const dirOf = typ => (typ === 'Inkomst' || typ === 'Egen insättning') ? 'in' : (typ === 'Överföring' ? 'båda' : 'ut');
const kw = words => new RegExp('(?:^|[^a-zåäöéü0-9])(' + words.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')(?=$|[^a-zåäöéü0-9])');

// [nyckelord, förslag privat [typ, kategori], förslag företag [typ, kategori]]
const BUILTIN = [
  [kw(['ica', 'coop', 'willys', 'hemköp', 'hemkop', 'lidl', 'city gross', 'netto', 'matsmart', 'mathem', 'tempo', 'pressbyrån', '7-eleven']), ['Utgift', 'Livsmedel'], ['Utgift', 'Förbrukningsmaterial']],
  [kw(['restaurang', 'pizzeria', 'sushi', 'max', 'mcdonalds', 'burger king', 'espresso house', 'waynes', 'starbucks', 'foodora', 'wolt', 'uber eats', 'café', 'cafe', 'kafé', 'bistro', 'pub']), ['Utgift', 'Restaurang'], ['Utgift', 'Representation']],
  [kw(['västtrafik', 'vasttrafik', 'sl', 'skånetrafiken', 'skanetrafiken', 'sj', 'uber', 'bolt', 'taxi', 'parkering', 'easypark', 'apcoa', 'q-park', 'qpark', 'circle k', 'okq8', 'preem', 'st1', 'shell', 'ingo', 'bensin']), ['Utgift', 'Transport'], ['Utgift', 'Resor']],
  [kw(['telia', 'tele2', 'telenor', 'tre', 'comviq', 'hallon', 'vimla', 'fello', 'bahnhof', 'bredband', 'comhem', 'com hem']), ['Utgift', 'Abonnemang'], ['Utgift', 'Telefon']],
  [kw(['spotify', 'netflix', 'hbo', 'viaplay', 'disney', 'youtube', 'storytel', 'bookbeat', 'apple.com', 'icloud', 'cmore', 'tv4']), ['Utgift', 'Abonnemang'], ['Utgift', 'Programvaror']],
  [kw(['google', 'microsoft', 'adobe', 'canva', 'zoom', 'dropbox', 'notion', 'chatgpt', 'openai', 'anthropic', 'claude.ai', 'wix', 'squarespace', 'one.com', 'loopia', 'mailchimp', 'calendly', 'bokadirekt', 'zettle', 'github', 'wordpress', 'strato', 'shopify', 'stripe']), ['Utgift', 'Abonnemang'], ['Utgift', 'Programvaror']],
  [kw(['facebook', 'facebk', 'meta', 'instagram', 'linkedin', 'tiktok', 'google ads']), ['Utgift', 'Nöjen'], ['Utgift', 'Marknadsföring']],
  [kw(['apotek', 'apoteket', 'kronans', 'hjärtat', 'vårdcentral', 'vardcentral', 'tandläkare', 'folktandvården', 'kry', 'min doktor', 'vårdguiden']), ['Utgift', 'Hälsa'], ['Utgift', 'Övriga verksamhetskostnader']],
  [kw(['h&m', 'hm', 'lindex', 'kappahl', 'zalando', 'boozt', 'stadium', 'xxl', 'intersport', 'åhlens', 'ahlens', 'gina tricot', 'dressmann']), ['Utgift', 'Kläder'], ['Utgift', 'Arbetskläder']],
  [kw(['clas ohlson', 'biltema', 'jula', 'ikea', 'elgiganten', 'netonnet', 'power', 'kjell', 'webhallen', 'inet', 'gymgrossisten', 'teknikmagasinet']), ['Utgift', 'Övrigt'], ['Utgift', 'Utrustning']],
  [kw(['staples', 'office depot', 'lyreco', 'bokus', 'adlibris', 'akademibokhandeln']), ['Utgift', 'Övrigt'], ['Utgift', 'Kontorsmaterial']],
  [kw(['folksam', 'trygg-hansa', 'trygghansa', 'länsförsäkringar', 'lansforsakringar', 'moderna', 'gjensidige', 'hedvig', 'if skadeförsäkring', 'försäkring', 'forsakring']), ['Utgift', 'Försäkringar'], ['Utgift', 'Försäkringar']],
  [kw(['hyra', 'hyresavi', 'brf', 'bostadsrätt', 'vattenfall', 'ellevio', 'tibber', 'fortum', 'eon', 'e.on', 'elavtal']), ['Utgift', 'Boende'], ['Utgift', 'Lokalhyra']],
  [kw(['csn', 'klarna', 'resurs', 'santander', 'amortering', 'lån', 'avbetalning']), ['Utgift', 'Lån & avbetalningar'], ['Utgift', 'Övriga verksamhetskostnader']],
  [kw(['skatteverket', 'skattekonto', 'kronofogden', 'transportstyrelsen', 'trängselskatt']), ['Utgift', 'Skatter & avgifter'], ['Utgift', 'Övriga verksamhetskostnader']],
  [kw(['avanza', 'nordnet', 'fondköp', 'fondkop', 'isk']), ['Sparande', 'Investeringar'], ['Överföring', 'Intern överföring']],
  [kw(['månadsavgift', 'årsavgift', 'kortavgift', 'bankavgift', 'avgift']), ['Utgift', 'Övrigt'], ['Utgift', 'Bankavgifter']],
  [kw(['lön', 'lon', 'löneutbetalning']), ['Inkomst', 'Lön'], ['Inkomst', 'Övrig försäljning']],
  [kw(['egen överföring', 'överföring egna', 'eget konto', 'till sparkonto', 'från sparkonto', 'mellan egna']), ['Överföring', 'Interna överföringar'], ['Överföring', 'Intern överföring']]
];

function katInfo(eko, typ, namn) {
  const list = kats(eko, typ);
  return list.find(k => k.n === namn) || null;
}

// Föreslår typ, kategori och säkerhetsgrad för en banktransaktion.
function suggest(eko, amount, text) {
  const dir = amount < 0 ? 'ut' : 'in';
  const okDir = typ => { const d = dirOf(typ); return d === 'båda' || d === dir; };
  const mk = (typ, kat, conf, regel, regelId) => {
    let k = katInfo(eko, typ, kat);
    if (!k) { const list = kats(eko, typ); k = list[list.length - 1] || { n: kat }; conf = Math.min(conf, 45); }
    return { typ, kategori: k.n, sakerhet: conf, regel, regelId: regelId || '', baskonto: eko === 'Företag' ? (k.bas || '') : '', foreslagenMomssats: eko === 'Företag' ? (k.moms ?? '') : '' };
  };
  const key = merchantKey(text);
  if (key) {
    const rules = (S.tables.Regler || []).filter(r => r.ekonomi === eko && r.riktning === dir && r.monster);
    const r = rules.find(x => x.monster === key) ||
      (key.length >= 4 && rules.find(x => String(x.monster).length >= 4 && (key.startsWith(x.monster) || String(x.monster).startsWith(key))));
    if (r && okDir(r.typ)) { const n = Number(r.antal) || 1; return mk(r.typ, r.kategori, n >= 3 ? 95 : n === 2 ? 85 : 75, 'Din regel: ' + r.monster, r.id); }
  }
  const low = ' ' + String(text || '').toLowerCase() + ' ';
  for (const [re, p, f] of BUILTIN) {
    if (!re.test(low)) continue;
    const [typ, kat] = eko === 'Företag' ? f : p;
    if (okDir(typ)) return mk(typ, kat, 65, 'Standardregel');
  }
  if (/swish/.test(low)) {
    if (eko === 'Företag' && dir === 'in') { const first = kats('Företag', 'Inkomst')[0]; return mk('Inkomst', first.n, 55, 'Swish-inbetalning'); }
    return mk(dir === 'in' ? 'Inkomst' : 'Utgift', 'Övrigt', 30, 'Swish – okänd mottagare');
  }
  if (eko === 'Företag') return dir === 'in' ? mk('Inkomst', 'Övrig försäljning', 30, 'Okänd – gissning') : mk('Utgift', 'Övriga verksamhetskostnader', 20, 'Okänd – gissning');
  return dir === 'in' ? mk('Inkomst', 'Övrigt', 25, 'Okänd – gissning') : mk('Utgift', 'Övrigt', 20, 'Okänd – gissning');
}

const signedAmount = t => (t.origBelopp !== undefined && t.origBelopp !== '') ? Number(t.origBelopp) : (dirOf(t.typ) === 'in' ? 1 : -1) * Number(t.belopp);
const harUnderlag = t => !!t.kvittoId || (S.tables.Dokument || []).some(d => d.transaktionId === t.id);
// Status: Föreslagen · Behöver granskas · Saknar underlag · Godkänd
function statusOf(t) {
  if (t.granskning === 'Föreslagen' || t.granskning === 'Behöver granskas') return t.granskning;
  if (t.kalla === 'Import' && !t.granskning) return 'Föreslagen';
  if (t.ekonomi === 'Företag' && t.typ === 'Utgift' && !harUnderlag(t)) return 'Saknar underlag';
  return 'Godkänd';
}
const STATUS_CLS = { 'Föreslagen': 'st-f', 'Behöver granskas': 'st-b', 'Saknar underlag': 'st-s', 'Godkänd': 'st-g' };

// Lär sig av godkända transaktioner och uppdaterar liknande, ej granskade förslag.
async function learn(txs) {
  const groups = new Map();
  txs.forEach(t => {
    const key = merchantKey(t.origText || t.beskrivning);
    if (!key) return;
    const dir = signedAmount(t) < 0 ? 'ut' : 'in';
    groups.set(t.ekonomi + '|' + dir + '|' + key, { eko: t.ekonomi, dir, key, typ: t.typ, kategori: t.kategori });
  });
  if (!groups.size) return 0;
  const rules = S.tables.Regler || [];
  const ruleUpdates = [];
  groups.forEach(g => {
    const ex = rules.find(r => r.ekonomi === g.eko && r.riktning === g.dir && r.monster === g.key);
    if (ex) {
      const same = ex.typ === g.typ && ex.kategori === g.kategori;
      ruleUpdates.push(Object.assign(strip(ex), { typ: g.typ, kategori: g.kategori, antal: same ? (Number(ex.antal) || 1) + 1 : 1, tidigare: same ? (ex.tidigare || '') : ex.kategori, senast: today() }));
    } else {
      ruleUpdates.push({ id: uuid(), version: 0, ekonomi: g.eko, riktning: g.dir, monster: g.key, typ: g.typ, kategori: g.kategori, antal: 1, senast: today() });
    }
  });
  await queueMany('Regler', ruleUpdates, { quiet: true });
  // Uppdatera ej granskade förslag med samma motpart (aldrig sådant du ändrat själv)
  const approvedIds = new Set(txs.map(t => t.id));
  const updates = [];
  S.tx.forEach(t => {
    if (approvedIds.has(t.id) || t.manuell === true || t.manuell === 'true' || t.kalla !== 'Import') return;
    const st = statusOf(t); if (st !== 'Föreslagen' && st !== 'Behöver granskas') return;
    if (t.osaker === true || t.osaker === 'true') return;
    const dir = signedAmount(t) < 0 ? 'ut' : 'in';
    const g = groups.get(t.ekonomi + '|' + dir + '|' + merchantKey(t.origText || t.beskrivning));
    if (!g) return;
    const sg = suggest(t.ekonomi, signedAmount(t), t.origText || t.beskrivning);
    if (sg.kategori === t.kategori && sg.typ === t.typ && Number(sg.sakerhet) === Number(t.sakerhet)) return;
    updates.push(Object.assign(strip(t), { typ: sg.typ, kategori: sg.kategori, sakerhet: sg.sakerhet, regel: sg.regel, baskonto: sg.baskonto, foreslagenMomssats: sg.foreslagenMomssats, granskning: sg.sakerhet >= 50 && !t.dublettAv ? 'Föreslagen' : 'Behöver granskas' }));
  });
  if (updates.length) await queueMany('Transaktioner', updates, { quiet: true });
  return updates.length;
}

/* =====================================================================
   BANKIMPORT – CSV och Excel läses direkt på enheten
   ===================================================================== */
/* Inbyggd Excel-läsare (.xlsx) – använder webbläsarens egen uppackning,
   inga externa tjänster eller bibliotek. Fungerar även offline. */
async function unzipEntries(buf) {
  const dv = new DataView(buf), u8 = new Uint8Array(buf);
  let eocd = -1;
  for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 70000); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('Filen är inte en giltig Excel-fil (.xlsx). Spara den som .xlsx eller CSV.');
  const n = dv.getUint16(eocd + 10, true); let p = dv.getUint32(eocd + 16, true);
  const dec = new TextDecoder(), files = {};
  for (let k = 0; k < n; k++) {
    const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true);
    const nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), off = dv.getUint32(p + 42, true);
    const name = dec.decode(u8.subarray(p + 46, p + 46 + nl));
    files[name] = { method, csize, off };
    p += 46 + nl + xl + cl;
  }
  return async name => {
    const f = files[name]; if (!f) return null;
    const lnl = dv.getUint16(f.off + 26, true), lxl = dv.getUint16(f.off + 28, true);
    const data = u8.subarray(f.off + 30 + lnl + lxl, f.off + 30 + lnl + lxl + f.csize);
    if (f.method === 0) return dec.decode(data);
    if (typeof DecompressionStream === 'undefined') throw new Error('Webbläsaren kan inte läsa Excel-filer. Spara filen som CSV i banken i stället.');
    const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return dec.decode(await new Response(stream).arrayBuffer());
  };
}

async function readXlsx(buf) {
  const get = await unzipEntries(buf);
  const xml = s => new DOMParser().parseFromString(s, 'application/xml');
  const wb = xml(await get('xl/workbook.xml') || '');
  const firstSheet = wb.getElementsByTagName('sheet')[0];
  let path = 'xl/worksheets/sheet1.xml';
  if (firstSheet) {
    const rid = firstSheet.getAttribute('r:id') || firstSheet.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
    const rels = xml(await get('xl/_rels/workbook.xml.rels') || '<r/>');
    const rel = [...rels.getElementsByTagName('Relationship')].find(r => r.getAttribute('Id') === rid);
    if (rel) { const t = rel.getAttribute('Target'); path = t.startsWith('/') ? t.slice(1) : 'xl/' + t.replace(/^\.\//, ''); }
  }
  const ssText = await get('xl/sharedStrings.xml');
  const shared = ssText ? [...xml(ssText).getElementsByTagName('si')].map(si => [...si.getElementsByTagName('t')].map(t => t.textContent).join('')) : [];
  // Vilka cellformat är datum?
  const stText = await get('xl/styles.xml');
  const dateStyles = new Set();
  if (stText) {
    const st = xml(stText), custom = {};
    [...st.getElementsByTagName('numFmt')].forEach(f => { custom[f.getAttribute('numFmtId')] = f.getAttribute('formatCode') || ''; });
    const xfs = st.getElementsByTagName('cellXfs')[0];
    if (xfs) [...xfs.getElementsByTagName('xf')].forEach((xf, i) => {
      const id = Number(xf.getAttribute('numFmtId'));
      if ((id >= 14 && id <= 22) || (id >= 45 && id <= 47) || /[yd]/i.test((custom[id] || '').replace(/"[^"]*"|\[[^\]]*\]/g, ''))) dateStyles.add(i);
    });
  }
  const sheetText = await get(path);
  if (!sheetText) throw new Error('Hittade inget kalkylblad i filen.');
  const rows = [];
  const colIdx = ref => { const m = /^([A-Z]+)/.exec(ref || ''); let n = 0; if (m) for (const ch of m[1]) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; };
  [...xml(sheetText).getElementsByTagName('row')].forEach(r => {
    const ri = Number(r.getAttribute('r')) - 1, row = [];
    let next = 0;
    [...r.getElementsByTagName('c')].forEach(c => {
      const j = c.getAttribute('r') ? colIdx(c.getAttribute('r')) : next; next = j + 1;
      const t = c.getAttribute('t'), v = c.getElementsByTagName('v')[0], vt = v ? v.textContent : '';
      let val = '';
      if (t === 's') val = shared[Number(vt)] || '';
      else if (t === 'inlineStr') val = [...c.getElementsByTagName('t')].map(x => x.textContent).join('');
      else if (t === 'str' || t === 'b' || t === 'e') val = vt;
      else if (vt !== '') { const num = Number(vt); val = dateStyles.has(Number(c.getAttribute('s'))) && num > 1 ? new Date(Math.round((num - 25569) * 864e5)) : num; }
      row[j] = val;
    });
    for (let j = 0; j < row.length; j++) if (row[j] === undefined) row[j] = '';
    rows[ri >= 0 ? ri : rows.length] = row;
  });
  return rows.filter(Boolean);
}

async function readBankFile(file) {
  const buf = await file.arrayBuffer();
  if (/\.xls$/i.test(file.name)) throw new Error('Gamla .xls-filer stöds inte. Välj Excel (.xlsx) eller CSV när du exporterar från banken.');
  if (/\.xlsx$/i.test(file.name) || /spreadsheetml/.test(file.type)) return readXlsx(buf);
  let text;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch (e) { text = new TextDecoder('windows-1252').decode(buf); }
  return parseCSV(text.replace(/^\ufeff/, ''));
}

function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim()).slice(0, 15);
  const delims = [';', ',', '\t', '|'];
  const count = (l, d) => { let n = 0, q = false; for (const c of l) { if (c === '"') q = !q; else if (c === d && !q) n++; } return n; };
  let best = ';', bestScore = -1;
  delims.forEach(d => { const c = lines.map(l => count(l, d)); const max = Math.max(...c); const score = max ? c.filter(x => x === max).length * 10 + max : 0; if (score > bestScore) { bestScore = score; best = d; } });
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
    else if (c === '"') q = true;
    else if (c === best) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); if (row.some(x => x.trim() !== '')) rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  row.push(cell); if (row.some(x => x.trim() !== '')) rows.push(row);
  return rows;
}

function parseDateCell(v) {
  if (v instanceof Date && !isNaN(v)) return v.getUTCFullYear() + '-' + pad(v.getUTCMonth() + 1) + '-' + pad(v.getUTCDate());
  if (typeof v === 'number' && v > 20000 && v < 80000) { const d = new Date(Math.round((v - 25569) * 864e5)); return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()); }
  const s = String(v == null ? '' : v).trim();
  let m = s.match(/^(\d{4})[-./]?(\d{2})[-./]?(\d{2})(?:\D|$)/);
  let y, mo, d;
  if (m) { y = +m[1]; mo = +m[2]; d = +m[3]; }
  else if ((m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4}|\d{2})(?:\D|$)/))) { d = +m[1]; mo = +m[2]; y = +m[3]; if (y < 100) y += 2000; }
  else return '';
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || y < 1990 || y > 2100) return '';
  return y + '-' + pad(mo) + '-' + pad(d);
}

function parseNumCell(v) {
  if (typeof v === 'number') return v;
  let s = String(v == null ? '' : v).trim();
  if (!s) return NaN;
  const neg = /^\(.*\)$/.test(s);
  s = s.replace(/[()\s ]|kr|sek/gi, '').replace(/[−–]/g, '-');
  if (s.includes(',') && s.includes('.')) s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  else if (s.includes(',')) s = s.replace(',', '.');
  else if ((s.match(/\./g) || []).length > 1) s = s.replace(/\.(?=.*\.)/g, '');
  if (!/^[-+]?\d*\.?\d+$/.test(s)) return NaN;
  const n = Number(s);
  return neg ? -Math.abs(n) : n;
}

const HDR = {
  datum: /transaktionsdag|transaktionsdatum|bokföringsdag|bokforingsdag|bokföringsdatum|bokf|datum|date|valutadag|reskontra/,
  text: /^text$|beskrivning|specifikation|meddelande|mottagare|rubrik|referens|transaktion$|description|motpart|namn/,
  belopp: /belopp|amount|summa/,
  in: /insättning|insattning|kredit|credit|inbetalning/,
  ut: /uttag|debet|debit|utbetalning/,
  saldo: /saldo|balance|behållning|behallning/
};
const DATE_PRIO = [/transaktionsdag|transaktionsdatum/, /bokföringsdag|bokforingsdag|bokföringsdatum|bokf/, /^datum$|date/, /valutadag/, /reskontra/];

function detectMapping(rows) {
  let best = { score: 0, i: -1 };
  for (let i = 0; i < Math.min(25, rows.length); i++) {
    const cells = rows[i].map(c => String(c).toLowerCase().trim());
    const has = k => cells.some(c => c && c.length < 40 && HDR[k].test(c));
    const score = (has('datum') ? 2 : 0) + (has('belopp') || has('in') || has('ut') ? 2 : 0) + (has('text') ? 1 : 0) + (has('saldo') ? 0.5 : 0);
    if (score > best.score) best = { score, i };
  }
  const map = { headerRow: -1, datum: -1, text: -1, belopp: -1, in: -1, ut: -1 };
  if (best.score >= 4) {
    const cells = rows[best.i].map(c => String(c).toLowerCase().trim());
    map.headerRow = best.i;
    for (const re of DATE_PRIO) { const j = cells.findIndex(c => re.test(c)); if (j >= 0) { map.datum = j; break; } }
    map.belopp = cells.findIndex(c => HDR.belopp.test(c) && !HDR.saldo.test(c));
    if (map.belopp < 0) { map.in = cells.findIndex(c => HDR.in.test(c)); map.ut = cells.findIndex(c => HDR.ut.test(c)); }
    const used = new Set([map.datum, map.belopp, map.in, map.ut]);
    map.text = cells.findIndex((c, j) => !used.has(j) && HDR.text.test(c) && !HDR.saldo.test(c));
    if (map.text < 0) map.text = cells.findIndex((c, j) => !used.has(j) && !HDR.saldo.test(c) && !HDR.datum.test(c) && c);
    return map;
  }
  // Ingen rubrikrad – gissa utifrån innehållet
  const sample = rows.slice(0, 40), cols = Math.max(...sample.map(r => r.length));
  const score = j => {
    let dates = 0, nums = 0, len = 0, neg = 0;
    sample.forEach(r => { const v = r[j]; if (parseDateCell(v)) dates++; const n = parseNumCell(v); if (!isNaN(n)) { nums++; if (n < 0) neg++; } len += String(v == null ? '' : v).length; });
    return { dates, nums, len, neg };
  };
  const sc = [...Array(cols)].map((_, j) => score(j));
  map.datum = sc.reduce((b, s, j) => s.dates > (sc[b] ? sc[b].dates : -1) ? j : b, 0);
  const numCols = sc.map((s, j) => ({ s, j })).filter(x => x.j !== map.datum && x.s.nums > sample.length * 0.6);
  const withNeg = numCols.find(x => x.s.neg > 0) || numCols[0];
  if (withNeg) map.belopp = withNeg.j;
  map.text = sc.reduce((b, s, j) => j !== map.datum && j !== map.belopp && s.len > (b >= 0 ? sc[b].len : -1) ? j : b, -1);
  return map;
}

const signatureOf = (rows, map) => map.headerRow >= 0
  ? rows[map.headerRow].map(c => String(c).toLowerCase().trim()).join('|')
  : 'utan-rubrik-' + Math.max(...rows.slice(0, 10).map(r => r.length)) + '-kolumner';

function buildImport(imp) {
  const { rows, map, ekonomi, konto } = imp;
  const out = [], errors = [];
  const existing = new Set(S.tx.filter(t => t.dupKey).map(t => t.dupKey));
  const occ = new Map();
  const manual = S.tx.filter(t => t.kalla !== 'Import' && t.ekonomi === ekonomi);
  const usedManual = new Set();
  for (let i = map.headerRow + 1; i < rows.length; i++) {
    const r = rows[i] || [];
    if (!r.some(c => String(c).trim() !== '')) continue;
    const datum = parseDateCell(r[map.datum]);
    let amount = NaN;
    if (map.belopp >= 0) amount = parseNumCell(r[map.belopp]);
    else if (map.in >= 0 || map.ut >= 0) {
      const a = map.in >= 0 ? parseNumCell(r[map.in]) : NaN, b = map.ut >= 0 ? parseNumCell(r[map.ut]) : NaN;
      amount = (isNaN(a) ? 0 : Math.abs(a)) - (isNaN(b) ? 0 : Math.abs(b));
      if (isNaN(a) && isNaN(b)) amount = NaN;
    }
    const text = String(r[map.text] == null ? '' : r[map.text]).replace(/\s+/g, ' ').trim();
    if (!datum || isNaN(amount) || amount === 0) { errors.push(i + 1); continue; }
    amount = round2(amount);
    const base = [ekonomi, konto, datum, amount.toFixed(2), normText(text)].join('|');
    const n = (occ.get(base) || 0) + 1; occ.set(base, n);
    const dupKey = base + '#' + n;
    const exact = existing.has(dupKey);
    const near = manual.find(t => !usedManual.has(t.id) && Math.abs(Number(t.belopp) - Math.abs(amount)) < 0.01 && Math.abs(new Date(t.datum) - new Date(datum)) <= 3 * 864e5 && dirOf(t.typ) === (amount < 0 ? 'ut' : 'in'));
    if (near && !exact) usedManual.add(near.id);
    out.push({ rad: i + 1, datum, amount, text, raw: r, dupKey, exact, near: near ? near.id : '' });
  }
  return { rows: out, errors };
}

function makeImportRecords(imp, parsed) {
  const importId = uuid();
  return {
    importId,
    records: parsed.rows.filter(p => !p.exact || imp.includeDup).map(p => {
      const sg = suggest(imp.ekonomi, p.amount, p.text);
      const flagged = !!p.near || p.exact;
      return {
        id: uuid(), version: 0, ekonomi: imp.ekonomi, typ: sg.typ, datum: p.datum, belopp: Math.abs(p.amount),
        momssats: 0, moms: 0, kategori: sg.kategori, baskonto: sg.baskonto, konto: imp.konto,
        beskrivning: prettyText(p.text).slice(0, 300), motpart: '', kvittoId: '', kvittoNamn: '',
        kalla: 'Import', importId, dupKey: p.dupKey,
        origDatum: p.datum, origText: p.text, origBelopp: p.amount, origKonto: imp.konto,
        origRad: JSON.stringify(p.raw.map(c => c instanceof Date ? parseDateCell(c) : c)).slice(0, 800),
        granskning: sg.sakerhet >= 50 && !flagged ? 'Föreslagen' : 'Behöver granskas',
        sakerhet: sg.sakerhet, regel: sg.regel, foreslagenMomssats: sg.foreslagenMomssats,
        momsbedomning: imp.ekonomi === 'Företag' ? (momsReg(p.datum) ? 'Okänd' : 'Momsbefriad') : '',
        dublettAv: p.exact ? 'samma banktransaktion redan importerad' : (p.near || ''), osaker: false, utredning: false, manuell: false, anteckning: ''
      };
    })
  };
}

/* ---------- Importguiden ---------- */
// Föreslår det konto du senast importerade till för den här ekonomin.
function defaultKonto(eko) {
  const last = (S.tables.Importer || []).filter(i => i.ekonomi === eko && S.konton.some(k => k.ekonomi === eko && k.namn === i.konto))
    .sort((a, b) => String(b.andrad || b.datum).localeCompare(String(a.andrad || a.datum)))[0];
  if (last) return last.konto;
  const first = S.konton.find(k => k.ekonomi === eko);
  return first ? first.namn : '__nytt';
}
function openImport(eko) {
  const e = eko || (S.view === 'privat' ? 'Privatekonomi' : 'Företag');
  S.imp = { step: 1, ekonomi: e, konto: defaultKonto(e), nytt: '', includeDup: false };
  renderImport();
}

function renderImport() {
  const imp = S.imp;
  if (imp.step === 1) {
    const konton = S.konton.filter(k => k.ekonomi === imp.ekonomi);
    modal(`<div class="mhead"><h2>Importera bankfil</h2><button class="x" data-act="close" aria-label="Stäng">×</button></div>
    <ol class="steps"><li class="on">Välj fil</li><li>Förhandsgranska</li><li>Klart</li></ol>
    <p class="hint lead">Exportera transaktionerna från internetbanken som <b>Excel</b> eller <b>CSV</b> – gärna ett helt år åt gången. Leta efter <i>Exportera</i> eller <i>Ladda ner</i> i kontoöversikten.</p>
    <div class="seg">${['Privatekonomi', 'Företag'].map(e => `<button type="button" class="${imp.ekonomi === e ? 'on' : ''}" data-act="imp-eko" data-v="${e}">${e}</button>`).join('')}</div>
    <label class="fld"><span>Vilket bankkonto gäller filen?</span><select id="i-konto">${konton.map(k => `<option ${k.namn === imp.konto ? 'selected' : ''}>${esc(k.namn)}</option>`).join('')}<option value="__nytt" ${!konton.length || imp.konto === '__nytt' ? 'selected' : ''}>+ Nytt konto…</option></select></label>
    <label class="fld" id="i-nytt-wrap" ${konton.length && imp.konto !== '__nytt' ? 'hidden' : ''}><span>Namn på det nya kontot</span><input id="i-nytt" value="${esc(imp.nytt)}" placeholder="${imp.ekonomi === 'Företag' ? 'T.ex. Företagskonto' : 'T.ex. Lönekonto'}"></label>
    <label class="btn primary filebtn big">${icon('upload')} Välj bankfil (Excel eller CSV)<input type="file" id="i-fil" accept=".csv,.txt,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden></label>
    <p class="hint">Filen läses här på din enhet. Inget skickas någonstans förrän du bekräftar.</p>`);
    return;
  }
  if (imp.step === 2) {
    const p = imp.parsed, map = imp.map, rows = imp.rows;
    const ncol = Math.max(...rows.slice(0, 30).map(r => r.length));
    const hdr = map.headerRow >= 0 ? rows[map.headerRow] : [];
    const colName = j => (hdr[j] !== undefined && String(hdr[j]).trim()) ? String(hdr[j]).trim() : 'Kolumn ' + (j + 1);
    const sel = (id, val, allowNone) => `<select id="${id}">${allowNone ? `<option value="-1" ${val < 0 ? 'selected' : ''}>– ingen –</option>` : ''}${[...Array(ncol)].map((_, j) => `<option value="${j}" ${val === j ? 'selected' : ''}>${esc(colName(j))}</option>`).join('')}</select>`;
    const ok = p.rows.filter(r => !r.exact), dups = p.rows.filter(r => r.exact), near = p.rows.filter(r => r.near && !r.exact);
    const n = ok.length + (imp.includeDup ? dups.length : 0);
    const dates = p.rows.map(r => r.datum).sort();
    const sumIn = ok.filter(r => r.amount > 0).reduce((s, r) => s + r.amount, 0), sumUt = ok.filter(r => r.amount < 0).reduce((s, r) => s + r.amount, 0);
    const prev = p.rows.slice(0, 8).map(r => { const sg = suggest(imp.ekonomi, r.amount, r.text); return `<tr class="${r.exact ? 'dim' : ''}"><td>${r.datum}</td><td>${esc(prettyText(r.text))}</td><td class="amt ${r.amount < 0 ? 'neg' : 'pos'}">${kr(r.amount)}</td><td>${esc(sg.kategori)} <span class="conf c${sg.sakerhet >= 80 ? 3 : sg.sakerhet >= 50 ? 2 : 1}">${sg.sakerhet} %</span>${r.exact ? ' <span class="tag warn">dublett</span>' : ''}</td></tr>`; }).join('');
    modal(`<div class="mhead"><h2>Förhandsgranska</h2><button class="x" data-act="close" aria-label="Stäng">×</button></div>
    <ol class="steps"><li class="done">Välj fil</li><li class="on">Förhandsgranska</li><li>Klart</li></ol>
    <div class="impsum"><div><b>${p.rows.length}</b><small>transaktioner i filen</small></div><div><b>${dates.length ? monthShort(dates[0].slice(0, 7)) + ' ' + dates[0].slice(2, 4) + ' – ' + monthShort(dates[dates.length - 1].slice(0, 7)) + ' ' + dates[dates.length - 1].slice(2, 4) : '–'}</b><small>period</small></div><div><b class="pos">${kr(sumIn)}</b><small>in</small></div><div><b class="neg">${kr(sumUt)}</b><small>ut</small></div></div>
    <label class="fld inline"><span>Bankkonto</span><select id="i-konto2">${[...new Set(S.konton.filter(k => k.ekonomi === imp.ekonomi).map(k => k.namn).concat([imp.konto]))].map(k => `<option ${k === imp.konto ? 'selected' : ''}>${esc(k)}</option>`).join('')}</select></label>
    ${imp.savedFormat ? `<p class="okline">✓ Känt filformat: <b>${esc(imp.savedFormat)}</b> – kolumnerna är redan inställda.</p>` : '<p class="hint">Kontrollera att kolumnerna stämmer. Appen kommer ihåg valet till nästa gång.</p>'}
    <details ${imp.savedFormat ? '' : 'open'} class="mapbox"><summary>Kolumner</summary>
      <div class="row2"><label class="fld"><span>Datum</span>${sel('m-datum', map.datum)}</label><label class="fld"><span>Beskrivning</span>${sel('m-text', map.text)}</label></div>
      <div class="row2"><label class="fld"><span>Belopp (+/−)</span>${sel('m-belopp', map.belopp, true)}</label><label class="fld"><span>Rubrikrad</span><select id="m-hdr"><option value="-1" ${map.headerRow < 0 ? 'selected' : ''}>Ingen rubrikrad</option>${rows.slice(0, 25).map((r, i) => `<option value="${i}" ${map.headerRow === i ? 'selected' : ''}>Rad ${i + 1}: ${esc(r.slice(0, 4).join(' | ').slice(0, 50))}</option>`).join('')}</select></label></div>
      <div class="row2"><label class="fld"><span>…eller Insättning</span>${sel('m-in', map.in, true)}</label><label class="fld"><span>…och Uttag</span>${sel('m-ut', map.ut, true)}</label></div>
    </details>
    <div class="tablewrap"><table class="tbl"><thead><tr><th>Datum</th><th>Beskrivning</th><th>Belopp</th><th>Förslag</th></tr></thead><tbody>${prev || '<tr><td colspan="4">Inga rader kunde läsas – kontrollera kolumnerna.</td></tr>'}</tbody></table></div>
    ${dups.length ? `<div class="note warn"><b>${dups.length} transaktioner finns redan</b> (samma konto, datum, belopp och text) och hoppas över. <label class="chk"><input type="checkbox" id="i-dup" ${imp.includeDup ? 'checked' : ''}> Importera ändå och markera som dubbletter</label></div>` : ''}
    ${near.length ? `<div class="note"><b>${near.length} kan motsvara poster du redan registrerat för hand.</b> De importeras och markeras för granskning.</div>` : ''}
    ${p.errors.length ? `<div class="note"><b>${p.errors.length} rader kunde inte läsas</b> (saknar datum eller belopp, t.ex. summeringsrader) och hoppas över.</div>` : ''}
    <div class="mfoot"><button class="btn ghost" data-act="imp-back">Tillbaka</button><button class="btn primary" data-act="imp-go" ${n ? '' : 'disabled'}>Importera ${n} transaktioner</button></div>`);
    return;
  }
  if (imp.step === 3) {
    modal(`<div class="mhead"><h2>Klart!</h2><button class="x" data-act="close" aria-label="Stäng">×</button></div>
    <ol class="steps"><li class="done">Välj fil</li><li class="done">Förhandsgranska</li><li class="on">Klart</li></ol>
    <div class="impsum"><div><b>${imp.result.antal}</b><small>importerade</small></div><div><b>${imp.result.foreslagna}</b><small>med säkert förslag</small></div><div><b>${imp.result.granska}</b><small>behöver granskas</small></div></div>
    <p class="hint lead">Allt är sparat på enheten och synkas till Google i omgångar i bakgrunden. Nu kan du gå igenom förslagen – säkra förslag kan godkännas många åt gången.</p>
    <div class="mfoot"><button class="btn ghost" data-act="imp-again">Importera en till fil</button><button class="btn primary" data-act="imp-review">Granska transaktioner</button></div>`);
  }
}

async function onImportFile(input) {
  const file = input.files && input.files[0]; if (!file) return;
  const imp = S.imp;
  const kontoSel = $('#i-konto').value;
  imp.konto = kontoSel === '__nytt' ? ($('#i-nytt').value || '').trim() : kontoSel;
  if (!imp.konto) { input.value = ''; return toast('Ange vilket bankkonto filen gäller.', 'err'); }
  if (/\d{8,}/.test(imp.konto.replace(/[\s-]/g, ''))) { input.value = ''; return toast('Skriv inte kontonummer i namnet.', 'err'); }
  imp.nyttKonto = kontoSel === '__nytt';
  try {
    toast('Läser filen…');
    imp.rows = await readBankFile(file);
    imp.fileName = file.name;
    if (!imp.rows.length) throw new Error('Filen verkar vara tom.');
    let map = detectMapping(imp.rows);
    const sig = signatureOf(imp.rows, map);
    const saved = (S.tables.Importformat || []).find(f => f.signatur === sig);
    if (saved) { try { map = JSON.parse(saved.mappning); imp.savedFormat = saved.namn || 'sparat format'; } catch (e) { /* använd identifierat */ } }
    imp.map = map; imp.sig = sig; imp.formatRec = saved || null;
    imp.parsed = buildImport(imp);
    imp.step = 2;
    renderImport();
  } catch (e) { toast(e.message || 'Kunde inte läsa filen.', 'err'); input.value = ''; }
}

function onMappingChange() {
  const imp = S.imp, v = id => Number($(id).value);
  imp.map = { headerRow: v('#m-hdr'), datum: v('#m-datum'), text: v('#m-text'), belopp: v('#m-belopp'), in: v('#m-in'), ut: v('#m-ut') };
  imp.savedFormat = '';
  imp.parsed = buildImport(imp);
  renderImport();
}

async function doImport() {
  const imp = S.imp;
  const btn = $('[data-act="imp-go"]'); if (btn) { btn.disabled = true; btn.textContent = 'Sparar…'; }
  try {
    if (imp.nyttKonto && !S.konton.some(k => k.ekonomi === imp.ekonomi && k.namn === imp.konto)) {
      await queueMany('Konton', [{ id: uuid(), version: 0, ekonomi: imp.ekonomi, namn: imp.konto, typ: KONTO_TYPER[imp.ekonomi][imp.ekonomi === 'Företag' ? 0 : 0], saldo: 0, saldodatum: '' }], { quiet: true });
    }
    const { importId, records } = makeImportRecords(imp, imp.parsed);
    for (let i = 0; i < records.length; i += 500) await queueMany('Transaktioner', records.slice(i, i + 500), { quiet: true });
    const fmt = imp.formatRec ? Object.assign(strip(imp.formatRec), { mappning: JSON.stringify(imp.map), senast: today(), antal: (Number(imp.formatRec.antal) || 0) + 1 })
      : { id: uuid(), version: 0, signatur: imp.sig, namn: (imp.konto + ' (' + imp.fileName.replace(/\.[^.]+$/, '') + ')').slice(0, 80), mappning: JSON.stringify(imp.map), senast: today(), antal: 1 };
    await queueMany('Importformat', [fmt], { quiet: true });
    const dates = records.map(r => r.datum).sort();
    await queueMany('Importer', [{ id: importId, version: 0, fil: imp.fileName, ekonomi: imp.ekonomi, konto: imp.konto, antal: records.length, fran: dates[0] || '', till: dates[dates.length - 1] || '', datum: today(), dubbletterHoppadesOver: imp.includeDup ? 0 : imp.parsed.rows.filter(r => r.exact).length }], { quiet: true });
    imp.result = { antal: records.length, foreslagna: records.filter(r => r.granskning === 'Föreslagen').length, granska: records.filter(r => r.granskning !== 'Föreslagen').length };
    imp.step = 3;
    renderImport();
    render();
    sync();
  } catch (e) { toast('Importen misslyckades: ' + e.message, 'err'); if (btn) { btn.disabled = false; btn.textContent = 'Försök igen'; } }
}

/* =====================================================================
   VY: GRANSKA TRANSAKTIONER
   ===================================================================== */
const G = { eko: 'Alla', status: 'Att granska', ar: 'Alla', manad: 'Alla', konto: 'Alla', q: '', sort: 'datum-desc', sel: new Set(), limit: 100 };

function granskaLista() {
  const q = G.q.trim().toLowerCase();
  let list = S.tx.filter(t => {
    if (G.eko !== 'Alla' && t.ekonomi !== G.eko) return false;
    if (G.ar !== 'Alla' && String(t.datum).slice(0, 4) !== G.ar) return false;
    if (G.manad !== 'Alla' && String(t.datum).slice(5, 7) !== G.manad) return false;
    if (G.konto !== 'Alla' && t.konto !== G.konto) return false;
    const st = statusOf(t), utr = sant(t.utredning);
    switch (G.status) {
      case 'Att granska': if (utr || (st !== 'Föreslagen' && st !== 'Behöver granskas')) return false; break;
      case 'Utredning': if (!utr) return false; break;
      case 'Osäkra': if (!sant(t.osaker) && !(Number(t.sakerhet) < 50 && t.kalla === 'Import' && st !== 'Godkänd')) return false; break;
      case 'Möjliga dubbletter': if (!t.dublettAv || st === 'Godkänd') return false; break;
      case 'Alla': break;
      default: if (st !== G.status || utr) return false;
    }
    if (q && ![t.beskrivning, t.origText, t.motpart, t.kategori, t.anteckning, t.konto, String(t.belopp)].some(x => String(x || '').toLowerCase().includes(q))) return false;
    return true;
  });
  const [f, dir] = G.sort.split('-');
  const k = { datum: t => String(t.datum), belopp: t => Number(t.belopp), sakerhet: t => Number(t.sakerhet || 100) }[f];
  list.sort((a, b) => { const x = k(a), y = k(b); return (x < y ? -1 : x > y ? 1 : 0) * (dir === 'desc' ? -1 : 1); });
  return list;
}

function catOptions(t) {
  return TYPER(t.ekonomi).map(typ => `<optgroup label="${esc(typ)}">${kats(t.ekonomi, typ).map(k => `<option value="${esc(typ + '|' + k.n)}" ${t.typ === typ && t.kategori === k.n ? 'selected' : ''}>${esc(k.n)}</option>`).join('')}</optgroup>`).join('');
}

function momsShort(t) {
  if (t.ekonomi !== 'Företag' || (t.typ !== 'Utgift' && t.typ !== 'Inkomst')) return '–';
  if (t.momsbedomning === 'Momsbefriad' || (!t.momsbedomning && !momsReg(t.datum))) return 'Befriad';
  if (t.momsbedomning === 'Avdragsgill') return (t.momssats || 0) + ' %';
  return t.momsbedomning || ((t.momssats || 0) + ' %');
}

function vGranska() {
  const base = S.tx.filter(t => (G.eko === 'Alla' || t.ekonomi === G.eko) && (G.ar === 'Alla' || String(t.datum).slice(0, 4) === G.ar));
  const imported = base.filter(t => t.kalla === 'Import');
  const cnt = { 'Föreslagen': 0, 'Behöver granskas': 0, 'Saknar underlag': 0, 'Godkänd': 0 };
  let utr = 0;
  base.forEach(t => { if (sant(t.utredning)) utr++; else cnt[statusOf(t)]++; });
  const klara = imported.filter(t => statusOf(t) === 'Godkänd' || statusOf(t) === 'Saknar underlag').length;
  const years = [...new Set(S.tx.map(t => String(t.datum).slice(0, 4)))].sort().reverse();
  const kontonL = [...new Set(S.tx.map(t => t.konto).filter(Boolean))].sort();
  const list = granskaLista();
  const shown = list.slice(0, G.limit);
  for (const id of [...G.sel]) if (!list.some(t => t.id === id)) G.sel.delete(id);
  const chip = (st, n, cls) => `<button class="schip ${cls} ${G.status === st ? 'on' : ''}" data-act="g-status" data-v="${st}"><b>${n}</b>${st}</button>`;
  const rows = shown.map(t => {
    const amt = signedAmount(t), st = sant(t.utredning) ? 'Utredning' : statusOf(t);
    const conf = t.kalla === 'Import' ? Number(t.sakerhet) : null;
    return `<div class="grow ${G.sel.has(t.id) ? 'sel' : ''}" data-id="${esc(t.id)}">
      <label class="gc-chk"><input type="checkbox" data-gsel="${esc(t.id)}" ${G.sel.has(t.id) ? 'checked' : ''} aria-label="Markera"></label>
      <div class="gc-d">${esc(t.datum)}</div>
      <button class="gc-t" data-act="edit-tx" data-v="${esc(t.id)}"><b>${esc(t.beskrivning || t.origText || t.kategori)}</b><small><span class="mdate">${esc(t.datum)} · </span>${esc(t.ekonomi === 'Företag' ? 'Företag' : 'Privat')}${t.konto ? ' · ' + esc(t.konto) : ''}${t.anteckning ? ' · 📝 ' + esc(String(t.anteckning).slice(0, 40)) : ''}${t.dublettAv ? ' · <span class="tag warn">möjlig dublett</span>' : ''}${sant(t.osaker) ? ' · <span class="tag warn">osäker</span>' : ''}</small></button>
      <div class="gc-b ${amt < 0 ? 'neg' : 'pos'}">${amt < 0 ? '−' : '+'}${kr(Math.abs(amt))}</div>
      <div class="gc-k"><select data-gcat="${esc(t.id)}" aria-label="Kategori">${catOptions(t)}</select><small>${t.ekonomi === 'Företag' && t.baskonto ? 'BAS ' + esc(t.baskonto) + ' · ' : ''}Moms: ${esc(momsShort(t))}</small></div>
      <div class="gc-c">${conf !== null && !isNaN(conf) ? `<span class="conf c${conf >= 80 ? 3 : conf >= 50 ? 2 : 1}" title="${esc(t.regel || '')}">${conf} %</span>` : '<span class="conf c0">egen</span>'}</div>
      <div class="gc-u">${harUnderlag(t) ? `<span class="doc yes" title="Underlag finns">${icon('kvitto', 'tiny')}</span>` : (t.ekonomi === 'Företag' && t.typ === 'Utgift' ? '<span class="doc no" title="Saknar underlag">!</span>' : '')}</div>
      <div class="gc-s"><span class="spill ${STATUS_CLS[st] || 'st-u'}">${esc(st)}</span></div>
      <div class="gc-a">${st === 'Godkänd' || st === 'Saknar underlag' ? '' : `<button class="btn small primary" data-act="g-ok" data-v="${esc(t.id)}" title="Godkänn">✓</button>`}</div>
    </div>`;
  }).join('');
  const selN = G.sel.size;
  return head('Massimport och granskning', 'Granska transaktioner', `<div class="btnrow tight"><button class="btn primary" data-act="import">${icon('upload')} Importera bankfil</button></div>`) + `
  <section class="card gsum">
    <div class="gprog"><div><b>${klara}</b> av <b>${imported.length}</b> importerade transaktioner är granskade</div>${prog(imported.length ? klara / imported.length * 100 : 0)}</div>
    <div class="schips">${chip('Att granska', cnt['Föreslagen'] + cnt['Behöver granskas'], 'st-a')}${chip('Föreslagen', cnt['Föreslagen'], 'st-f')}${chip('Behöver granskas', cnt['Behöver granskas'], 'st-b')}${chip('Saknar underlag', cnt['Saknar underlag'], 'st-s')}${chip('Godkänd', cnt['Godkänd'], 'st-g')}${chip('Utredning', utr, 'st-u')}</div>
  </section>
  <div class="filters card">
    <input id="g-q" type="search" placeholder="Sök text, belopp, kategori…" value="${esc(G.q)}">
    <select id="g-eko"><option>Alla</option>${['Privatekonomi', 'Företag'].map(e => `<option ${G.eko === e ? 'selected' : ''}>${e}</option>`).join('')}</select>
    <select id="g-ar"><option value="Alla">Alla år</option>${years.map(y => `<option ${G.ar === y ? 'selected' : ''}>${y}</option>`).join('')}</select>
    <select id="g-manad"><option value="Alla">Alla månader</option>${MONTHS.map((m, i) => `<option value="${pad(i + 1)}" ${G.manad === pad(i + 1) ? 'selected' : ''}>${m}</option>`).join('')}</select>
    <select id="g-konto"><option value="Alla">Alla konton</option>${kontonL.map(k => `<option ${G.konto === k ? 'selected' : ''}>${esc(k)}</option>`).join('')}</select>
    <select id="g-status">${['Att granska', 'Föreslagen', 'Behöver granskas', 'Saknar underlag', 'Godkänd', 'Utredning', 'Osäkra', 'Möjliga dubbletter', 'Alla'].map(s => `<option ${G.status === s ? 'selected' : ''}>${s}</option>`).join('')}</select>
    <select id="g-sort">${[['datum-desc', 'Nyast först'], ['datum-asc', 'Äldst först'], ['belopp-desc', 'Störst belopp'], ['sakerhet-asc', 'Lägst säkerhet']].map(([v, l]) => `<option value="${v}" ${G.sort === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
  </div>
  <section class="card glist">
    <div class="ghead"><label class="gc-chk"><input type="checkbox" id="g-all" ${shown.length && shown.every(t => G.sel.has(t.id)) ? 'checked' : ''} aria-label="Markera alla"></label><div class="gc-d">Datum</div><div class="gc-t">Beskrivning</div><div class="gc-b">Belopp</div><div class="gc-k">Kategori</div><div class="gc-c">Säkerhet</div><div class="gc-u">Underlag</div><div class="gc-s">Status</div><div class="gc-a"></div></div>
    ${rows || `<p class="empty">${S.tx.length ? 'Inga transaktioner matchar filtret.' : 'Inga transaktioner ännu. Börja med att importera en bankfil.'}</p>`}
    ${list.length > G.limit ? `<div class="btnrow"><button class="btn ghost block" data-act="g-more">Visa fler (${list.length - G.limit} till)</button></div>` : ''}
  </section>
  <div class="bulkbar ${selN ? 'show' : ''}">
    <b>${selN} markerade</b>
    <button class="btn small primary" data-act="g-bulk-ok">✓ Godkänn</button>
    <select id="g-bulk-cat"><option value="">Ändra kategori…</option>${(() => { const ekos = new Set([...G.sel].map(id => (S.tx.find(t => t.id === id) || {}).ekonomi)); return ekos.size === 1 ? catOptions({ ekonomi: [...ekos][0] }) : '<option disabled>Markera bara en ekonomi åt gången</option>'; })()}</select>
    <button class="btn small ghost" data-act="g-bulk-osaker">Markera osäker</button>
    <button class="btn small ghost" data-act="g-bulk-utr">Utredning</button>
    <button class="btn small ghost" data-act="g-bulk-none">Avmarkera</button>
  </div>`;
}

// Godkänner – men aldrig osäkra förslag i klump.
async function approve(ids, bulk) {
  const ok = [], skipped = [];
  ids.forEach(id => {
    const t = S.tx.find(x => x.id === id); if (!t) return;
    const unsafe = sant(t.osaker) || !!t.dublettAv || (t.kalla === 'Import' && Number(t.sakerhet) < 50 && !sant(t.manuell));
    if (bulk && unsafe) { skipped.push(t); return; }
    ok.push(Object.assign(strip(t), { granskning: 'Godkänd', godkand: new Date().toISOString(), osaker: false, utredning: false }));
  });
  if (ok.length) await queueMany('Transaktioner', ok, { quiet: true });
  const similar = ok.length ? await learn(ok) : 0;
  ids.forEach(id => G.sel.delete(id));
  await afterLocalChange();
  let msg = ok.length ? `${ok.length} godkända` : 'Inget godkändes';
  if (similar) msg += ` · ${similar} liknande fick uppdaterat förslag`;
  if (skipped.length) msg += ` · ${skipped.length} osäkra hoppades över – granska dem en och en`;
  toast(msg, skipped.length && !ok.length ? 'err' : '');
}

async function setCategory(ids, val) {
  const [typ, kategori] = val.split('|');
  const upd = [];
  ids.forEach(id => {
    const t = S.tx.find(x => x.id === id); if (!t) return;
    const k = katInfo(t.ekonomi, typ, kategori);
    if (!k) return;
    upd.push(Object.assign(strip(t), { typ, kategori, manuell: true, sakerhet: 100, regel: 'Vald av dig',
      baskonto: t.ekonomi === 'Företag' ? (k.bas || '') : '', foreslagenMomssats: t.ekonomi === 'Företag' ? (k.moms ?? '') : '',
      granskning: statusOf(t) === 'Godkänd' || statusOf(t) === 'Saknar underlag' ? t.granskning : 'Föreslagen' }));
  });
  if (upd.length) await queueMany('Transaktioner', upd);
  toast(upd.length > 1 ? `Kategori ändrad på ${upd.length}` : 'Kategori ändrad – godkänn när du är nöjd');
}

async function flagMany(ids, field) {
  const upd = ids.map(id => S.tx.find(x => x.id === id)).filter(Boolean).map(t => {
    const o = strip(t);
    if (field === 'osaker') { o.osaker = true; o.granskning = statusOf(t) === 'Godkänd' ? t.granskning : 'Behöver granskas'; }
    else o.utredning = !sant(t.utredning);
    return o;
  });
  G.sel.clear();
  await queueMany('Transaktioner', upd);
  toast(field === 'osaker' ? `${upd.length} markerade som osäkra` : `${upd.length} flyttade till/från utredning`);
}

/* =====================================================================
   EGNA KATEGORIER OCH MOMSSTATUS (Inställningar)
   ===================================================================== */
const KG = { eko: 'Företag', typ: 'Inkomst' };
function kategoriHtml() {
  const list = kats(KG.eko, KG.typ);
  const egna = (S.tables.Kategorier || []).filter(k => k.ekonomi === KG.eko && k.typ === KG.typ);
  const dolda = (KAT[KG.eko][KG.typ] || []).filter(k => egna.some(e => e.namn === k.n && sant(e.dold)));
  const firma = KG.eko === 'Företag';
  return `<div class="row2"><label class="fld"><span>Ekonomi</span><select id="kg-eko">${['Företag', 'Privatekonomi'].map(e => `<option ${KG.eko === e ? 'selected' : ''}>${e}</option>`).join('')}</select></label>
    <label class="fld"><span>Typ</span><select id="kg-typ">${TYPER(KG.eko).map(t => `<option ${KG.typ === t ? 'selected' : ''}>${t}</option>`).join('')}</select></label></div>
    <div class="katchips">${list.map(k => `<span class="kchip ${k.standard ? '' : 'own'}">${esc(k.n)}${firma && k.bas ? ` <small>${esc(k.bas)}</small>` : ''}<button data-act="${k.standard ? 'kg-hide' : 'kg-del'}" data-v="${esc(k.standard ? k.n : k.id)}" title="${k.standard ? 'Dölj' : 'Ta bort'}">×</button></span>`).join('')}</div>
    ${dolda.length ? `<p class="hint">Dolda standardkategorier: ${dolda.map(k => `<button class="linkbtn" data-act="kg-show" data-v="${esc(k.n)}">${esc(k.n)} (visa)</button>`).join(', ')}</p>` : ''}
    <div class="kgadd"><input id="kg-namn" placeholder="Ny kategori, t.ex. din tjänst">${firma ? `<input id="kg-bas" placeholder="BAS" inputmode="numeric" maxlength="6"><select id="kg-moms">${[25, 12, 6, 0].map(m => `<option value="${m}">${m} %</option>`).join('')}</select>` : `<label class="chk"><input type="checkbox" id="kg-fast"> Fast</label>`}<button class="btn primary small" data-act="kg-add">Lägg till</button></div>
    <p class="hint">Egna kategorier sparas i ditt privata kalkylark, inte i appens kod.</p>`;
}
async function kgAdd() {
  const namn = ($('#kg-namn').value || '').trim();
  if (!namn) return toast('Skriv ett namn.', 'err');
  if (kats(KG.eko, KG.typ).some(k => k.n.toLowerCase() === namn.toLowerCase())) return toast('Kategorin finns redan.', 'err');
  const firma = KG.eko === 'Företag';
  await queueMany('Kategorier', [{ id: uuid(), version: 0, ekonomi: KG.eko, typ: KG.typ, namn: namn.slice(0, 60),
    baskonto: firma ? ($('#kg-bas').value || (KG.typ === 'Inkomst' ? '3041' : '6991')).trim() : '', momssats: firma ? Number($('#kg-moms').value) : 0,
    fast: !firma && $('#kg-fast') ? $('#kg-fast').checked : false, dold: false }]);
  toast('Kategorin är tillagd ✓');
}
async function kgHide(namn, dold) {
  const ex = (S.tables.Kategorier || []).find(k => k.ekonomi === KG.eko && k.typ === KG.typ && k.namn === namn);
  await queueMany('Kategorier', [ex ? Object.assign(strip(ex), { dold }) : { id: uuid(), version: 0, ekonomi: KG.eko, typ: KG.typ, namn, dold }]);
}
function refreshKg() { const el = $('#kg-box'); if (el) el.innerHTML = kategoriHtml(); }

/* =====================================================================
   MODAL OCH TOAST
   ===================================================================== */
function modal(html) { $('#sheet').innerHTML = html; $('#modal').hidden = false; document.body.classList.add('noscroll'); }
function closeModal() { if (S.reloadAfterModal) return S.reloadAfterModal(); S.formFocused = false; $('#modal').hidden = true; $('#sheet').innerHTML = ''; S.form = null; S.imp = null; document.body.classList.remove('noscroll'); if (S.dirty) { S.dirty = false; render(); } }
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
  sync_pill: () => go('installningar'),
  import: v => openImport(v),
  'imp-eko': v => { S.imp.ekonomi = v; S.imp.konto = defaultKonto(v); renderImport(); },
  'imp-back': () => { S.imp.step = 1; renderImport(); },
  'imp-go': () => doImport(),
  'imp-again': () => openImport(S.imp.ekonomi),
  'imp-review': () => { closeModal(); G.status = 'Att granska'; go('granska'); },
  'g-status': v => { G.status = v; G.limit = 100; render(); },
  'g-ok': v => approve([v], false),
  'g-more': () => { G.limit += 200; render(); },
  'g-bulk-ok': () => approve([...G.sel], true),
  'g-bulk-osaker': () => flagMany([...G.sel], 'osaker'),
  'g-bulk-utr': () => flagMany([...G.sel], 'utredning'),
  'g-bulk-none': () => { G.sel.clear(); render(); },
  'f-approve': () => saveTx(true),
  'save-moms': () => { const v = $('#set-momsfran').value; queueSettings({ momsRegistreradFran: v }).then(() => toast(v ? 'Momsregistrerad från ' + v : 'Momsbefriad ✓')); },
  'kg-add': () => kgAdd().then(refreshKg),
  'kg-hide': v => kgHide(v, true).then(refreshKg),
  'kg-show': v => kgHide(v, false).then(refreshKg),
  'kg-del': async v => { const k = (S.tables.Kategorier || []).find(x => x.id === v); if (k && confirm('Ta bort kategorin "' + k.namn + '"? Transaktioner som redan har den behåller namnet.')) { await queueDelete('Kategorier', k); refreshKg(); } }
};

document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (el) { if (el.tagName !== 'INPUT') e.preventDefault(); const fn = ACTIONS[el.dataset.act]; if (fn) fn(el.dataset.v); return; }
  if (e.target.id === 'modal') closeModal();
  if (e.target.closest('.syncpill') && S.config && S.view !== 'installningar') go('installningar');
});
let qTimer;
document.addEventListener('input', e => {
  if (e.target.id === 'f-belopp') updateMomsInfo();
  if (e.target.id === 'g-q') { clearTimeout(qTimer); qTimer = setTimeout(() => { G.q = e.target.value; G.limit = 100; render(); const q = $('#g-q'); if (q) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); } }, 250); }
});
document.addEventListener('change', e => {
  if (e.target.id === 'f-moms') updateMomsInfo();
  if (e.target.id === 'f-kat' && S.form) { collectTx(); applyKat(S.form); renderTxForm(); }
  if (e.target.id === 'f-fil') onFile(e.target);
  const id = e.target.id;
  if (id === 'i-konto') { S.imp.konto = e.target.value; $('#i-nytt-wrap').hidden = e.target.value !== '__nytt'; }
  if (id === 'i-fil') onImportFile(e.target);
  if (id === 'i-konto2') { S.imp.konto = e.target.value; S.imp.nyttKonto = !S.konton.some(k => k.ekonomi === S.imp.ekonomi && k.namn === e.target.value); S.imp.parsed = buildImport(S.imp); renderImport(); }
  if (/^m-/.test(id)) onMappingChange();
  if (id === 'i-dup') { S.imp.includeDup = e.target.checked; renderImport(); }
  const gmap = { 'g-eko': 'eko', 'g-ar': 'ar', 'g-manad': 'manad', 'g-konto': 'konto', 'g-status': 'status', 'g-sort': 'sort' };
  if (gmap[id]) { G[gmap[id]] = e.target.value; G.limit = 100; render(); }
  if (e.target.dataset.gsel) { e.target.checked ? G.sel.add(e.target.dataset.gsel) : G.sel.delete(e.target.dataset.gsel); render(); }
  if (id === 'g-all') { granskaLista().slice(0, G.limit).forEach(t => e.target.checked ? G.sel.add(t.id) : G.sel.delete(t.id)); render(); }
  if (e.target.dataset.gcat) setCategory([e.target.dataset.gcat], e.target.value);
  if (id === 'g-bulk-cat' && e.target.value) { const ids = [...G.sel]; G.sel.clear(); setCategory(ids, e.target.value); }
  if (id === 'kg-eko') { KG.eko = e.target.value; KG.typ = TYPER(KG.eko)[0]; refreshKg(); }
  if (id === 'kg-typ') { KG.typ = e.target.value; refreshKg(); }
});
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#modal').hidden) closeModal(); });

function setOnline() { document.body.classList.toggle('offline', !navigator.onLine); renderSync(); }

/* =====================================================================
   START
   ===================================================================== */
async function init() {
  if ('serviceWorker' in navigator) {
    const hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.register('./sw.js').then(r => r.update()).catch(() => {});
    // En ny appversion har installerats – ladda om en gång (inte mitt i ett formulär)
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController || S.reloading) return;
      const reload = () => { S.reloading = true; location.reload(); };
      if ($('#modal').hidden) reload(); else S.reloadAfterModal = reload;
    });
  }
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
