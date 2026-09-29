/* DEFINITIVE click audit.
   - Tags only button / a / [role=button] (real clickable controls).
   - ACCEPTS confirm/prompt dialogs (so confirm()-guarded handlers really run).
   - Detects popups (window.open) and downloads (anchor click / createObjectURL).
   - Tests header back/cog, bottom nav, label file-inputs and selects explicitly.
   A control is reported dead ONLY if clicking it changes nothing at all. */
import puppeteer from 'puppeteer-core';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const URL = 'http://localhost:5173/';
const sleep = ms => new Promise(r => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  protocolTimeout: 45000,
  args: ['--no-sandbox', '--window-size=430,900'],
  defaultViewport: { width: 430, height: 900 },
});
const page = await browser.newPage();
await page.addStyleTag({ content: `* { transition: none !important; animation: none !important; }` });

const jsErrors = [];
page.on('pageerror', e => jsErrors.push(String(e.message).slice(0, 160)));
page.on('console', m => { if (m.type() === 'error') jsErrors.push('console: ' + m.text().slice(0, 160)); });
// accept confirms (so handlers run) and answer prompts with a number
page.on('dialog', async d => {
  lastDialog = d.message();
  if (d.type() === 'prompt') await d.accept('5000');
  else await d.accept();
});
let lastDialog = '';

// instrument popups + downloads BEFORE navigation
await page.evaluateOnNewDocument(() => {
  window.__popup = false; window.__download = false;
  const oo = window.open;
  window.open = function (...a) { window.__popup = true; return oo.apply(this, a); };
  const oc = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function (...a) { window.__download = true; return oc.apply(this, a); };
});

await page.goto(URL, { waitUntil: 'networkidle0' });
await sleep(300);

/* First run: the app opens on the login setup screen — create the master PIN so
   the rest of the audit runs logged-in. */
async function ensureLogin() {
  const isSetup = await page.evaluate(() =>
    !![...document.querySelectorAll('button')].find(b => (b.innerText || '').toLowerCase().includes('create login')));
  if (isSetup) {
    for (const i of await page.$$('input[type="password"]')) await i.type('1234', { delay: 10 });
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find(x => (x.innerText || '').toLowerCase().includes('create login'));
      b && b.click();
    });
    await sleep(500);
    return;
  }
  // returning session: already authenticated
  const onLogin = await page.evaluate(() => !!document.querySelector('input[type="password"]'));
  if (!onLogin) return;
  // pick the first account, then PIN in
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find(x => x.querySelector('img') && x.querySelector('svg'));
    b && b.click();
  });
  await sleep(300);
  const pw = await page.$('input[type="password"]');
  if (pw) { await pw.type('1234', { delay: 10 }); await page.keyboard.press('Enter'); await sleep(500); }
}
await ensureLogin();

const COLLECT = `(() => {
  document.querySelectorAll('[data-audit-id]').forEach(e => e.removeAttribute('data-audit-id'));
  const out = []; let n = 0;
  for (const el of document.querySelectorAll('button, a, [role="button"]')) {
    const key = Object.keys(el).find(k => k.startsWith('__reactProps$'));
    if (!key) continue;
    const p = el[key];
    if (!p || typeof p.onClick !== 'function') continue;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    const visible = r.width>1 && r.height>1 && cs.visibility!=='hidden' && cs.display!=='none' && cs.opacity!=='0';
    if (!visible) continue;
    el.setAttribute('data-audit-id', 'a' + (++n));
    out.push({
      id: 'a' + n,
      text: (el.innerText || el.getAttribute('title') || '').trim().replace(/\\s+/g,' ').slice(0,50),
      cls: (el.className || '').toString().replace(/\\s+/g,' ').slice(0,45),
      tag: el.tagName.toLowerCase(),
      w: Math.round(r.width), h: Math.round(r.height),
      disabled: el.disabled === true,
      pe: cs.pointerEvents,
      inModal: !!el.closest('.fixed.inset-0'),
      inNav: !!el.closest('.fixed.bottom-0'),
      inHeader: !!el.closest('.sticky.top-0'),
    });
  }
  return out;
})()`;

