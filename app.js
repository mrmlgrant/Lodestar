/* =========================================================================
   CONFIG  — set GOOGLE_CLIENT_ID, then deploy to GitHub Pages.
   1) GOOGLE_CLIENT_ID: an OAuth 2.0 "Web application" client ID from
      Google Cloud Console. Add your GitHub Pages origin
      (e.g. https://USERNAME.github.io) to "Authorized JavaScript origins".
   2) Enable the "Google Drive API" for that project.
   Data is stored in your Drive at:  My Drive / Applications / Lodestar / data.json
   (created automatically; reuses the Applications folder if it already exists).
   Leave GOOGLE_CLIENT_ID empty to run in demo mode (no sign-in; the sample
   trip lives only in memory for the session).
   ========================================================================= */
const CONFIG = {
  GOOGLE_CLIENT_ID: "32339759814-gar6qf8adgak1anoqb4mfv4ou8g8m1l4.apps.googleusercontent.com",
  APP_FOLDER: "Applications", // top-level folder in My Drive root
  APP_NAME: "Lodestar",       // this app's subfolder
  DATA_FILE: "data.json",     // single JSON file holding every trip
  SCOPES: "https://www.googleapis.com/auth/drive.file openid email profile",
};

const { useState, useEffect, useRef, useMemo, useCallback, createContext, useContext } = React;

/* ---------------- helpers ---------------- */
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : "id" + Math.random().toString(36).slice(2) + Date.now());
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const pad2 = (n) => String(n).padStart(2, "0");

function parseISO(s) { // local-safe date parse for 'YYYY-MM-DD'
  if (!s) return null;
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function toISO(dt) { return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`; }
function todayISO() { return toISO(new Date()); }
function addDays(iso, n) { const d = parseISO(iso); d.setDate(d.getDate() + n); return toISO(d); }
function dayCount(a, b) { if (!a || !b) return 0; return Math.round((parseISO(b) - parseISO(a)) / 86400000) + 1; }
function eachDay(a, b) { const out = []; if (!a || !b) return out; let c = a; const n = dayCount(a, b); for (let i = 0; i < n; i++) { out.push(c); c = addDays(c, 1); } return out; }

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEK = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
function fmtRange(a, b) {
  const d1 = parseISO(a), d2 = parseISO(b);
  if (!d1) return "Dates not set";
  if (!d2 || a === b) return `${MONTHS[d1.getMonth()]} ${d1.getDate()}`;
  const sameMonth = d1.getMonth() === d2.getMonth() && d1.getFullYear() === d2.getFullYear();
  return sameMonth
    ? `${MONTHS[d1.getMonth()]} ${d1.getDate()}–${d2.getDate()}, ${d2.getFullYear()}`
    : `${MONTHS[d1.getMonth()]} ${d1.getDate()} – ${MONTHS[d2.getMonth()]} ${d2.getDate()}, ${d2.getFullYear()}`;
}
function fmtDayLong(iso) { const d = parseISO(iso); return `${WEEK[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}`; }

function tripStatus(t) {
  const today = todayISO();
  if (!t.startDate) return { key: "draft", label: "Draft" };
  if (t.endDate && today > t.endDate) return { key: "past", label: "Past" };
  if (today >= t.startDate && (!t.endDate || today <= t.endDate)) return { key: "now", label: "Now" };
  const days = Math.round((parseISO(t.startDate) - parseISO(today)) / 86400000);
  return { key: "up", label: days === 0 ? "Today" : days === 1 ? "Tomorrow" : `In ${days} days` };
}
function fmtMoney(n, cur) {
  const sym = { USD: "$", EUR: "€", GBP: "£", AUD: "A$", JPY: "¥", CAD: "C$", NZD: "NZ$", INR: "₹", THB: "฿", MXN: "$" }[cur] || "";
  const v = Math.round((Number(n) || 0) * 100) / 100;
  return `${sym}${v.toLocaleString(undefined, { maximumFractionDigits: v % 1 ? 2 : 0 })}`;
}

/* categories & palette */
const CATS = [
  { key: "sight", label: "Sight", icon: "sight" },
  { key: "food", label: "Food", icon: "food" },
  { key: "stay", label: "Stay", icon: "stay" },
  { key: "move", label: "Transit", icon: "move" },
  { key: "do", label: "Activity", icon: "do" },
  { key: "note", label: "Note", icon: "note" },
];
const CAT = Object.fromEntries(CATS.map((c) => [c.key, c]));
const CAT_COLOR = { sight: "var(--c-sight)", food: "var(--c-food)", stay: "var(--c-stay)", move: "var(--c-move)", do: "var(--c-do)", note: "var(--c-note)" };
const PACK_CATS = ["Essentials", "Clothing", "Toiletries", "Electronics", "Documents", "Other"];
const BUDGET_CATS = [
  { key: "stay", label: "Lodging", color: "var(--c-stay)" },
  { key: "food", label: "Food", color: "var(--c-food)" },
  { key: "move", label: "Transport", color: "var(--c-move)" },
  { key: "do", label: "Activities", color: "var(--c-do)" },
  { key: "sight", label: "Sightseeing", color: "var(--c-sight)" },
  { key: "note", label: "Other", color: "var(--c-note)" },
];
const TRIP_COLORS = ["#0E6BA8", "#E4572E", "#2E7D57", "#6A4C93", "#B8860B", "#137075", "#C0392B", "#3D5A80"];

/* ---------------- icons ---------------- */
const ICONS = {
  compass: '<circle cx="12" cy="12" r="10"/><polygon points="16.2 7.8 14.1 14.1 7.8 16.2 9.9 9.9"/>',
  map: '<polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>',
  wallet: '<path d="M20 12V8H6a2 2 0 0 1-2-2 2 2 0 0 1 2-2h12v4"/><path d="M4 6v12a2 2 0 0 0 2 2h14v-4"/><path d="M18 12a2 2 0 0 0 0 4h4v-4Z"/>',
  luggage: '<rect x="6" y="7" width="12" height="14" rx="2"/><path d="M9 7V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/>',
  note: '<path d="M14 3v4a1 1 0 0 0 1 1h4"/><path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2Z"/><line x1="9" y1="13" x2="14" y2="13"/><line x1="9" y1="17" x2="12" y2="17"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M6.3 17.7l-1.4 1.4M19.1 4.9l-1.4 1.4"/>',
  moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8Z"/>',
  plus: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
  back: '<line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>',
  close: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
  trash: '<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  edit: '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4Z"/>',
  clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  pin: '<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0Z"/><circle cx="12" cy="10" r="3"/>',
  copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>',
  chevDown: '<polyline points="6 9 12 15 18 9"/>',
  up: '<polyline points="18 15 12 9 6 15"/>',
  down: '<polyline points="6 9 12 15 18 9"/>',
  search: '<circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
  food: '<path d="M6 2v7a2 2 0 0 0 4 0V2"/><line x1="8" y1="9" x2="8" y2="22"/><path d="M18 2c-1.6 0-3 1.9-3 5 0 2.6 1.3 3.5 3 3.7V22"/>',
  stay: '<path d="M2 5v14"/><path d="M2 9h18a2 2 0 0 1 2 2v8"/><path d="M2 16h20"/><path d="M6 9V8a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1"/>',
  move: '<path d="M5 17H3v-4l2-6h14l2 6v4h-2"/><path d="M5 17h14"/><circle cx="7.5" cy="17.5" r="1.5"/><circle cx="16.5" cy="17.5" r="1.5"/>',
  do: '<circle cx="12" cy="12" r="9"/><polygon points="10 9 16 12 10 15"/>',
  sight: '<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3l2-3h8l2 3h3a2 2 0 0 1 2 2Z"/><circle cx="12" cy="13" r="4"/>',
  link: '<path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/>',
  ticket: '<path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"/>',
  dollar: '<line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
  grip: '<circle cx="9" cy="6" r="1.4"/><circle cx="9" cy="12" r="1.4"/><circle cx="9" cy="18" r="1.4"/><circle cx="15" cy="6" r="1.4"/><circle cx="15" cy="12" r="1.4"/><circle cx="15" cy="18" r="1.4"/>',
  calPlus: '<path d="M21 13V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h7"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="19" y1="16" x2="19" y2="22"/><line x1="16" y1="19" x2="22" y2="19"/>',
};
function Ic({ name, size = 18, filled = false }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true"
      fill={filled ? "currentColor" : "none"} stroke={filled ? "none" : "currentColor"}
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      dangerouslySetInnerHTML={{ __html: ICONS[name] || "" }} />
  );
}
/* 8-point compass-rose star (long cardinal points, short diagonals) */
const STAR_PTS = "50,3 55,38 71.2,28.8 62,45 97,50 62,55 71.2,71.2 55,62 50,97 45,62 28.8,71.2 38,55 3,50 38,45 28.8,28.8 45,38";
function StarMark({ size = 24, fill = "#fff" }) {
  return <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true" style={{ display: "block" }}><polygon points={STAR_PTS} fill={fill} /></svg>;
}

/* ---------------- Google Drive + Auth module ---------------- */
const Cloud = (() => {
  let token = null, exp = 0, fileId = null, folderId = null, client = null, pending = null;
  const configured = () => !!CONFIG.GOOGLE_CLIENT_ID;
  const libReady = () => !!(window.google && google.accounts && google.accounts.oauth2);
  const available = () => configured() && libReady();

  function ensureClient() {
    if (client) return client;
    if (!available()) return null;
    client = google.accounts.oauth2.initTokenClient({
      client_id: CONFIG.GOOGLE_CLIENT_ID,
      scope: CONFIG.SCOPES,
      callback: (r) => {
        const p = pending; pending = null;
        if (r && r.access_token) { token = r.access_token; exp = Date.now() + ((r.expires_in || 3300) * 1000); p && p.resolve(token); }
        else { p && p.reject(new Error((r && r.error) || "auth_failed")); }
      },
      error_callback: (e) => { const p = pending; pending = null; p && p.reject(e || new Error("auth_error")); },
    });
    return client;
  }
  function getToken(interactive) {
    return new Promise((resolve, reject) => {
      if (token && Date.now() < exp - 60000) return resolve(token);
      const c = ensureClient();
      if (!c) return reject(new Error("unavailable"));
      pending = { resolve, reject };
      try { c.requestAccessToken(interactive ? {} : { prompt: "none" }); }
      catch (e) { pending = null; reject(e); }
    });
  }
  async function api(url, opts = {}) {
    const t = await getToken(false);
    const r = await fetch(url, { ...opts, headers: { Authorization: "Bearer " + t, ...(opts.headers || {}) } });
    if (!r.ok) throw new Error("drive_" + r.status);
    return r;
  }
  async function profile() {
    const r = await api("https://www.googleapis.com/oauth2/v3/userinfo");
    return await r.json();
  }
  async function findChildFolder(name, parentId) {
    // drive.file scope: we can only see files this app created.
    // Cache the IDs we created so we can find them again across sessions.
    const cacheKey = "lodestar_folder_" + name + "_" + parentId;
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      // Verify it still exists
      try {
        const r = await api(`https://www.googleapis.com/drive/v3/files/${cached}?fields=id,trashed`);
        const j = await r.json();
        if (!j.trashed) return cached;
      } catch (e) {}
      localStorage.removeItem(cacheKey);
    }
    // Search among files this app created with drive.file scope
    const q = encodeURIComponent(`name='${name}' and mimeType='application/vnd.google-apps.folder' and trashed=false and '${parentId}' in parents`);
    try {
      const r = await api(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)`);
      const j = await r.json();
      const id = (j.files && j.files[0] && j.files[0].id) || null;
      if (id) localStorage.setItem(cacheKey, id);
      return id;
    } catch (e) { return null; }
  }
  async function createFolder(name, parentId) {
    const r = await api("https://www.googleapis.com/drive/v3/files?fields=id", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, mimeType: "application/vnd.google-apps.folder", parents: [parentId] }),
    });
    const id = (await r.json()).id;
    if (id) localStorage.setItem("lodestar_folder_" + name + "_" + parentId, id);
    return id;
  }
  async function ensureFolder() {
    if (folderId) return folderId;
    let apps = await findChildFolder(CONFIG.APP_FOLDER, "root");
    if (!apps) apps = await createFolder(CONFIG.APP_FOLDER, "root");
    let mine = await findChildFolder(CONFIG.APP_NAME, apps);
    if (!mine) mine = await createFolder(CONFIG.APP_NAME, apps);
    folderId = mine; return mine;
  }
  async function findFile() {
    // Check cache first
    const cached = localStorage.getItem("lodestar_file_id");
    if (cached) {
      try {
        const r = await api(`https://www.googleapis.com/drive/v3/files/${cached}?fields=id,trashed`);
        const j = await r.json();
        if (!j.trashed) { fileId = cached; return fileId; }
      } catch (e) {}
      localStorage.removeItem("lodestar_file_id");
    }
    const fid = await ensureFolder();
    const q = encodeURIComponent(`name='${CONFIG.DATA_FILE}' and trashed=false and '${fid}' in parents`);
    try {
      const r = await api(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)`);
      const j = await r.json();
      fileId = (j.files && j.files[0] && j.files[0].id) || null;
    } catch (e) { fileId = null; }
    if (fileId) localStorage.setItem("lodestar_file_id", fileId);
    return fileId;
  }
  async function load() {
    if (fileId === null) await findFile();
    if (!fileId) return null;
    const r = await api(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`);
    return await r.json();
  }
  async function save(data) {
    const body = JSON.stringify(data);
    if (!fileId) {
      const fid = await ensureFolder();
      const meta = { name: CONFIG.DATA_FILE, parents: [fid] };
      const boundary = "lodestar" + Date.now();
      const multipart =
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n` +
        `--${boundary}\r\nContent-Type: application/json\r\n\r\n${body}\r\n--${boundary}--`;
      const r = await api("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id",
        { method: "POST", headers: { "Content-Type": `multipart/related; boundary=${boundary}` }, body: multipart });
      fileId = (await r.json()).id;
      if (fileId) localStorage.setItem("lodestar_file_id", fileId);
    } else {
      await api(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`,
        { method: "PATCH", headers: { "Content-Type": "application/json" }, body });
    }
  }
  async function signIn() { await getToken(true); return await profile(); }
  function signOut() {
    if (token && libReady()) try { google.accounts.oauth2.revoke(token, () => {}); } catch (e) {}
    token = null; exp = 0; fileId = null; folderId = null;
    ["lodestar_file_id"].forEach((k) => localStorage.removeItem(k));
    Object.keys(localStorage).filter((k) => k.startsWith("lodestar_folder_")).forEach((k) => localStorage.removeItem(k));
  }
  return { configured, available, signIn, signOut, load, save, profile, silentToken: () => getToken(false) };
})();

