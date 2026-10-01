/* ═══════════════════════════════════════════════════════════════════════
   THE MASTER'S EYE — server
   Your Google Drive plays the server: this script owns one spreadsheet
   (accounts + logs + config) and one backup file per username.

   ONE-TIME SETUP (about two minutes):
   1. Go to script.google.com → New project.
   2. Delete whatever is in Code.gs and paste this whole file.
   3. Deploy → New deployment → type "Web app":
        Execute as:  Me
        Who has access:  Anyone
   4. Authorise (Advanced → Go to project (unsafe) is normal for your own
      script) and copy the /exec URL it gives you.
   5. Paste that URL into The Master's Eye → Settings → Cloud server.
   6. In the app's Dev console, type an Admin key and press Save key —
      this script stores it and every admin call must carry it.

   First run creates the spreadsheet called "Master's Eye Server" in your
   Drive. Nothing else to configure.
   ═══════════════════════════════════════════════════════════════════════ */

var SS_PROP = 'mastersEyeSheetId';
var KEY_PROP = 'mastersEyeMasterKey';

var T_USERS = 'Users';
var T_LOGS = 'Logs';
var T_DEVICES = 'Devices';
var T_CONFIG = 'Config';

var ONLINE_MS = 5 * 60 * 1000; // a device seen in the last 5 minutes = online

/* ── entry points ─────────────────────────────────────────────────────── */

function doGet(e) {
  var p = {};
  try {
    p = (e && e.parameter && e.parameter.p) ? JSON.parse(e.parameter.p) : (e && e.parameter) || {};
  } catch (err) { p = {}; }
  return handle_(p);
}

function doPost(e) {
  var p = {};
  try {
    p = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (err) {
    try { p = (e && e.parameter) || {}; } catch (err2) { p = {}; }
  }
  return handle_(p);
}

function out_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ── dispatcher ────────────────────────────────────────────────────────── */

function handle_(p) {
  try {
    var op = String(p.op || 'ping');
    if (op === 'ping') return out_({ ok: true, server: 'masters-eye', now: now_() });

    var ss = getSS_();

    if (op === 'directory') return out_({ ok: true, accounts: readUsers_(ss) });
    if (op === 'register') return opRegister_(ss, p);
    if (op === 'login') return opLogin_(ss, p);
    if (op === 'heartbeat') return opHeartbeat_(ss, p);
    if (op === 'install') return opInstall_(ss, p);
    if (op === 'backup') return opBackup_(ss, p);
    if (op === 'backuppart') return opBackupPart_(ss, p);
    if (op === 'backupend') return opBackupEnd_(ss, p);
    if (op === 'restore') return opRestore_(ss, p);
    if (op === 'update') return opUpdate_(ss, p);
    if (op === 'setpass') return opSetPass_(ss, p);

    // admin ops below — everything needs the key saved from the app console
    if (op === 'setupkey') return opSetupKey_(ss, p);
    if (op === 'logs') { admin_(ss, p); return opLogs_(ss, p); }
    if (op === 'stats') { admin_(ss, p); return opStats_(ss, p); }
    if (op === 'users') { admin_(ss, p); return out_({ ok: true, users: readUsers_(ss) }); }
    if (op === 'reset') { admin_(ss, p); return opReset_(ss, p); }
    if (op === 'setupdate') { admin_(ss, p); return opSetUpdate_(ss, p); }

    return out_({ ok: false, error: 'Unknown op: ' + op });
  } catch (err) {
    return out_({ ok: false, error: String((err && err.message) || err) });
  }
}

/* ── spreadsheet bootstrap ─────────────────────────────────────────────── */

function getSS_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty(SS_PROP);
  if (id) {
    try { return SpreadsheetApp.openById(id); } catch (err) { /* recreated below */ }
  }
  var ss = SpreadsheetApp.create("Master's Eye Server");
  mk_(ss, T_USERS, ['id', 'username', 'name', 'role', 'pinHash', 'photo', 'link', 'created', 'lastSeen']);
  mk_(ss, T_LOGS, ['time', 'username', 'result', 'device', 'version']);
  mk_(ss, T_DEVICES, ['deviceId', 'deviceName', 'version', 'firstSeen', 'lastSeen', 'username']);
  mk_(ss, T_CONFIG, ['key', 'value']);
  props.setProperty(SS_PROP, ss.getId());
  return ss;
}