const rootHTML = () => page.evaluate(() => document.getElementById('root')?.innerHTML ?? '');
const screenName = () => page.evaluate(() => document.querySelector('.sticky.top-0 h1')?.textContent ?? '');
const modalOpen = () => page.evaluate(() => !!document.querySelector('.fixed.inset-0'));
const flags = () => page.evaluate(() => ({ popup: window.__popup, download: window.__download }));

const problems = [];
const clicked = new Set();
let tested = 0, dead = 0;
let cur = '?';

async function clickOne(item) {
  const res = await page.evaluate((id) => {
    const el = document.querySelector('[data-audit-id="' + id + '"]');
    if (!el) return { gone: true };
    el.scrollIntoView({ block: 'center', behavior: 'instant' });
    const r = el.getBoundingClientRect();
    const x = r.left + r.width/2, y = r.top + r.height/2;
    const inView = y >= 2 && y <= innerHeight-2 && x >= 2 && x <= innerWidth-2;
    const hit = document.elementFromPoint(Math.min(innerWidth-1,Math.max(0,x)), Math.min(innerHeight-1,Math.max(0,y)));
    const covered = hit && !(el.contains(hit) || hit.contains(el));
    return { gone: false, inView,
      coveredBy: covered ? hit.tagName + '.' + String(hit.className||'').replace(/\\s+/g,' ').slice(0,40) : null,
      pe: getComputedStyle(el).pointerEvents,
      rect: { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) } };
  }, item.id);

  if (res.gone) return 'gone';
  if (!res.inView) { problems.push({ screen: cur, text: item.text, reasons: ['OFF-SCREEN'] }); return 'dead'; }
  if (res.pe === 'none') { problems.push({ screen: cur, text: item.text, reasons: ['pointer-events:none'] }); return 'dead'; }
  if (res.coveredBy) { problems.push({ screen: cur, text: item.text, reasons: ['COVERED by ' + res.coveredBy] }); return 'dead'; }
  if (res.rect.w < 12 || res.rect.h < 12) { problems.push({ screen: cur, text: item.text, reasons: ['tiny ' + res.rect.w + 'x' + res.rect.h] }); return 'dead'; }

  const before = await rootHTML();
  const scrBefore = await screenName();
  const f0 = await flags();
  jsErrors.length = 0; lastDialog = '';
  await page.evaluate((id) => { const el = document.querySelector('[data-audit-id="' + id + '"]'); if (el) el.click(); }, item.id);
  await sleep(280);
  const after = await rootHTML();
  const scrAfter = await screenName();
  const f1 = await flags();
  if (scrAfter !== scrBefore) return 'nav';
  const err = jsErrors.join(' | ');
  if (err) { problems.push({ screen: cur, text: item.text, reasons: ['JS ERROR ' + err] }); return 'dead'; }
  if (before === after && !lastDialog && !f1.popup && !f1.download) {
    problems.push({ screen: cur, text: item.text, reasons: ['CLICK NO-OP'] }); return 'dead';
  }
  return 'ok';
}

async function closeModal() {
  await page.evaluate(() => {
    const m = document.querySelector('.fixed.inset-0');
    if (!m) return;
    const x = [...m.querySelectorAll('button')].find(b => (b.innerText||'').trim().toLowerCase().startsWith('cancel')) || m.querySelector('button');
    if (x) x.click();
  });
  await sleep(250);
}

async function auditScreen(name) {
  cur = name;
  for (let iter = 0; iter < 300; iter++) {
    const items = await page.evaluate(COLLECT);
    const open = await modalOpen();
    const skip = ['reset all data', 'log out', 'change pin'];
    const pool = items.filter(i => open ? i.inModal : (!i.inModal && !i.inNav && !i.inHeader && !skip.some(s => i.text.toLowerCase().includes(s))));
    const next = pool.find(i => !i.disabled && !clicked.has(i.id + '|' + i.text));
    if (!next) { if (open) { await closeModal(); continue; } break; }
    clicked.add(next.id + '|' + next.text);
    tested++;
    const r = await clickOne(next);
    if (r === 'dead') dead++;
    if (r === 'nav') break;
    await sleep(40);
  }
}