/* optional geocoder (works once deployed; used by "Find on map") */
async function geocode(q) {
  try {
    const r = await fetch("https://nominatim.openstreetmap.org/search?format=json&limit=1&q=" + encodeURIComponent(q), { headers: { "Accept": "application/json" } });
    const j = await r.json();
    if (j && j[0]) return { lat: parseFloat(j[0].lat), lng: parseFloat(j[0].lon), label: j[0].display_name };
  } catch (e) {}
  return null;
}

/* ---------------- demo data (shown until you sign in) ---------------- */
function demoData() {
  const start = todayISO();
  const d0 = addDays(start, 14), d1 = addDays(start, 15), d2 = addDays(start, 16);
  const tripId = uid();
  const mk = (date, order, title, type, st, en, lat, lng, extra = {}) =>
    ({ id: uid(), date, order, title, type, startTime: st, endTime: en, lat, lng, address: extra.address || "", notes: extra.notes || "", cost: extra.cost || 0, booking: extra.booking || "", url: extra.url || "" });
  return {
    version: 1, settings: {},
    trips: [{
      id: tripId, name: "Lisbon Long Weekend", destination: "Lisbon, Portugal",
      startDate: d0, endDate: d2, color: "#E4572E", emoji: "🇵🇹", currency: "EUR", budgetTotal: 900,
      notes: "Pack light — lots of hills and cobblestones. Buy a Viva Viagem card for the trams.",
      items: [
        mk(d0, 0, "Land at LIS airport", "move", "10:30", "11:15", 38.7742, -9.1342, { booking: "TP1234", cost: 0 }),
        mk(d0, 1, "Check in — Alfama guesthouse", "stay", "13:00", "", 38.7128, -9.1290, { cost: 220, booking: "Booking #A19K" }),
        mk(d0, 2, "Lunch at Time Out Market", "food", "14:00", "15:00", 38.7071, -9.1459, { cost: 28 }),
        mk(d0, 3, "Sunset at Miradouro da Senhora do Monte", "sight", "19:30", "20:30", 38.7196, -9.1305, {}),
        mk(d1, 0, "Pastéis de Belém", "food", "09:00", "09:45", 38.6979, -9.2032, { cost: 12, notes: "Get them warm, dusted with cinnamon." }),
        mk(d1, 1, "Jerónimos Monastery", "sight", "10:15", "12:00", 38.6979, -9.2065, { cost: 18 }),
        mk(d1, 2, "Tram 28 ride", "do", "15:00", "16:00", 38.7100, -9.1300, { cost: 6 }),
        mk(d2, 0, "Day trip to Sintra", "move", "09:00", "18:00", 38.7979, -9.3906, { cost: 40, notes: "Train from Rossio. Pena Palace first." }),
      ],
      places: [
        { id: uid(), name: "LX Factory", type: "do", address: "Alcântara", lat: 38.7036, lng: -9.1786, notes: "Shops + street art under the bridge." },
        { id: uid(), name: "Ginjinha Sem Rival", type: "food", address: "Baixa", lat: 38.7157, lng: -9.1385, notes: "Cherry liqueur, one euro a shot." },
      ],
      expenses: [
        { id: uid(), label: "Flights", category: "move", amount: 210, date: d0 },
        { id: uid(), label: "Guesthouse (2 nights)", category: "stay", amount: 220, date: d0 },
      ],
      packing: [
        { id: uid(), label: "Passport", category: "Documents", packed: true },
        { id: uid(), label: "Comfortable walking shoes", category: "Clothing", packed: false },
        { id: uid(), label: "Light rain jacket", category: "Clothing", packed: false },
        { id: uid(), label: "Universal adapter", category: "Electronics", packed: false },
      ],
    }],
  };
}
/* ---------------- store ---------------- */
const StoreCtx = createContext(null);
const useApp = () => useContext(StoreCtx);

