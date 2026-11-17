const { app, BrowserWindow, shell } = require('electron');
const path = require('path');
const http = require('http');
const fs = require('fs');
const crypto = require('crypto');

// Dossier "Tableau" (celui qui contient index.html et donnees/), quel que soit le système.
//  Mac     : Tableau/Tableau.app/Contents/Resources/app -> 4 niveaux
//  Windows : Tableau/Windows/resources/app              -> 3 niveaux
const DIR = process.env.TABLEAU_DIR || path.resolve(__dirname, process.platform === 'darwin' ? '../../../..' : '../../..');
const DATA = path.join(DIR, 'donnees');
const PORT = 8765, ORIGIN = `127.0.0.1:${PORT}`;
const COLS = ['postits', 'meetings', 'boards'];
const OK_ID = /^[A-Za-z0-9_-]{1,80}$/;

/* Une note = un fichier (donnees/<collection>/<id>.json). Deux ordinateurs qui modifient
   des notes différentes ne se gênent donc jamais, même si OneDrive met du temps à synchroniser. */
const dirOf = c => path.join(DATA, c);
const fileOf = (c, id) => path.join(dirOf(c), id + '.json');

function writeAtomic(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = path.join(path.dirname(file), '.' + path.basename(file) + '.' + process.pid + '.tmp');
  fs.writeFileSync(tmp, text, 'utf-8');
  fs.renameSync(tmp, file);
}
function migrate() {
  const old = path.join(DATA, 'tableau.json');
  if (!fs.existsSync(old) || COLS.some(c => fs.existsSync(dirOf(c)))) return;
  let d = {};
  try { d = JSON.parse(fs.readFileSync(old, 'utf-8')); } catch (e) { return; }
  for (const c of COLS) {
    fs.mkdirSync(dirOf(c), { recursive: true });
    for (const [id, rec] of Object.entries(d[c] || {})) if (OK_ID.test(id)) writeAtomic(fileOf(c, id), JSON.stringify(rec, null, 1));
  }
  fs.renameSync(old, old + '.migre');
}
function list(c) {
  try { return fs.readdirSync(dirOf(c)).filter(f => /^[A-Za-z0-9_-]+\.json$/.test(f)); } catch (e) { return []; }
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function readJSON(f) {
  let last;
  for (let k = 0; k < 15; k++) {
    try { return JSON.parse(await fs.promises.readFile(f, 'utf-8')); }
    catch (e) {
      last = e;
      if (e.code === 'ENOENT') return undefined;
      if (e instanceof SyntaxError && k >= 3) break;
      await sleep(400);   // OneDrive télécharge le fichier : on réessaie
    }
  }
  throw last;
}
async function load() {
  const d = {}; let failed = 0;
  await Promise.all(COLS.map(async c => {
    d[c] = {};
    await Promise.all(list(c).map(async f => {
      try { const r = await readJSON(path.join(dirOf(c), f)); if (r !== undefined) d[c][f.slice(0, -5)] = r; }
      catch (e) { failed++; }
    }));
  }));
  return { d, failed };
}
function version() {
  const h = crypto.createHash('md5');
  for (const c of COLS) for (const f of list(c)) {
    try { const s = fs.statSync(path.join(dirOf(c), f)); h.update(`${c}/${f}:${s.mtimeMs}:${s.size};`); } catch (e) {}
  }
  return h.digest('hex');
}
function send(res, code, body, type = 'application/json') {
  const b = Buffer.isBuffer(body) ? body : Buffer.from(body, 'utf-8');
  res.writeHead(code, { 'Content-Type': type + '; charset=utf-8', 'Content-Length': b.length, 'Cache-Control': 'no-store' });
  res.end(b);
}

const server = http.createServer((req, res) => {
  const host = req.headers.host || '';
  if (host !== ORIGIN && host !== `localhost:${PORT}`) return send(res, 403, '{}');
  const [p, q = ''] = req.url.split('?');
  if (req.method === 'GET') {
    if (p === '/' || p === '/index.html') return send(res, 200, fs.readFileSync(path.join(DIR, 'index.html')), 'text/html');
    if (p === '/api/ping') return send(res, 200, '{"ok":true}');
    if (p === '/api/data') {
      const v = version();
      if (q === 'v=' + v) return send(res, 200, JSON.stringify({ v, same: true }));
      load().then(({ d, failed }) => {
        // un fichier illisible (synchronisation en cours) : on n'envoie rien plutôt qu'un tableau amputé
        if (failed) return send(res, 503, '{"retry":true}');
        send(res, 200, JSON.stringify({ v, data: d }));
      }).catch(() => send(res, 503, '{"retry":true}'));
      return;
    }
    return send(res, 404, '{}');
  }
  if (req.method === 'POST' && p === '/api/op') {
    if (!(req.headers['content-type'] || '').includes('application/json')) return send(res, 415, '{}');
    let body = '';
    req.on('data', c => { body += c; if (body.length > 5e6) req.destroy(); });
    req.on('end', async () => {
      let op, col, id, kind;
      try {
        op = JSON.parse(body); col = op.col; id = String(op.id); kind = op.op;
        if (!COLS.includes(col) || !OK_ID.test(id)) throw new Error('bad');
      } catch (e) { return send(res, 400, '{}'); }
      const f = fileOf(col, id);
      try {
        if (kind === 'set') writeAtomic(f, JSON.stringify(op.data, null, 1));
        else if (kind === 'update') {
          let cur; try { cur = await readJSON(f); } catch (e) { return send(res, 503, '{"retry":true}'); }
          if (cur === undefined) return send(res, 404, '{}');
          writeAtomic(f, JSON.stringify(Object.assign(cur, op.data), null, 1));
        } else if (kind === 'delete') { try { fs.unlinkSync(f); } catch (e) {} }
        else return send(res, 400, '{}');
      } catch (e) { return send(res, 500, '{}'); }
      send(res, 200, JSON.stringify({ v: version() }));
    });
    return;
  }
  send(res, 403, '{}');
});

if (!app.requestSingleInstanceLock()) app.quit();
let win = null;
app.setName('Tableau');
app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
app.whenReady().then(() => {
  migrate();
  server.on('error', e => { console.error(e); });
  server.listen(PORT, '127.0.0.1', () => {
    win = new BrowserWindow({ width: 1400, height: 900, title: 'Tableau', backgroundColor: '#faf7f2', icon: path.join(__dirname, 'icon.png') });
    win.setMenuBarVisibility(false);
    win.webContents.setVisualZoomLevelLimits(1, 1);
    win.loadURL(`http://${ORIGIN}/`);
    win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  });
});
app.on('window-all-closed', () => app.quit());
app.on('quit', () => server.close());