async function go(navLabel) {
  await page.evaluate((l) => { const b = [...document.querySelectorAll('.fixed.bottom-0 button')].find(x => (x.innerText||'').trim().toLowerCase().startsWith(l)); b && b.click(); }, navLabel.toLowerCase());
  await sleep(400);
}

// header chrome (back + cog) on a non-dashboard page
async function testHeader() {
  cur = 'header';
  await go('clients');
  const back = await page.evaluate(() => {
    const b = document.querySelector('.sticky.top-0 button');
    if (!b) return 'NO BACK BTN';
    const before = document.querySelector('.sticky.top-0 h1')?.textContent;
    b.click();
    return before;
  });
  await sleep(300);
  const after = await screenName();
  if (back !== "Master's Eye" && after !== "Master's Eye") problems.push({ screen: 'header', text: 'BACK', reasons: ['did not return home'] });
  // settings via the nav bar (there is no cog in the header anymore)
  await go('more');
  if ((await screenName()) !== 'Settings') problems.push({ screen: 'header', text: 'SETTINGS', reasons: ['nav More did not open settings'] });
  await go('home');
}

// label file inputs & selects (they live inside modals — open them first)
async function openModal(btnText) {
  return page.evaluate((t) => {
    const b = [...document.querySelectorAll('button')].find(x => (x.innerText || '').toLowerCase().includes(t));
    if (!b) return false; b.click(); return true;
  }, btnText);
}

async function testInputs() {
  cur = 'inputs';
  // PhotoInput label lives in the New Client modal
  await go('clients');
  if (!(await openModal('new client'))) { problems.push({ screen: 'inputs', text: 'New Client', reasons: ['button missing'] }); }
  await sleep(350);
  const labelWorks = await page.evaluate(() => {
    const l = document.querySelector('label[class*="cursor-pointer"]');
    if (!l) return 'NO LABEL';
    const r = l.getBoundingClientRect();
    return r.width > 0 ? 'ok' : 'zero-size';
  });
  if (labelWorks !== 'ok') problems.push({ screen: 'inputs', text: 'PhotoInput label', reasons: [labelWorks] });
  await closeModal();
  // selects live in the New Order modal
  await go('home');
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => (x.innerText || '').toLowerCase().includes('orders')); b && b.click(); });
  await sleep(400);
  if (!(await openModal('new order'))) { problems.push({ screen: 'inputs', text: 'New Order', reasons: ['button missing'] }); }
  await sleep(350);
  const sel = await page.evaluate(() => {
    const s = [...document.querySelectorAll('select')].find(x => x.options.length > 1);
    if (!s) return 'NO SELECT';
    const before = s.value;
    s.value = s.options[s.selectedIndex === 0 ? 1 : 0].value;
    s.dispatchEvent(new Event('change', { bubbles: true }));
    return { before, after: s.value };
  });
  if (sel === 'NO SELECT') problems.push({ screen: 'inputs', text: 'select', reasons: ['none found'] });
  else if (sel.before === sel.after) problems.push({ screen: 'inputs', text: 'select', reasons: ['change did nothing'] });
  await closeModal();
  await go('home');
}