function useStore() {
  const [data, setData] = useState(() => demoData());
  const updTrip = useCallback((id, fn) => setData((d) => ({ ...d, trips: d.trips.map((t) => (t.id === id ? fn(t) : t)) })), []);
  const orderedFor = (t, date) => t.items.filter((i) => i.date === date).sort((a, b) => (a.order - b.order));

  const actions = useMemo(() => ({
    setData,
    newTrip(partial) {
      const id = uid();
      setData((d) => ({ ...d, trips: [{ id, name: partial.name || "Untitled trip", destination: partial.destination || "", startDate: partial.startDate || "", endDate: partial.endDate || "", color: partial.color || TRIP_COLORS[0], emoji: partial.emoji || "🧭", currency: partial.currency || "USD", budgetTotal: partial.budgetTotal || 0, notes: "", items: [], places: [], expenses: [], packing: [] }, ...d.trips] }));
      return id;
    },
    patchTrip(id, patch) { updTrip(id, (t) => ({ ...t, ...patch })); },
    deleteTrip(id) { setData((d) => ({ ...d, trips: d.trips.filter((t) => t.id !== id) })); },
    duplicateTrip(id) {
      setData((d) => {
        const t = d.trips.find((x) => x.id === id); if (!t) return d;
        const copy = JSON.parse(JSON.stringify(t));
        copy.id = uid(); copy.name = t.name + " (copy)";
        copy.items = copy.items.map((i) => ({ ...i, id: uid() }));
        copy.places = copy.places.map((p) => ({ ...p, id: uid() }));
        copy.expenses = copy.expenses.map((e) => ({ ...e, id: uid() }));
        copy.packing = copy.packing.map((p) => ({ ...p, id: uid() }));
        const idx = d.trips.findIndex((x) => x.id === id);
        const trips = [...d.trips]; trips.splice(idx + 1, 0, copy);
        return { ...d, trips };
      });
    },
    addItem(tripId, partial = {}) {
      const id = uid();
      updTrip(tripId, (t) => {
        const date = partial.date || t.startDate || todayISO();
        const order = Math.max(-1, ...t.items.filter((i) => i.date === date).map((i) => i.order)) + 1;
        return { ...t, items: [...t.items, { id, date, order, title: "", type: "sight", startTime: "", endTime: "", address: "", lat: null, lng: null, notes: "", cost: 0, booking: "", url: "", ...partial }] };
      });
      return id;
    },
    patchItem(tripId, itemId, patch) { updTrip(tripId, (t) => ({ ...t, items: t.items.map((i) => (i.id === itemId ? { ...i, ...patch } : i)) })); },
    deleteItem(tripId, itemId) { updTrip(tripId, (t) => ({ ...t, items: t.items.filter((i) => i.id !== itemId) })); },
    moveItem(tripId, itemId, toDate, toIndex) {
      updTrip(tripId, (t) => {
        const all = t.items.map((i) => ({ ...i }));
        const moved = all.find((i) => i.id === itemId); if (!moved) return t;
        const srcDate = moved.date;
        const rest = all.filter((i) => i.id !== itemId);
        moved.date = toDate;
        const target = rest.filter((i) => i.date === toDate).sort((a, b) => a.order - b.order);
        const idx = toIndex == null ? target.length : clamp(toIndex, 0, target.length);
        target.splice(idx, 0, moved);
        target.forEach((i, k) => (i.order = k));
        const src = srcDate !== toDate ? rest.filter((i) => i.date === srcDate).sort((a, b) => a.order - b.order) : [];
        src.forEach((i, k) => (i.order = k));
        const untouched = rest.filter((i) => i.date !== toDate && i.date !== srcDate);
        return { ...t, items: [...untouched, ...target, ...src] };
      });
    },
    nudgeItem(tripId, itemId, dir) { // dir -1 up / +1 down within its day
      updTrip(tripId, (t) => {
        const it = t.items.find((i) => i.id === itemId); if (!it) return t;
        const list = t.items.filter((i) => i.date === it.date).sort((a, b) => a.order - b.order);
        const pos = list.findIndex((i) => i.id === itemId);
        const np = pos + dir; if (np < 0 || np >= list.length) return t;
        const a = list[pos], b = list[np];
        return { ...t, items: t.items.map((i) => (i.id === a.id ? { ...i, order: b.order } : i.id === b.id ? { ...i, order: a.order } : i)) };
      });
    },
    addPlace(tripId, place) { updTrip(tripId, (t) => ({ ...t, places: [...t.places, { id: uid(), name: "", type: "sight", address: "", lat: null, lng: null, notes: "", ...place }] })); },
    patchPlace(tripId, id, patch) { updTrip(tripId, (t) => ({ ...t, places: t.places.map((p) => (p.id === id ? { ...p, ...patch } : p)) })); },
    deletePlace(tripId, id) { updTrip(tripId, (t) => ({ ...t, places: t.places.filter((p) => p.id !== id) })); },
    schedulePlace(tripId, placeId, date) {
      updTrip(tripId, (t) => {
        const p = t.places.find((x) => x.id === placeId); if (!p) return t;
        const order = Math.max(-1, ...t.items.filter((i) => i.date === date).map((i) => i.order)) + 1;
        const item = { id: uid(), date, order, title: p.name, type: p.type, startTime: "", endTime: "", address: p.address, lat: p.lat, lng: p.lng, notes: p.notes, cost: 0, booking: "", url: "" };
        return { ...t, items: [...t.items, item], places: t.places.filter((x) => x.id !== placeId) };
      });
    },
    addExpense(tripId, e) { updTrip(tripId, (t) => ({ ...t, expenses: [{ id: uid(), label: "", category: "note", amount: 0, date: t.startDate || todayISO(), ...e }, ...t.expenses] })); },
    deleteExpense(tripId, id) { updTrip(tripId, (t) => ({ ...t, expenses: t.expenses.filter((e) => e.id !== id) })); },
    addPack(tripId, label, category) { updTrip(tripId, (t) => ({ ...t, packing: [...t.packing, { id: uid(), label, category: category || "Other", packed: false }] })); },
    togglePack(tripId, id) { updTrip(tripId, (t) => ({ ...t, packing: t.packing.map((p) => (p.id === id ? { ...p, packed: !p.packed } : p)) })); },
    deletePack(tripId, id) { updTrip(tripId, (t) => ({ ...t, packing: t.packing.filter((p) => p.id !== id) })); },
  }), [updTrip]);

  return { data, setData, orderedFor, ...actions };
}

/* ---------------- shared UI ---------------- */
function Modal({ title, onClose, children, foot, wide }) {
  useEffect(() => {
    const h = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);
  return (
    <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" style={wide ? { width: "min(760px,100%)" } : null} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head"><h3>{title}</h3><button className="btn icon-btn btn-ghost" onClick={onClose} aria-label="Close"><Ic name="close" /></button></div>
        <div className="modal-body">{children}</div>
        {foot && <div className="modal-foot">{foot}</div>}
      </div>
    </div>
  );
}

function CatChip({ cat, active, onClick }) {
  const c = CAT[cat];
  return (
    <button type="button" className={`cat-chip cat-${cat} ${active ? "on" : ""}`} onClick={onClick}>
      <Ic name={c.icon} size={14} />{c.label}
    </button>
  );
}

/* ---------------- Trips overview ---------------- */
function TripCard({ trip, onOpen }) {
  const st = tripStatus(trip);
  const nDays = dayCount(trip.startDate, trip.endDate);
  return (
    <div className="ticket" onClick={onOpen} role="button" tabIndex={0}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onOpen())}>
      <div className="ticket-band" style={{ background: trip.color }}>
        <span className="emoji">{trip.emoji}</span>
        <span className="ticket-dest">{trip.destination || "Destination TBD"}</span>
      </div>
      <div className="ticket-body">
        <h3>{trip.name}</h3>
        <div className="ticket-dates">{fmtRange(trip.startDate, trip.endDate)}</div>
      </div>
      <div className="perf" />
      <div className="ticket-foot" style={{ paddingBottom: 16 }}>
        <span>{nDays ? `${nDays} day${nDays > 1 ? "s" : ""}` : "No dates"}</span>
        <span>· {trip.items.length} stop{trip.items.length === 1 ? "" : "s"}</span>
        <span className={`status-pill status-${st.key}`}>{st.label}</span>
      </div>
    </div>
  );
}

function TripsView({ onOpen, onNew }) {
  const { data } = useApp();
  return (
    <div className="content">
      <div className="page-head">
        <div>
          <div className="eyebrow">Your itineraries</div>
          <h2>Trips</h2>
          <p>Every journey you're planning, from first idea to boarding pass.</p>
        </div>
        <button className="btn btn-accent" onClick={onNew}><Ic name="plus" /> New trip</button>
      </div>
      {data.trips.length === 0 ? (
        <div className="empty">
          <div className="ico"><Ic name="compass" size={28} /></div>
          <h3>No trips yet</h3>
          <p>Start with a destination and some dates — the itinerary builds itself day by day.</p>
          <div style={{ marginTop: 16 }}><button className="btn btn-accent" onClick={onNew}><Ic name="plus" /> Plan your first trip</button></div>
        </div>
      ) : (
        <div className="trip-grid">
          {data.trips.map((t) => <TripCard key={t.id} trip={t} onOpen={() => onOpen(t.id)} />)}
          <div className="new-card" onClick={onNew} role="button" tabIndex={0}
            onKeyDown={(e) => (e.key === "Enter") && onNew()}>
            <div className="plus"><Ic name="plus" size={22} /></div>
            <span>New trip</span>
          </div>
        </div>
      )}
    </div>
  );
}