function mk_(ss, name, headers) {
  var sh = ss.insertSheet(name);
  sh.appendRow(headers);
  sh.setFrozenRows(1);
  return sh;
}

function sh_(ss, name) {
  var sh = ss.getSheetByName(name);
  if (!sh) throw new Error('Sheet "' + name + '" is missing — delete the Script Properties key "' + SS_PROP + '" and run again.');
  return sh;
}

function now_() { return new Date().toISOString(); }

function cfgGet_(ss, key) {
  var rows = sh_(ss, T_CONFIG).getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) if (String(rows[i][0]) === key) return String(rows[i][1]);
  return '';
}

function cfgSet_(ss, key, value) {
  var sh = sh_(ss, T_CONFIG);
  var rows = sh.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === key) { sh.getRange(i + 1, 2).setValue(String(value)); return; }
  }
  sh.appendRow([key, String(value)]);
}

function admin_(ss, p) {
  var stored = cfgGet_(ss, KEY_PROP);
  if (!stored) throw new Error('No admin key saved yet — type one in the Dev console and press Save key.');
  if (String(p.masterKey || '') !== stored) throw new Error('Wrong admin key.');
}

/* ── users ─────────────────────────────────────────────────────────────── */

function readUsers_(ss) {
  var rows = sh_(ss, T_USERS).getDataRange().getValues();
  var out = [];
  for (var i = 1; i < rows.length; i++) {
    var r = rows[i];
    if (!r[1]) continue;
    out.push({
      id: String(r[0]), username: String(r[1]), name: String(r[2]), role: String(r[3]),
      pinHash: String(r[4]), photo: String(r[5] || ''), link: String(r[6] || ''),
      created: String(r[7] || ''), lastSeen: String(r[8] || '')
    });
  }
  return out;
}

function findUserRow_(ss, username) {
  var rows = sh_(ss, T_USERS).getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][1]).toLowerCase() === username) return i + 1; // 1-based sheet row
  }
  return -1;
}

function setUserCell_(ss, username, col, value) {
  var row = findUserRow_(ss, username);
  if (row < 0) throw new Error('No user "' + username + '".');
  sh_(ss, T_USERS).getRange(row, col).setValue(String(value));
}

function opSetupKey_(ss, p) {
  var key = String(p.masterKey || '');
  if (key.length < 4) return out_({ ok: false, error: 'Admin key must be at least 4 characters.' });
  var stored = cfgGet_(ss, KEY_PROP);
  if (stored && stored !== key) return out_({ ok: false, error: 'An admin key is already set — enter the existing one to change it.' });
  cfgSet_(ss, KEY_PROP, key);
  return out_({ ok: true, saved: true });
}

function opRegister_(ss, p) {
  var u = String(p.username || '').trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,24}$/.test(u)) {
    return out_({ ok: false, error: 'Username: 3–24 letters, numbers, dot, dash or underscore.' });
  }
  if (findUserRow_(ss, u) >= 0) return out_({ ok: false, error: 'That username is taken.' });

  var role = String(p.role || 'user');
  var first = readUsers_(ss).length === 0;
  if (role !== 'user' && !first) admin_(ss, p); // only the master can create other roles

  var id = role + '-' + new Date().getTime() + '-' + Math.random().toString(36).slice(2, 6);
  sh_(ss, T_USERS).appendRow([
    id, u, String(p.name || u), role, String(p.pinHash || ''),
    String(p.photo || ''), String(p.link || ''), now_(), ''
  ]);
  log_(ss, u, 'register', '', String(p.appVersion || ''));
  return out_({ ok: true, account: { id: id, username: u, name: String(p.name || u), role: role } });
}