// ── auth: change PIN, log out, old PIN rejected, new PIN gets back in ──
async function testAuth() {
  cur = 'auth';
  await go('more');

  // change the master's PIN via the account card (prompt is answered '5000' by the dialog handler)
  const pinChanged = await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find(x => (x.innerText || '').toLowerCase().includes('change pin'));
    if (!b) return false; b.click(); return true;
  });
  await sleep(400);
  console.log('[auth] change-pin clicked:', pinChanged);
  if (!pinChanged) problems.push({ screen: 'auth', text: 'CHANGE PIN', reasons: ['button missing'] });

  const out = await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find(x => (x.innerText || '').toLowerCase().includes('log out'));
    if (!b) return false; b.click(); return true;
  });
  await sleep(400);
  console.log('[auth] logout clicked:', out);
  if (!out) { problems.push({ screen: 'auth', text: 'LOG OUT', reasons: ['button missing'] }); return; }

  const onGate = await page.evaluate(() =>
    !![...document.querySelectorAll('button')].find(x => x.querySelector('img') && x.querySelector('svg')));
  if (!onGate) { problems.push({ screen: 'auth', text: 'LOGIN GATE', reasons: ['did not show account picker'] }); return; }

  // old PIN must now be rejected
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find(x => x.querySelector('img') && x.querySelector('svg'));
    b && b.click();
  });
  await sleep(300);
  let pw = await page.$('input[type="password"]');
  if (!pw) { problems.push({ screen: 'auth', text: 'PIN INPUT', reasons: ['missing after picking account'] }); return; }
  await pw.type('1234', { delay: 10 });
  await page.keyboard.press('Enter');
  await sleep(500);
  const wrong = await page.evaluate(() => (document.body.innerText || '').toLowerCase().includes('wrong pin'));
  console.log('[auth] old pin rejected:', wrong);
  if (!wrong) problems.push({ screen: 'auth', text: 'OLD PIN', reasons: ['was not rejected after PIN change'] });

  // new PIN gets back in (clear the field via the native value setter — no mouse click)
  pw = await page.$('input[type="password"]');
  if (!pw) { problems.push({ screen: 'auth', text: 'PIN INPUT', reasons: ['gone after failed attempt'] }); return; }
  await page.evaluate(() => {
    const el = document.querySelector('input[type="password"]');
    const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    set.call(el, '');
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  console.log('[auth] field cleared');
  await page.keyboard.type('5000', { delay: 10 });
  await page.keyboard.press('Enter');
  console.log('[auth] new pin typed + Enter');
  await sleep(600);
  const home = (await screenName().catch(() => '(hung)'));
  console.log('[auth] screen after new pin:', home);
  if (home !== "Master's Eye") problems.push({ screen: 'auth', text: 'CORRECT PIN', reasons: ['did not log in'] });
}

/* destructive on purpose — run LAST: wipe data, logins must survive */
async function testReset() {
  cur = 'reset';
  await go('more');
  const clicked = await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find(x => (x.innerText || '').toLowerCase().includes('reset all data'));
    if (!b) return false; b.click(); return true;
  });
  await sleep(500);
  if (!clicked) { problems.push({ screen: 'reset', text: 'RESET ALL DATA', reasons: ['button missing'] }); return; }
  const st = await page.evaluate(() => { try { return JSON.parse(localStorage.getItem('masters-eye-v2') || '{}'); } catch { return {}; } });
  if ((st.clients?.length || 0) > 0) problems.push({ screen: 'reset', text: 'RESET ALL DATA', reasons: ['clients not wiped'] });
  if (!st.accounts?.length) problems.push({ screen: 'reset', text: 'RESET ALL DATA', reasons: ['logins wiped — master locked out'] });
}

const phase = async (name, fn) => {
  try { await fn(); } catch (e) { problems.push({ screen: name, text: 'PHASE', reasons: ['CRASH ' + String(e.message).slice(0, 120)] }); }
  console.log('[cp] after ' + name + ':', await screenName().catch(() => '(page hung)'));
};

await phase('dashboard', () => auditScreen('dashboard'));
for (const n of ['clients', 'team', 'money', 'more']) { await go(n); await phase('nav:' + n, () => auditScreen('nav:' + n)); }
await phase('header', testHeader);
await phase('inputs', testInputs);

// tiles -> orders / mill / expenses
await go('home');
for (const t of [{ match: 'orders', page: 'orders' }, { match: 'wood mill', page: 'mill' }, { match: 'consumables', page: 'expenses' }]) {
  await phase('tile:' + t.match, async () => {
    const found = await page.evaluate((m) => {
      const b = [...document.querySelectorAll('button')].find(x => (x.innerText||'').toLowerCase().includes(m));
      if (!b) return false; b.click(); return true;
    }, t.match);
    if (!found) { problems.push({ screen: 'dashboard', text: t.match, reasons: ['TILE MISSING'] }); return; }
    await sleep(450);
    await auditScreen(t.page);
    await go('home');
  });
}

await phase('auth', testAuth);
await phase('reset', testReset);

console.log('=== SUMMARY ===');
console.log('tested:', tested, 'dead:', dead);
console.log('=== PROBLEMS (' + problems.length + ') ===');
for (const p of problems) console.log(`[${p.screen}] "${p.text}" → ${p.reasons.join(' ; ')}`);
await browser.close();