/* create / edit trip */
function TripEditor({ trip, onClose }) {
  const { newTrip, patchTrip } = useApp();
  const [f, setF] = useState(() => trip || { name: "", destination: "", startDate: "", endDate: "", color: TRIP_COLORS[0], emoji: "🧭", currency: "USD", budgetTotal: 0 });
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const save = () => {
    const patch = { ...f, budgetTotal: Number(f.budgetTotal) || 0 };
    if (patch.endDate && patch.startDate && patch.endDate < patch.startDate) patch.endDate = patch.startDate;
    if (trip) patchTrip(trip.id, patch); else newTrip(patch);
    onClose();
  };
  const EMOJIS = ["🧭", "🇵🇹", "🗼", "🏝️", "🏔️", "🏛️", "🌆", "🚆", "🛶", "🌸", "🍜", "🎒", "🏖️", "🗾", "🐚"];
  return (
    <Modal title={trip ? "Edit trip" : "New trip"} onClose={onClose}
      foot={<><button className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-accent" onClick={save} disabled={!f.name.trim()}>{trip ? "Save changes" : "Create trip"}</button></>}>
      <div className="field"><label>Trip name</label><input value={f.name} autoFocus placeholder="e.g. Lisbon Long Weekend" onChange={(e) => set("name", e.target.value)} /></div>
      <div className="field"><label>Destination</label><input value={f.destination} placeholder="City, country" onChange={(e) => set("destination", e.target.value)} /></div>
      <div className="row-2">
        <div className="field"><label>Start date</label><input type="date" value={f.startDate} onChange={(e) => set("startDate", e.target.value)} /></div>
        <div className="field"><label>End date</label><input type="date" value={f.endDate} min={f.startDate || undefined} onChange={(e) => set("endDate", e.target.value)} /></div>
      </div>
      <div className="row-2">
        <div className="field"><label>Budget</label><input type="number" min="0" value={f.budgetTotal} onChange={(e) => set("budgetTotal", e.target.value)} /></div>
        <div className="field"><label>Currency</label>
          <select value={f.currency} onChange={(e) => set("currency", e.target.value)}>
            {["USD", "EUR", "GBP", "AUD", "CAD", "NZD", "JPY", "INR", "THB", "MXN"].map((c) => <option key={c}>{c}</option>)}
          </select>
        </div>
      </div>
      <div className="field"><label>Cover colour</label>
        <div className="color-picker">{TRIP_COLORS.map((c) => <div key={c} className={`swatch ${f.color === c ? "on" : ""}`} style={{ background: c }} onClick={() => set("color", c)} />)}</div>
      </div>
      <div className="field"><label>Icon</label>
        <div className="color-picker">{EMOJIS.map((e) => <div key={e} className={`swatch ${f.emoji === e ? "on" : ""}`} style={{ display: "grid", placeItems: "center", background: "var(--surface-2)", fontSize: 17 }} onClick={() => set("emoji", e)}>{e}</div>)}</div>
      </div>
    </Modal>
  );
}
/* ---------------- item editor ---------------- */
function ItemEditor({ trip, item, defaultDate, onClose }) {
  const { addItem, patchItem, deleteItem, moveItem } = useApp();
  const [f, setF] = useState(() => item ? { ...item } : { title: "", type: "sight", date: defaultDate || trip.startDate || todayISO(), startTime: "", endTime: "", address: "", lat: null, lng: null, cost: 0, booking: "", url: "", notes: "" });
  const [geoBusy, setGeoBusy] = useState(false);
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }));
  const days = eachDay(trip.startDate, trip.endDate);
  const dayOpts = f.date && !days.includes(f.date) ? [f.date, ...days] : days;
  const findOnMap = async () => {
    const q = [f.title, f.address, trip.destination].filter(Boolean).join(", ");
    if (!q) return;
    setGeoBusy(true);
    const r = await geocode(q);
    setGeoBusy(false);
    if (r) { set("lat", r.lat); set("lng", r.lng); if (!f.address) set("address", r.label); }
    else alert("Couldn't locate that. Enter coordinates manually, or try again on the deployed site — the map lookup can't be reached from this preview.");
  };
  const save = () => {
    const patch = { ...f, cost: Number(f.cost) || 0, lat: (f.lat === "" || f.lat == null) ? null : Number(f.lat), lng: (f.lng === "" || f.lng == null) ? null : Number(f.lng) };
    if (item) { patchItem(trip.id, item.id, patch); if (patch.date !== item.date) moveItem(trip.id, item.id, patch.date, null); }
    else addItem(trip.id, patch);
    onClose();
  };
  return (
    <Modal title={item ? "Edit stop" : "Add stop"} onClose={onClose} foot={<>
      {item && <button className="btn btn-danger" onClick={() => { deleteItem(trip.id, item.id); onClose(); }}><Ic name="trash" size={16} /> Delete</button>}
      <div className="spacer" />
      <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
      <button className="btn btn-accent" onClick={save} disabled={!f.title.trim()}>{item ? "Save" : "Add stop"}</button>
    </>}>
      <div className="field"><label>What is it?</label><input value={f.title} autoFocus placeholder="e.g. Jerónimos Monastery" onChange={(e) => set("title", e.target.value)} /></div>
      <div className="field"><label>Type</label>
        <div className="cat-picker">{CATS.map((c) => <CatChip key={c.key} cat={c.key} active={f.type === c.key} onClick={() => set("type", c.key)} />)}</div>
      </div>
      <div className="row-3">
        <div className="field"><label>Day</label>
          {dayOpts.length
            ? <select value={f.date} onChange={(e) => set("date", e.target.value)}>{dayOpts.map((d) => <option key={d} value={d}>{days.includes(d) ? `Day ${days.indexOf(d) + 1} · ${fmtDayLong(d)}` : fmtDayLong(d)}</option>)}</select>
            : <input type="date" value={f.date} onChange={(e) => set("date", e.target.value)} />}
        </div>
        <div className="field"><label>Start</label><input type="time" value={f.startTime} onChange={(e) => set("startTime", e.target.value)} /></div>
        <div className="field"><label>End</label><input type="time" value={f.endTime} onChange={(e) => set("endTime", e.target.value)} /></div>
      </div>
      <div className="field"><label>Address</label>
        <div style={{ display: "flex", gap: 8 }}>
          <input value={f.address} placeholder="Where is it?" onChange={(e) => set("address", e.target.value)} />
          <button type="button" className="btn btn-sm" onClick={findOnMap} disabled={geoBusy} title="Look up coordinates" style={{ flex: "0 0 auto" }}>
            <Ic name={geoBusy ? "clock" : "search"} size={15} />{f.lat != null ? "Located" : "Find"}
          </button>
        </div>
        {f.lat != null && <div style={{ fontSize: 12, color: "var(--muted)", fontFamily: "var(--mono)", marginTop: 6 }}>📍 {Number(f.lat).toFixed(4)}, {Number(f.lng).toFixed(4)}</div>}
      </div>
      <div className="row-2">
        <div className="field"><label>Cost ({trip.currency})</label><input type="number" min="0" value={f.cost} onChange={(e) => set("cost", e.target.value)} /></div>
        <div className="field"><label>Booking ref</label><input value={f.booking} placeholder="Confirmation #" onChange={(e) => set("booking", e.target.value)} /></div>
      </div>
      <div className="field"><label>Link</label><input value={f.url} placeholder="https://…" onChange={(e) => set("url", e.target.value)} /></div>
      <div className="field"><label>Notes</label><textarea value={f.notes} placeholder="Reminders, tips, what to order…" onChange={(e) => set("notes", e.target.value)} /></div>
    </Modal>
  );
}

/* ---------------- itinerary ---------------- */
function ItineraryItem({ trip, item, onEdit }) {
  const app = useApp();
  return (
    <div className="item" draggable
      onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; app._drag.current = { id: item.id, date: item.date }; e.currentTarget.classList.add("dragging"); }}
      onDragEnd={(e) => e.currentTarget.classList.remove("dragging")}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => { e.preventDefault(); e.stopPropagation(); const src = app._drag.current; if (!src) return; const ordered = app.orderedFor(trip, item.date).filter((i) => i.id !== src.id); const idx = ordered.findIndex((i) => i.id === item.id); app.moveItem(trip.id, src.id, item.date, idx === -1 ? ordered.length : idx); app._drag.current = null; }}
      onClick={() => onEdit(item)}>
      <div className="time-rail">
        {item.startTime ? <><div>{item.startTime}</div>{item.endTime && <div className="t2">{item.endTime}</div>}</> : <Ic name="grip" size={16} />}
      </div>
      <div className={`item-main cat-${item.type}`}>
        <div className="item-title">
          <span style={{ color: CAT_COLOR[item.type], display: "inline-flex" }}><Ic name={CAT[item.type].icon} size={15} /></span>
          {item.title || "Untitled"}
        </div>
        {(item.address || item.cost > 0 || item.booking || item.url) && (
          <div className="item-sub">
            {item.address && <span>{item.lat != null ? "📍 " : ""}{item.address}</span>}
            {item.cost > 0 && <span className="cost">{fmtMoney(item.cost, trip.currency)}</span>}
            {item.booking && <span className="tag">{item.booking}</span>}
            {item.url && <a href={item.url} target="_blank" rel="noopener" onClick={(e) => e.stopPropagation()}><Ic name="link" size={13} /></a>}
          </div>
        )}
        {item.notes && <div className="item-sub" style={{ fontStyle: "italic" }}>{item.notes}</div>}
      </div>
      <div className="item-actions" onClick={(e) => e.stopPropagation()}>
        <button className="mini" title="Move up" onClick={() => app.nudgeItem(trip.id, item.id, -1)}><Ic name="up" size={14} /></button>
        <button className="mini" title="Move down" onClick={() => app.nudgeItem(trip.id, item.id, 1)}><Ic name="down" size={14} /></button>
      </div>
    </div>
  );
}