function opLogin_(ss, p) {
  var u = String(p.username || '').trim().toLowerCase();
  var row = findUserRow_(ss, u);
  var device = String(p.deviceName || '') + '';
  if (row < 0) { log_(ss, u, 'failed: no such user', device, ''); return out_({ ok: false, error: 'No such username.' }); }
  var stored = String(sh_(ss, T_USERS).getRange(row, 5).getValue());
  var ok = stored !== '' && stored === String(p.pinHash || '');
  log_(ss, u, ok ? 'ok' : 'failed: wrong password', device, String(p.appVersion || ''));
  if (!ok) return out_({ ok: false, error: 'Wrong password.' });
  setUserCell_(ss, u, 9, now_());
  upsertDevice_(ss, p, u);
  return out_({ ok: true, account: { id: String(sh_(ss, T_USERS).getRange(row, 1).getValue()), username: u } });
}

function opHeartbeat_(ss, p) {
  var u = String(p.username || '').trim().toLowerCase();
  if (findUserRow_(ss, u) >= 0) setUserCell_(ss, u, 9, now_());
  upsertDevice_(ss, p, u);
  return out_({ ok: true, at: now_() });
}

function opInstall_(ss, p) {
  upsertDevice_(ss, p, '');
  return out_({ ok: true, installs: sh_(ss, T_DEVICES).getLastRow() - 1 });
}

function upsertDevice_(ss, p, username) {
  var did = String(p.deviceId || '');
  if (!did) return;
  var sh = sh_(ss, T_DEVICES);
  var rows = sh.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === did) {
      sh.getRange(i + 1, 3).setValue(String(p.appVersion || rows[i][2] || ''));
      sh.getRange(i + 1, 5).setValue(now_());
      if (username) sh.getRange(i + 1, 6).setValue(username);
      return;
    }
  }
  sh.appendRow([did, String(p.deviceName || ''), String(p.appVersion || ''), now_(), now_(), username]);
}

function log_(ss, username, result, device, version) {
  sh_(ss, T_LOGS).appendRow([now_(), username, result, device, version]);
}

function opLogs_(ss, p) {
  var limit = Math.min(500, Math.max(1, Number(p.limit) || 100));
  var rows = sh_(ss, T_LOGS).getDataRange().getValues();
  var out = [];
  for (var i = rows.length - 1; i >= 1 && out.length < limit; i--) {
    out.push({ t: String(rows[i][0]), user: String(rows[i][1]), result: String(rows[i][2]), device: String(rows[i][3] || '') });
  }
  return out_({ ok: true, logs: out });
}

function opStats_(ss, p) {
  var users = readUsers_(ss).length;
  var drows = sh_(ss, T_DEVICES).getDataRange().getValues();
  var nowMs = Date.now();
  var online = 0, installs = 0;
  for (var i = 1; i < drows.length; i++) {
    installs++;
    var last = Date.parse(String(drows[i][4]));
    if (!isNaN(last) && nowMs - last < ONLINE_MS) online++;
  }
  var lrows = sh_(ss, T_LOGS).getDataRange().getValues();
  var today = now_().slice(0, 10);
  var weekAgo = new Date(nowMs - 7 * 86400000).toISOString().slice(0, 10);
  var t24 = 0, t7 = 0, total = 0;
  for (var j = 1; j < lrows.length; j++) {
    var when = String(lrows[j][0]);
    var res = String(lrows[j][2]);
    if (res !== 'ok') continue;
    total++;
    if (when.slice(0, 10) === today) t24++;
    if (when.slice(0, 10) >= weekAgo) t7++;
  }
  return out_({
    ok: true,
    stats: { users: users, installs: installs, devices: installs, online: online, loginsToday: t24, logins7d: t7, loginsTotal: total }
  });
}

function opReset_(ss, p) {
  var u = String(p.username || '').trim().toLowerCase();
  if (findUserRow_(ss, u) < 0) return out_({ ok: false, error: 'No user "' + u + '".' });
  setUserCell_(ss, u, 5, String(p.pinHash || ''));
  log_(ss, u, 'password reset by master', '', '');
  return out_({ ok: true, reset: true });
}

function opSetPass_(ss, p) {
  var u = String(p.username || '').trim().toLowerCase();
  var row = findUserRow_(ss, u);
  if (row < 0) return out_({ ok: false, error: 'No such username.' });
  var stored = String(sh_(ss, T_USERS).getRange(row, 5).getValue());
  if (stored !== String(p.oldPinHash || '')) return out_({ ok: false, error: 'Current password is wrong.' });
  setUserCell_(ss, u, 5, String(p.newPinHash || ''));
  log_(ss, u, 'password changed', '', '');
  return out_({ ok: true, changed: true });
}

/* ── backups (one JSON file per username, owned by this script) ────────── */

function backupName_(u) { return 'masters-eye/' + u + '.json'; }

function opBackup_(ss, p) {
  var u = String(p.username || '').trim().toLowerCase();
  if (!u) return out_({ ok: false, error: 'No username for the backup.' });
  var data = String(p.data || '');
  writeFile_(backupName_(u), data);
  return out_({ ok: true, at: now_(), bytes: data.length });
}

function opBackupPart_(ss, p) {
  var u = String(p.username || '').trim().toLowerCase();
  var idx = Number(p.idx) || 0;
  writeFile_('masters-eye/' + u + '.part' + idx, String(p.part || ''));
  return out_({ ok: true, idx: idx });
}

function opBackupEnd_(ss, p) {
  var u = String(p.username || '').trim().toLowerCase();
  var total = Number(p.total) || 0;
  var full = '';
  for (var i = 0; i < total; i++) {
    full += readFile_('masters-eye/' + u + '.part' + i);
    removeFile_('masters-eye/' + u + '.part' + i);
  }
  writeFile_(backupName_(u), full);
  return out_({ ok: true, at: now_(), bytes: full.length });
}

function opRestore_(ss, p) {
  var u = String(p.username || '').trim().toLowerCase();
  var txt = readFile_(backupName_(u));
  if (txt === null) return out_({ ok: false, found: false, error: 'No backup for "' + u + '" yet.' });
  try { return out_({ ok: true, data: JSON.parse(txt) }); }
  catch (err) { return out_({ ok: false, error: 'Backup file is damaged.' }); }
}

function findFile_(name) {
  var it = DriveApp.getFilesByName(name);
  return it.hasNext() ? it.next() : null;
}

function writeFile_(name, content) {
  var f = findFile_(name);
  if (f) f.setContent(content);
  else DriveApp.createFile(name, content, 'application/json');
}

function readFile_(name) {
  var f = findFile_(name);
  return f ? f.getBlob().getDataAsString() : null;
}

function removeFile_(name) {
  var it = DriveApp.getFilesByName(name);
  while (it.hasNext()) it.next().setTrashed(true);
}

/* ── update manifest ───────────────────────────────────────────────────── */

function opUpdate_(ss, p) {
  var latest = cfgGet_(ss, 'latestVersion');
  var code = Number(cfgGet_(ss, 'latestCode') || 0);
  if (!latest || !code) return out_({ ok: true, update: null });
  var here = Number(p.version || 0);
  return out_({
    ok: true,
    update: code > here ? { latest: latest, code: code, url: cfgGet_(ss, 'updateUrl'), notes: cfgGet_(ss, 'updateNotes') } : null
  });
}

function opSetUpdate_(ss, p) {
  cfgSet_(ss, 'latestVersion', String(p.latest || ''));
  cfgSet_(ss, 'latestCode', String(Number(p.code) || 0));
  cfgSet_(ss, 'updateUrl', String(p.url || ''));
  cfgSet_(ss, 'updateNotes', String(p.notes || ''));
  return out_({ ok: true, saved: true });
}