function DayBlock({ trip, date, index, onEdit, onAdd }) {
  const app = useApp();
  const [hot, setHot] = useState(false);
  const items = app.orderedFor(trip, date);
  const d = parseISO(date);
  const dayCost = items.reduce((s, i) => s + (Number(i.cost) || 0), 0);
  return (
    <div className={`day ${hot ? "drop-hot" : ""}`}
      onDragOver={(e) => { e.preventDefault(); setHot(true); }}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setHot(false); }}
      onDrop={(e) => { e.preventDefault(); setHot(false); const pid = app._dragPlace.current; if (pid) { app.schedulePlace(trip.id, pid, date); app._dragPlace.current = null; return; } const src = app._drag.current; if (!src) return; app.moveItem(trip.id, src.id, date, null); app._drag.current = null; }}>
      <div className="day-head">
        <div className="day-num"><small>DAY</small>{index + 1}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="d-title">{WEEK[d.getDay()]}, {MONTHS[d.getMonth()]} {d.getDate()}</div>
          <div className="d-sub">{items.length} stop{items.length === 1 ? "" : "s"}{dayCost > 0 ? ` · ${fmtMoney(dayCost, trip.currency)}` : ""}</div>
        </div>
        <button className="btn btn-sm btn-ghost" onClick={() => onAdd(date)}><Ic name="plus" size={15} /> Add</button>
      </div>
      <div className="day-body">
        {items.length === 0
          ? <div className="day-empty">Nothing planned yet. Drag a saved place here, or add a stop.</div>
          : items.map((it) => <ItineraryItem key={it.id} trip={trip} item={it} onEdit={onEdit} />)}
        <button className="add-item" onClick={() => onAdd(date)}><Ic name="plus" size={15} /> Add stop to Day {index + 1}</button>
      </div>
    </div>
  );
}

function SavedPlaces({ trip }) {
  const app = useApp();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [pickFor, setPickFor] = useState(null);
  const days = eachDay(trip.startDate, trip.endDate);
  return (
    <div className="side-panel">
      <div className="side-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div><h4>Saved places</h4><p>A wishlist to slot into days</p></div>
        <button className="btn icon-btn btn-ghost" onClick={() => setAdding(true)} title="Add place"><Ic name="plus" /></button>
      </div>
      {adding && (
        <div style={{ padding: "0 12px 10px" }}>
          <input className="inp" autoFocus placeholder="Place name, then Enter" value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && name.trim()) { app.addPlace(trip.id, { name: name.trim() }); setName(""); } if (e.key === "Escape") { setAdding(false); setName(""); } }}
            onBlur={() => { if (!name.trim()) setAdding(false); }} />
        </div>
      )}
      <div className="place-list">
        {trip.places.length === 0 && !adding && <div className="day-empty" style={{ margin: 4 }}>No saved places yet. Keep a list of spots you might visit, then drop them onto a day.</div>}
        {trip.places.map((p) => (
          <div className="place" key={p.id} draggable
            onDragStart={(e) => { e.dataTransfer.effectAllowed = "copy"; app._dragPlace.current = p.id; }}>
            <div className="p-title"><span style={{ color: CAT_COLOR[p.type], display: "inline-flex" }}><Ic name={CAT[p.type].icon} size={14} /></span>{p.name}</div>
            {(p.address || p.notes) && <div className="p-sub">{p.address}{p.address && p.notes ? " — " : ""}{p.notes}</div>}
            <div className="p-actions">
              {pickFor === p.id ? (
                <select className="inp" style={{ padding: "6px 8px", fontSize: 13 }} autoFocus defaultValue=""
                  onChange={(e) => { if (e.target.value) { app.schedulePlace(trip.id, p.id, e.target.value); setPickFor(null); } }}
                  onBlur={() => setPickFor(null)}>
                  <option value="" disabled>Add to day…</option>
                  {days.map((d, i) => <option key={d} value={d}>Day {i + 1} · {fmtDayLong(d)}</option>)}
                </select>
              ) : (<>
                <button className="btn btn-sm" onClick={() => (days.length ? setPickFor(p.id) : app.schedulePlace(trip.id, p.id, trip.startDate || todayISO()))}><Ic name="calPlus" size={14} /> Schedule</button>
                <button className="mini" onClick={() => app.deletePlace(trip.id, p.id)} title="Remove"><Ic name="trash" size={14} /></button>
              </>)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------- map ---------------- */
function escapeHtml(s) { return String(s || "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }
function MapPanel({ trip }) {
  const days = eachDay(trip.startDate, trip.endDate);
  const [day, setDay] = useState("all");
  const elRef = useRef(null), mapRef = useRef(null), layerRef = useRef(null), markersRef = useRef({});
  const hasL = typeof window !== "undefined" && !!window.L;

  const stops = useMemo(() => {
    let items = trip.items.filter((i) => i.lat != null && i.lng != null);
    if (day !== "all") items = items.filter((i) => i.date === day);
    items = items.slice().sort((a, b) => (a.date === b.date ? a.order - b.order : (a.date < b.date ? -1 : 1)));
    return items.map((it, idx) => ({ ...it, n: idx + 1 }));
  }, [trip, day]);
  const places = trip.places.filter((p) => p.lat != null && p.lng != null);

  useEffect(() => {
    if (!hasL || !elRef.current || mapRef.current) return;
    const map = L.map(elRef.current, { scrollWheelZoom: true, worldCopyJump: true }).setView([20, 0], 2);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap contributors" }).addTo(map);
    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    setTimeout(() => map.invalidateSize(), 160);
    return () => { map.remove(); mapRef.current = null; };
  }, [hasL]);

  useEffect(() => {
    const map = mapRef.current, layer = layerRef.current;
    if (!map || !layer) return;
    layer.clearLayers(); markersRef.current = {};
    const pts = [];
    stops.forEach((s) => {
      const color = CAT_COLOR[s.type] || "var(--accent)";
      const icon = L.divIcon({ className: "", iconSize: [26, 26], iconAnchor: [13, 26], popupAnchor: [0, -24], html: `<div class="pin-marker" style="background:${color}"><span>${s.n}</span></div>` });
      const m = L.marker([s.lat, s.lng], { icon }).addTo(layer).bindPopup(`<b>${escapeHtml(s.title)}</b>${s.startTime ? "<br>" + s.startTime : ""}${s.address ? "<br>" + escapeHtml(s.address) : ""}`);
      markersRef.current[s.id] = m; pts.push([s.lat, s.lng]);
    });
    places.forEach((p) => {
      L.circleMarker([p.lat, p.lng], { radius: 6, color: "#fff", weight: 2, fillColor: CAT_COLOR[p.type] || "#83796A", fillOpacity: 0.9 }).addTo(layer).bindPopup(`<b>${escapeHtml(p.name)}</b><br><i>saved place</i>`);
      pts.push([p.lat, p.lng]);
    });
    if (day !== "all" && stops.length > 1) L.polyline(stops.map((s) => [s.lat, s.lng]), { color: "#0E6BA8", weight: 3, opacity: 0.55, dashArray: "2 9", lineCap: "round" }).addTo(layer);
    if (pts.length) { try { map.fitBounds(pts, { padding: [46, 46], maxZoom: 14 }); } catch (e) {} }
    setTimeout(() => map.invalidateSize(), 60);
  }, [stops, places, day, hasL]);

  const focus = (s) => { const m = markersRef.current[s.id], map = mapRef.current; if (m && map) { map.setView([s.lat, s.lng], 15, { animate: true }); m.openPopup(); } };
  const missing = trip.items.filter((i) => i.lat == null).length;

  return (
    <div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 14, flexWrap: "wrap" }}>
        <button className={`cat-chip ${day === "all" ? "on cat-sight" : ""}`} onClick={() => setDay("all")}>Whole trip</button>
        {days.map((d, i) => <button key={d} className={`cat-chip ${day === d ? "on cat-sight" : ""}`} onClick={() => setDay(d)}>Day {i + 1}</button>)}
        <span className="spacer" />
        {missing > 0 && <span className="tag">{missing} stop{missing > 1 ? "s" : ""} without a location</span>}
      </div>
      {!hasL ? (
        <div className="map-wrap" style={{ gridTemplateColumns: "1fr" }}>
          <div className="map-fallback">
            <div>
              <div className="ico" style={{ margin: "0 auto 12px", width: 56, height: 56, borderRadius: 16, display: "grid", placeItems: "center", background: "var(--surface)", border: "1px solid var(--line)" }}><Ic name="map" size={24} /></div>
              <p>The interactive map couldn't load in this preview. It will work once the app is deployed. Your mapped stops:</p>
              <div style={{ textAlign: "left", maxWidth: 360, margin: "14px auto 0" }}>
                {stops.length === 0 ? <em>No stops with a location yet.</em> : stops.map((s) => <div key={s.id} className="map-stop"><div className="stop-pin" style={{ background: CAT_COLOR[s.type] }}><span>{s.n}</span></div><div><div style={{ fontWeight: 640, fontSize: 14, color: "var(--ink)" }}>{s.title}</div><div style={{ fontSize: 12, color: "var(--muted)", fontFamily: "var(--mono)" }}>{s.startTime || fmtDayLong(s.date)}</div></div></div>)}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="map-wrap">
          <div className="map-side">
            {stops.length === 0 && places.length === 0
              ? <div className="day-empty" style={{ margin: 0 }}>No mapped stops yet. Open a stop, add its address and press “Find”.</div>
              : <>
                {stops.map((s) => (
                  <div className="map-stop" key={s.id} onClick={() => focus(s)}>
                    <div className="stop-pin" style={{ background: CAT_COLOR[s.type] }}><span>{s.n}</span></div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 640, fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.title}</div>
                      <div style={{ fontSize: 12, color: "var(--muted)", fontFamily: "var(--mono)" }}>{day === "all" ? fmtDayLong(s.date) : (s.startTime || CAT[s.type].label)}</div>
                    </div>
                  </div>
                ))}
                {places.length > 0 && <div style={{ fontSize: 11, letterSpacing: ".12em", textTransform: "uppercase", color: "var(--muted)", fontFamily: "var(--mono)", margin: "12px 8px 4px" }}>Saved places</div>}
                {places.map((p) => (
                  <div className="map-stop" key={p.id}>
                    <span style={{ width: 12, height: 12, margin: "6px", borderRadius: "50%", background: CAT_COLOR[p.type], flex: "0 0 auto", border: "2px solid var(--surface)" }} />
                    <div style={{ fontWeight: 600, fontSize: 13.5 }}>{p.name}</div>
                  </div>
                ))}
              </>}
          </div>
          <div className="map-el" ref={elRef} />
        </div>
      )}
    </div>
  );
}

/* ---------------- budget ---------------- */
function BudgetPanel({ trip }) {
  const app = useApp();
  const [f, setF] = useState({ label: "", amount: "", category: "food", date: trip.startDate || todayISO() });
  const spent = trip.expenses.reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const planned = trip.items.reduce((s, i) => s + (Number(i.cost) || 0), 0);
  const budget = Number(trip.budgetTotal) || 0;
  const remaining = budget - spent;
  const byCat = {}; trip.expenses.forEach((e) => { byCat[e.category] = (byCat[e.category] || 0) + (Number(e.amount) || 0); });
  const maxCat = Math.max(1, ...Object.values(byCat));
  const pct = budget > 0 ? clamp((spent / budget) * 100, 0, 100) : 0;
  const add = () => { if (!f.label.trim() || !(Number(f.amount) > 0)) return; app.addExpense(trip.id, { label: f.label.trim(), amount: Number(f.amount), category: f.category, date: f.date }); setF({ ...f, label: "", amount: "" }); };
  return (
    <div className="grid-2">
      <div className="panel">
        <h4><Ic name="wallet" size={18} /> Overview</h4>
        <div className="stat-row">
          <div className="stat"><div className="k">Budget</div><div className="v">{budget ? fmtMoney(budget, trip.currency) : "—"}</div></div>
          <div className="stat"><div className="k">Logged</div><div className="v">{fmtMoney(spent, trip.currency)}</div></div>
          <div className="stat"><div className="k">{remaining < 0 ? "Over by" : "Left"}</div><div className={`v ${remaining < 0 ? "over" : ""}`}>{budget ? fmtMoney(Math.abs(remaining), trip.currency) : "—"}</div></div>
        </div>
        {budget > 0 && <div className="meter"><i style={{ width: pct + "%" }} /></div>}
        <div style={{ fontSize: 12.5, color: "var(--muted)" }}>Planned from itinerary: {fmtMoney(planned, trip.currency)}{budget ? ` · ${Math.round(pct)}% of budget logged` : ""}</div>
        <h4 style={{ margin: "22px 0 12px" }}>By category</h4>
        {Object.keys(byCat).length === 0
          ? <div className="day-empty" style={{ margin: 0 }}>No expenses logged yet.</div>
          : BUDGET_CATS.filter((c) => byCat[c.key]).map((c) => (
            <div className="bar-row" key={c.key}>
              <span className="lbl"><span style={{ width: 9, height: 9, borderRadius: 3, background: c.color, display: "inline-block" }} />{c.label}</span>
              <span className="bar-track"><i style={{ width: (byCat[c.key] / maxCat * 100) + "%", background: c.color }} /></span>
              <span className="amt">{fmtMoney(byCat[c.key], trip.currency)}</span>
            </div>
          ))}
      </div>
      <div className="panel">
        <h4><Ic name="dollar" size={18} /> Log an expense</h4>
        <div className="field"><label>What for?</label><input value={f.label} placeholder="e.g. Dinner at Ramiro" onChange={(e) => setF({ ...f, label: e.target.value })} onKeyDown={(e) => e.key === "Enter" && add()} /></div>
        <div className="row-2">
          <div className="field"><label>Amount ({trip.currency})</label><input type="number" min="0" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} onKeyDown={(e) => e.key === "Enter" && add()} /></div>
          <div className="field"><label>Category</label><select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>{BUDGET_CATS.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}</select></div>
        </div>
        <button className="btn btn-accent" style={{ width: "100%" }} onClick={add}><Ic name="plus" size={16} /> Add expense</button>
        <div style={{ marginTop: 14 }}>
          {trip.expenses.length === 0 && <div style={{ fontSize: 13, color: "var(--muted)", textAlign: "center", padding: "8px 0" }}>Nothing logged yet.</div>}
          {trip.expenses.map((e) => (
            <div className="exp-row" key={e.id}>
              <span style={{ width: 9, height: 9, borderRadius: 3, background: (BUDGET_CATS.find((c) => c.key === e.category) || {}).color || "var(--muted)", display: "inline-block", flex: "0 0 auto" }} />
              <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.label}</span>
              <span className="e-amt">{fmtMoney(e.amount, trip.currency)}</span>
              <button className="mini" onClick={() => app.deleteExpense(trip.id, e.id)} title="Delete" style={{ flex: "0 0 auto" }}><Ic name="close" size={13} /></button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ---------------- packing ---------------- */
function PackingPanel({ trip }) {
  const app = useApp();
  const [label, setLabel] = useState(""); const [cat, setCat] = useState("Essentials");
  const total = trip.packing.length, done = trip.packing.filter((p) => p.packed).length;
  const add = () => { if (!label.trim()) return; app.addPack(trip.id, label.trim(), cat); setLabel(""); };
  return (
    <div className="panel" style={{ maxWidth: 640 }}>
      <h4><Ic name="luggage" size={18} /> Packing list {total > 0 && <span className="tag" style={{ marginLeft: "auto" }}>{done}/{total} packed</span>}</h4>
      {total > 0 && <div className="meter" style={{ marginBottom: 18 }}><i style={{ width: (done / total * 100) + "%" }} /></div>}
      <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
        <input className="inp" placeholder="Add an item…" value={label} onChange={(e) => setLabel(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
        <select className="inp" style={{ width: 150, flex: "0 0 auto" }} value={cat} onChange={(e) => setCat(e.target.value)}>{PACK_CATS.map((c) => <option key={c}>{c}</option>)}</select>
        <button className="btn btn-accent" onClick={add} style={{ flex: "0 0 auto" }}><Ic name="plus" size={16} /></button>
      </div>
      {total === 0 && <div className="day-empty">Nothing on the list yet. Add what you don't want to forget.</div>}
      {PACK_CATS.map((c) => {
        const items = trip.packing.filter((p) => p.category === c);
        if (!items.length) return null;
        return (
          <div className="pack-cat" key={c}>
            <h5>{c}</h5>
            {items.map((p) => (
              <div className={`check ${p.packed ? "done" : ""}`} key={p.id}>
                <input type="checkbox" checked={p.packed} onChange={() => app.togglePack(trip.id, p.id)} id={"pk" + p.id} />
                <label htmlFor={"pk" + p.id}>{p.label}</label>
                <button className="x" onClick={() => app.deletePack(trip.id, p.id)} title="Remove"><Ic name="close" size={15} /></button>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

/* ---------------- notes ---------------- */
function NotesPanel({ trip }) {
  const app = useApp();
  return (
    <div className="panel" style={{ maxWidth: 720 }}>
      <h4><Ic name="note" size={18} /> Trip notes</h4>
      <textarea className="inp" style={{ minHeight: 300, lineHeight: 1.6, resize: "vertical" }} placeholder="Reservations, reminders, links, anything you want on hand…" value={trip.notes} onChange={(e) => app.patchTrip(trip.id, { notes: e.target.value })} />
    </div>
  );
}

/* ---------------- trip view ---------------- */
function TripView({ tripId, onBack, onEditTrip }) {
  const app = useApp();
  const trip = app.data.trips.find((t) => t.id === tripId);
  const [tab, setTab] = useState("itinerary");
  const [editItem, setEditItem] = useState(undefined); // undefined=closed, null=new, obj=edit
  const [addDate, setAddDate] = useState(null);
  useEffect(() => { if (!trip) onBack(); }, [trip, onBack]);
  if (!trip) return null;
  const st = tripStatus(trip);
  const days = eachDay(trip.startDate, trip.endDate);
  const nDays = days.length;
  const openAdd = (date) => { setAddDate(date); setEditItem(null); };
  const TABS = [["itinerary", "Itinerary", "calendar", trip.items.length], ["map", "Map", "map", null], ["budget", "Budget", "wallet", null], ["packing", "Packing", "luggage", trip.packing.length], ["notes", "Notes", "note", null]];
  return (
    <div className="content">
      <div className="trip-hero">
        <div className="trip-hero-band" style={{ background: trip.color }}>
          <div className="dest">{trip.emoji} {trip.destination || "Destination TBD"}</div>
          <h2>{trip.name}</h2>
        </div>
        <div className="trip-hero-meta">
          <span className="m"><Ic name="calendar" size={15} /><span className="mono">{fmtRange(trip.startDate, trip.endDate)}</span></span>
          {nDays > 0 && <span className="m">{nDays} day{nDays > 1 ? "s" : ""}</span>}
          <span className="m countdown">{st.label}</span>
          <span className="spacer" />
          <button className="btn btn-sm" onClick={() => onEditTrip(trip)}><Ic name="edit" size={15} /> Edit</button>
          <button className="btn btn-sm" onClick={() => app.duplicateTrip(trip.id)}><Ic name="copy" size={15} /> Duplicate</button>
          <button className="btn btn-sm btn-danger" onClick={() => { if (confirm("Delete “" + trip.name + "”? This can't be undone.")) { app.deleteTrip(trip.id); onBack(); } }} title="Delete trip"><Ic name="trash" size={15} /></button>
        </div>
      </div>

      <div className="tabs">
        {TABS.map(([k, label, icon, count]) => (
          <button key={k} className={`tab ${tab === k ? "on" : ""}`} onClick={() => setTab(k)}>
            <Ic name={icon} size={17} />{label}{count != null && count > 0 && <span className="count">{count}</span>}
          </button>
        ))}
      </div>

      {tab === "itinerary" && (nDays === 0
        ? <div className="empty"><div className="ico"><Ic name="calendar" size={26} /></div><h3>Set your dates</h3><p>Add a start and end date and Lodestar lays out a day-by-day plan for you.</p><div style={{ marginTop: 16 }}><button className="btn btn-accent" onClick={() => onEditTrip(trip)}><Ic name="calendar" size={16} /> Add dates</button></div></div>
        : <div className="itin">
            <div className="days">{days.map((d, i) => <DayBlock key={d} trip={trip} date={d} index={i} onEdit={(it) => { setAddDate(null); setEditItem(it); }} onAdd={openAdd} />)}</div>
            <SavedPlaces trip={trip} />
          </div>)}
      {tab === "map" && <MapPanel trip={trip} />}
      {tab === "budget" && <BudgetPanel trip={trip} />}
      {tab === "packing" && <PackingPanel trip={trip} />}
      {tab === "notes" && <NotesPanel trip={trip} />}

      {editItem !== undefined && <ItemEditor trip={trip} item={editItem} defaultDate={addDate} onClose={() => setEditItem(undefined)} />}
    </div>
  );
}
/* ---------------- google button + sync + user ---------------- */
function GoogleBtn({ onClick, children }) {
  return (
    <button className="gbtn" onClick={onClick}>
      <svg viewBox="0 0 48 48" width="18" height="18"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.6 2.6 30.2 0 24 0 14.6 0 6.4 5.4 2.5 13.2l7.9 6.1C12.2 13.2 17.6 9.5 24 9.5Z"/><path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.1 5.3-4.6 7l7.1 5.5c4.2-3.9 6.6-9.6 6.6-16.9Z"/><path fill="#FBBC05" d="M10.4 28.3c-.5-1.5-.8-3-.8-4.6s.3-3.1.8-4.6l-7.9-6.1C.9 16.3 0 20 0 24s.9 7.7 2.5 11l7.9-6.1Z"/><path fill="#34A853" d="M24 48c6.2 0 11.5-2 15.3-5.5l-7.1-5.5c-2 1.3-4.5 2.1-8.2 2.1-6.4 0-11.8-3.7-13.6-9.3l-7.9 6.1C6.4 42.6 14.6 48 24 48Z"/></svg>
      {children}
    </button>
  );
}
function SyncPill({ status, onRetry }) {
  const map = {
    demo: ["", "Demo mode"], signedout: ["", "Not signed in"],
    saving: ["saving", "Saving…"], saved: ["saved", "Saved to Drive"], offline: ["offline", "Sync failed"],
  };
  const [cls, label] = map[status] || ["", ""];
  return (
    <span className={`sync ${cls}`} style={{ cursor: status === "offline" ? "pointer" : "default" }}
      onClick={status === "offline" ? onRetry : undefined}
      title={status === "offline" ? "Click to retry" : undefined}>
      <span className="dot" />{label}{status === "offline" && <span style={{ fontSize: 11, marginLeft: 4, opacity: .8 }}>↺ retry</span>}
    </span>
  );
}

/* ---------------- landing page ---------------- */
function Landing({ onSignIn, signingIn }) {
  const FEATURES = [
    { icon: "calendar", title: "Day-by-day planning", desc: "Your whole trip laid out as a smart timetable. Drag to reorder, move stops between days." },
    { icon: "map",      title: "Interactive map",     desc: "Every stop pinned and numbered. Switch to a single day to see the day's route." },
    { icon: "wallet",   title: "Budget tracker",      desc: "Log expenses, track by category, see what's left at a glance." },
    { icon: "luggage",  title: "Packing list",        desc: "A shareable checklist so nothing gets left behind." },
  ];
  return (
    <div className="landing">
      {/* left — hero */}
      <div className="landing-hero">
        <div className="landing-wordmark">
          <svg width="38" height="38" viewBox="0 0 100 100" aria-hidden="true">
            <defs><linearGradient id="lg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#E4572E"/><stop offset="1" stopColor="#F0A03F"/></linearGradient></defs>
            <rect width="100" height="100" rx="22" fill="url(#lg)"/>
            <polygon fill="#fff" points="50,8 54.4,39.4 69.1,30.9 60.6,45.6 92,50 60.6,54.4 69.1,69.1 54.4,60.6 50,92 45.6,60.6 30.9,69.1 39.4,54.4 8,50 39.4,45.6 30.9,30.9 45.6,39.4"/>
          </svg>
          <span>Lodestar</span>
        </div>
        <h1 className="landing-headline">Every trip,<br /><em>perfectly charted.</em></h1>
        <p className="landing-sub">Plan your itinerary day by day, map every stop, track your budget, and keep your packing list — all saved privately to your own Google Drive.</p>
        <div className="feature-list">
          {FEATURES.map((f) => (
            <div className="feature-item" key={f.icon}>
              <div className="f-ico"><Ic name={f.icon} size={17} /></div>
              <div><strong>{f.title}</strong>{f.desc}</div>
            </div>
          ))}
        </div>
      </div>
      {/* right — sign-in card */}
      <div className="landing-panel">
        <div className="landing-card">
          <h2>Welcome back</h2>
          <p>Sign in to load your trips, or get started planning your first one. Your data stays in your Google Drive — Lodestar only touches files it creates.</p>
          {signingIn
            ? <div className="sign-in-loading"><div className="spinner" /><span>Signing in…</span></div>
            : <GoogleBtn onClick={onSignIn} className="gbtn gbtn-full">Sign in with Google</GoogleBtn>}
          <p className="landing-fine">
            Lodestar uses the <code>drive.file</code> permission — it can only read and write files it creates. It cannot see any other files in your Drive.<br /><br />
            Your trips are stored at <code>My Drive / Applications / Lodestar / data.json</code>.
          </p>
        </div>
      </div>
    </div>
  );
}
function App() {
  const store = useStore();
  const _drag = useRef(null);
  const _dragPlace = useRef(null);
  const [view, setView] = useState("trips");
  const [tripId, setTripId] = useState(null);
  const [tripEditor, setTripEditor] = useState(null); // null | "new" | tripObj
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState("demo");
  const [signingIn, setSigningIn] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [toasts, setToasts] = useState([]);
  const saveTimer = useRef();
  const fileInput = useRef();
  const theme = store.data.settings && store.data.settings.theme;

  const toast = useCallback((msg, err) => {
    const id = uid(); setToasts((t) => [...t, { id, msg, err }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2600);
  }, []);

  // theme
  useEffect(() => {
    let t = theme;
    if (!t) t = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", t);
  }, [theme]);

  // favicon (gradient badge + white compass star)
  useEffect(() => {
    const svg = "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='#E4572E'/><stop offset='1' stop-color='#F0A03F'/></linearGradient></defs><rect width='100' height='100' rx='24' fill='url(#g)'/><polygon points='50,8 54.4,39.4 69.1,30.9 60.6,45.6 92,50 60.6,54.4 69.1,69.1 54.4,60.6 50,92 45.6,60.6 30.9,69.1 39.4,54.4 8,50 39.4,45.6 30.9,30.9 45.6,39.4' fill='#fff'/></svg>";
    let link = document.querySelector("link[rel='icon']");
    if (!link) { link = document.createElement("link"); link.rel = "icon"; document.head.appendChild(link); }
    link.type = "image/svg+xml";
    link.href = "data:image/svg+xml," + encodeURIComponent(svg);
  }, []);
  const toggleTheme = () => {
    const cur = document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
    store.setData((d) => ({ ...d, settings: { ...(d.settings || {}), theme: cur === "dark" ? "light" : "dark" } }));
  };

  const driveReady = useRef(false); // true only after first successful load

  // load remote data (after auth)
  const loadData = useCallback(async () => {
    try {
      const remote = await Cloud.load();
      if (remote && Array.isArray(remote.trips)) store.setData(remote);
      else {
        const empty = { version: 1, settings: store.data.settings || {}, trips: [] };
        store.setData(empty);
        await Cloud.save(empty);
      }
      driveReady.current = true;
      setStatus("saved");
    } catch (e) {
      driveReady.current = false;
      const msg = String(e && e.message || "");
      if (msg.includes("403")) {
        setStatus("offline");
        toast("Drive API not enabled — see README step 1", true);
      } else if (msg.includes("401")) {
        setStatus("signedout");
        toast("Auth expired — please sign in again", true);
      } else {
        setStatus("offline");
        toast("Couldn't reach Drive", true);
      }
    }
  }, [store, toast]);

  // startup: silent sign-in if configured
  useEffect(() => {
    if (!Cloud.configured()) { setStatus("demo"); return; }
    setStatus("signedout");
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client"; s.async = true;
    s.onload = async () => {
      try { await Cloud.silentToken(); const p = await Cloud.profile(); setUser(p); await loadData(); }
      catch (e) { setStatus("signedout"); }
    };
    s.onerror = () => setStatus("demo");
    document.body.appendChild(s);
  }, []); // eslint-disable-line

  // autosave — only fires after drive is ready (prevents race on sign-in)
  useEffect(() => {
    if (!user || !driveReady.current) return;
    setStatus("saving");
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try { await Cloud.save(store.data); setStatus("saved"); }
      catch (e) { setStatus("offline"); toast("Drive sync failed", true); }
    }, 1200);
    return () => clearTimeout(saveTimer.current);
  }, [store.data, user]);

  const signIn = async () => {
    try { setSigningIn(true); setStatus("saving"); const p = await Cloud.signIn(); setUser(p); await loadData(); toast("Signed in"); }
    catch (e) { setStatus(Cloud.configured() ? "signedout" : "demo"); toast("Sign-in didn't complete", true); }
    finally { setSigningIn(false); }
  };
  const signOut = () => { Cloud.signOut(); setUser(null); setMenuOpen(false); setStatus(Cloud.configured() ? "signedout" : "demo"); store.setData(demoData()); setView("trips"); };

  const exportJson = () => {
    setMenuOpen(false);
    const blob = new Blob([JSON.stringify(store.data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob); const a = document.createElement("a");
    a.href = url; a.download = "lodestar-" + todayISO() + ".json"; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const importJson = (e) => {
    const f = e.target.files && e.target.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = () => { try { const j = JSON.parse(r.result); if (j && Array.isArray(j.trips)) { store.setData(j); toast("Trips imported"); } else toast("That file isn't a Lodestar backup", true); } catch (err) { toast("Couldn't read that file", true); } };
    r.readAsText(f); e.target.value = "";
  };

  const openTrip = (id) => { setTripId(id); setView("trip"); window.scrollTo && window.scrollTo(0, 0); };
  const goTrips = () => { setView("trips"); };
  const curTheme = document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";

  // Not signed in → full-screen landing page
  if (Cloud.configured() && !user) {
    return (
      <>
        <Landing onSignIn={signIn} signingIn={signingIn} />
        <div className="toast-wrap">{toasts.map((t) => <div key={t.id} className={`toast ${t.err ? "err" : ""}`}><Ic name={t.err ? "close" : "compass"} size={15} />{t.msg}</div>)}</div>
      </>
    );
  }

  return (
    <StoreCtx.Provider value={{ ...store, _drag, _dragPlace }}>
      <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true"><defs><linearGradient id="lodestar-grad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#E4572E" /><stop offset="1" stopColor="#F0A03F" /></linearGradient></defs></svg>
      <div className="app">
        <nav className="nav">
          <div className="brand" title="Lodestar"><StarMark size={24} /></div>
          <button className={`nav-btn ${view === "trips" ? "on" : ""}`} onClick={goTrips} title="Trips"><Ic name="compass" size={22} /></button>
          <div className="nav-spacer" />
          <button className="nav-btn" onClick={toggleTheme} title="Toggle theme"><Ic name={curTheme === "dark" ? "sun" : "moon"} size={20} /></button>
        </nav>

        <div className="main">
          <div className="topbar">
            {view === "trip"
              ? <div className="crumb"><button className="back" onClick={goTrips} title="All trips"><Ic name="back" size={18} /></button><span className="crumb-title">{(store.data.trips.find((t) => t.id === tripId) || {}).name || "Trip"}</span></div>
              : <div className="crumb"><StarMark size={22} fill="url(#lodestar-grad)" /><h1>Lodestar</h1></div>}
            <span className="spacer" />
            <SyncPill status={status} onRetry={loadData} />
            <div style={{ position: "relative" }}>
              {user
                ? (user.picture ? <img className="avatar" src={user.picture} alt="" referrerPolicy="no-referrer" onClick={() => setMenuOpen((o) => !o)} style={{ cursor: "pointer" }} />
                  : <div className="avatar-fallback" onClick={() => setMenuOpen((o) => !o)} style={{ cursor: "pointer" }}>{(user.name || "?")[0]}</div>)
                : (Cloud.configured()
                  ? <GoogleBtn onClick={signIn}>Sign in</GoogleBtn>
                  : <button className="btn icon-btn btn-ghost" onClick={() => setMenuOpen((o) => !o)} title="Menu"><Ic name="wallet" size={18} /></button>)}
              {menuOpen && <>
                <div style={{ position: "fixed", inset: 0, zIndex: 40 }} onClick={() => setMenuOpen(false)} />
                <div style={{ position: "absolute", right: 0, top: "calc(100% + 8px)", background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 14, boxShadow: "var(--shadow-3)", padding: 6, width: 210, zIndex: 41 }}>
                  {user && <div style={{ padding: "8px 12px", borderBottom: "1px solid var(--line)", marginBottom: 4 }}><div style={{ fontWeight: 650, fontSize: 14 }}>{user.name}</div><div style={{ fontSize: 12, color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis" }}>{user.email}</div></div>}
                  <button className="btn btn-ghost" style={{ width: "100%", justifyContent: "flex-start" }} onClick={exportJson}><Ic name="download" size={16} /> Export backup</button>
                  <button className="btn btn-ghost" style={{ width: "100%", justifyContent: "flex-start" }} onClick={() => { setMenuOpen(false); fileInput.current.click(); }}><Ic name="upload" size={16} /> Import backup</button>
                  {user && <button className="btn btn-ghost" style={{ width: "100%", justifyContent: "flex-start", color: "var(--danger)" }} onClick={signOut}><Ic name="back" size={16} /> Sign out</button>}
                </div>
              </>}
            </div>
          </div>

          {status === "offline" && (
            <div style={{ background: "var(--warm-soft)", borderBottom: "1px solid color-mix(in srgb,var(--warm) 30%,transparent)", padding: "10px var(--pad)", display: "flex", alignItems: "center", gap: 12, fontSize: 13.5 }}>
              <Ic name="note" size={16} />
              <span style={{ flex: 1 }}>
                <strong>Google Drive sync failed.</strong> Most likely the Drive API isn't enabled in your Cloud project yet. <a href="https://console.cloud.google.com/apis/library/drive.googleapis.com" target="_blank" rel="noopener" style={{ color: "var(--warm)" }}>Enable it here →</a>
              </span>
              <button className="btn btn-sm" onClick={loadData}><Ic name="search" size={14} /> Retry</button>
            </div>
          )}
            ? <div>
                <TripsView onOpen={openTrip} onNew={() => setTripEditor("new")} />
              </div>
            : <TripView tripId={tripId} onBack={goTrips} onEditTrip={(t) => setTripEditor(t)} />}
        </div>
      </div>

      {tripEditor && <TripEditor trip={tripEditor === "new" ? null : tripEditor} onClose={() => setTripEditor(null)} />}
      <input ref={fileInput} type="file" accept="application/json,.json" style={{ display: "none" }} onChange={importJson} />
      <div className="toast-wrap">{toasts.map((t) => <div key={t.id} className={`toast ${t.err ? "err" : ""}`}><Ic name={t.err ? "close" : "compass"} size={15} />{t.msg}</div>)}</div>
    </StoreCtx.Provider>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
