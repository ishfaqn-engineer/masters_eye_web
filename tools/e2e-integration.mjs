/* Runtime end-to-end verification — The Master's Eye.
   Scenario: master setup → spec order → client modal → crew history → wage pay
   → client login → client sees order → client uploads design → master sees it.
   Reuses tools/audit-clicks.mjs patterns: dialog handler, innerText button
   lookup, native value setters for React inputs, waitForFileChooser.
   NEVER touches app source — reads the UI the way a user does. */
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { demoSeed } from './fixtures.mjs';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const URL = 'http://localhost:5173/';
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* minimal valid PNG for the upload steps */
const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const PNG_PATH = path.join(os.tmpdir(), 'e2e-design.png');
fs.writeFileSync(PNG_PATH, Buffer.from(PNG_B64, 'base64'));

const results = [];
const errors = [];
const dialogs = [];

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  protocolTimeout: 60000,
  args: ['--no-sandbox', '--window-size=430,900', '--hide-scrollbars'],
  defaultViewport: { width: 430, height: 900 },
});
const page = await browser.newPage();
await page.evaluateOnNewDocument(demoSeed);
await page.evaluateOnNewDocument(() => {
  const add = () => {
    if (!document.documentElement) return;
    const s = document.createElement('style');
    s.textContent = '* { transition: none !important; animation: none !important; }';
    document.documentElement.appendChild(s);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', add);
  else add();
});

page.on('pageerror', e => errors.push({ kind: 'pageerror', text: String(e.message || e).slice(0, 300) }));
page.on('console', m => {
  if (m.type() !== 'error') return;
  const text = String(m.text()).slice(0, 300);
  const url = (m.location() && m.location().url) || '';
  errors.push({ kind: /^Failed to load resource/i.test(text) ? 'network' : 'console', text, url });
});
page.on('dialog', async d => {
  dialogs.push({ type: d.type(), msg: String(d.message()).slice(0, 240) });
  if (d.type() === 'prompt') {
    if (d.message().toLowerCase().includes('current pin')) await d.accept('1234');
    else await d.accept('5000');
  } else await d.accept();
});

const isJs = e => e.kind !== 'network';

async function step(n, name, fn) {
  const e0 = errors.length, d0 = dialogs.length;
  let ok = true, detail = '';
  try {
    const info = await fn();
    if (typeof info === 'string') detail = info;
  } catch (err) {
    ok = false;
    detail = String(err && err.message ? err.message : err).slice(0, 400);
  }
  const newJs = errors.slice(e0).filter(isJs);
  const newAlerts = dialogs.slice(d0).filter(d => d.type === 'alert');
  if (ok && newJs.length) { ok = false; detail = (detail ? detail + ' | ' : '') + 'JS error: ' + newJs.map(e => e.text).join(' ; '); }
  if (ok && newAlerts.length) { ok = false; detail = (detail ? detail + ' | ' : '') + 'unexpected alert: ' + newAlerts.map(a => a.msg).join(' ; '); }
  results.push({ n, name, ok, detail });
  console.log(`STEP ${n} ${ok ? 'PASS' : 'FAIL'} — ${name}${detail ? '\n        ' + detail : ''}`);
  return ok;
}

const ev = (fn, ...args) => page.evaluate(fn, ...args);
const screenName = () => ev(() => document.querySelector('.sticky.top-0 h1')?.textContent?.trim() ?? '');
const bodyText = () => ev(() => document.body.innerText || '');
const modalOpen = () => ev(() => !!document.querySelector('.fixed.inset-0'));
const modalTitle = () => ev(() => document.querySelector('.fixed.inset-0 h3')?.textContent?.trim() ?? '');
const modalText = () => ev(() => document.querySelector('.fixed.inset-0')?.innerText ?? '');

async function waitFor(desc, fn, timeout = 7000) {
  const t0 = Date.now();
  let last;
  for (;;) {
    try { last = await fn(); } catch { last = null; }
    if (last) return last;
    if (Date.now() - t0 > timeout) throw new Error(`timeout ${timeout}ms waiting for: ${desc}`);
    await sleep(120);
  }
}

async function clickBtn({ text, exact = false, scope = null, nth = 0 }) {
  const res = await ev(o => {
    /* innerText honours CSS text-transform — the app uppercases almost every
       label, so match case-insensitively on both sides */
    const n = t => String(t || '').replace(/\s+/g, ' ').trim().toLowerCase();
    const root = o.scope ? document.querySelector(o.scope) : document;
    if (!root) return { ok: false, found: 0, texts: [], why: 'scope missing: ' + o.scope };
    const list = [...root.querySelectorAll('button, a, [role="button"]')].filter(el => {
      const t = n(el.innerText || el.getAttribute('title'));
      return o.exact ? t === n(o.text) : t.includes(n(o.text));
    });
    const el = list[o.nth];
    if (!el) return { ok: false, found: list.length, texts: list.slice(0, 12).map(e => n(e.innerText).slice(0, 60)), why: 'no match' };
    el.scrollIntoView({ block: 'center' });
    el.click();
    return { ok: true, text: n(el.innerText).slice(0, 70), total: list.length };
  }, { text, exact, scope, nth });
  if (!res.ok) throw new Error(`button ${exact ? 'exactly ' : 'containing '}"${text}" not found (${res.why || 'none'}); visible buttons: ${JSON.stringify(res.texts)}`);
  return res;
}

async function go(label) {
  const ok = await ev(l => {
    const n = t => String(t || '').replace(/\s+/g, ' ').trim();
    const b = [...document.querySelectorAll('.fixed.bottom-0 button')].find(x => n(x.innerText).toLowerCase().startsWith(l));
    if (!b) return false;
    b.click();
    return true;
  }, label.toLowerCase());
  if (!ok) throw new Error(`bottom nav "${label}" not found`);
  await sleep(450);
}

async function closeModalX() {
  const r = await ev(() => {
    const m = document.querySelector('.fixed.inset-0');
    if (!m) return 'no-modal';
    const h3 = m.querySelector('h3');
    const btn = (h3 && h3.parentElement && h3.parentElement.querySelector('button')) || m.querySelector('button');
    if (!btn) return 'no-close-button';
    btn.click();
    return 'clicked';
  });
  await sleep(350);
  if (r !== 'clicked') throw new Error(`modal close failed: ${r}`);
}

async function setNative(selector, value, nth = 0) {
  return ev(o => {
    const els = [...document.querySelectorAll(o.selector)];
    const el = els[o.nth];
    if (!el) return { ok: false, found: els.length };
    const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, o.value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return { ok: true, now: el.value, found: els.length };
  }, { selector, value, nth });
}

const countOrderCards = () => ev(() =>
  [...document.querySelectorAll('div')].filter(d => typeof d.className === 'string' && d.className.includes('border-l-8')).length);

const findPayRows = () => ev(() => {
  const n = t => String(t || '').replace(/\s+/g, ' ').trim();
  const out = [];
  for (const b of document.querySelectorAll('button')) {
    if (n(b.innerText).toLowerCase() !== 'pay') continue;
    const row = b.closest('.flex.items-center.gap-3');
    if (!row) continue;
    const rn = n(row.innerText);
    if (!rn.includes('= ₹')) continue; // wages only — vendor Pay rows carry "balance ₹" instead
    const nameEl = row.querySelector('.flex-1 > div');
    out.push({ name: n(nameEl && nameEl.innerText), row: rn });
  }
  return out;
});

const accountButtons = () => ev(() => {
  const n = t => String(t || '').replace(/\s+/g, ' ').trim();
  return [...document.querySelectorAll('button')].filter(b => b.querySelector('img')).map(b => n(b.innerText)).filter(Boolean);
});

/* ───────────────────────────── the scenario ───────────────────────────── */

/* warm Vite's on-demand transform so the first browser load isn't charged
   for the whole cold module graph */
try {
  const warm = await fetch(URL + 'src/main.tsx', { signal: AbortSignal.timeout(60000) });
  await warm.text();
  console.log(`[warm] vite entry transformed (HTTP ${warm.status})`);
} catch (e) {
  console.log('[warm] could not pre-transform vite entry: ' + String(e.message || e));
}

await step(1, 'fresh load → setup screen → master PIN → "Master\'s Eye"', async () => {
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  const setup = await waitFor('setup screen with Create login', async () =>
    (await ev(() => [...document.querySelectorAll('button')].some(b => String(b.innerText || '').replace(/\s+/g, ' ').trim().toLowerCase() === 'create login'))) ? true : false, 45000);
  if (!setup) throw new Error('setup screen never appeared');
  const intro = (await bodyText()).toLowerCase();
  if (!intro.includes('set up your login')) throw new Error('setup banner "Set up your login" not seen; body starts: ' + JSON.stringify(intro.slice(0, 160)));
  const pws = await page.$$('input[type="password"]');
  if (pws.length < 2) throw new Error(`expected 2 PIN fields on setup, saw ${pws.length}`);
  for (const p of pws) await p.type('1234', { delay: 15 });
  await clickBtn({ text: 'create login', exact: true });
  await waitFor('header title "Master\'s Eye"', async () => (await screenName()) === "Master's Eye");
  return 'setup → typed 1234 in both PIN fields → h1 in .sticky.top-0 = "Master\'s Eye"';
});

await step(2, 'master builds spec order (door qty 2 / window 3 cft4 / other, price 5000)', async () => {
  await go('home');
  if ((await screenName()) !== "Master's Eye") throw new Error('home nav did not land on dashboard, title=' + await screenName());
  await clickBtn({ text: 'orders' });
  await waitFor('Orders & Designs screen', async () => (await screenName()) === 'Orders & Designs');
  const before = await countOrderCards();

  await clickBtn({ text: 'New Order', exact: true });
  await waitFor('New order modal', modalOpen);

  await waitFor('door Qty input', async () => (await ev(() => document.querySelectorAll('.fixed.inset-0 input[placeholder="Qty"]').length)) >= 1);
  let r = await setNative('.fixed.inset-0 input[placeholder="Qty"]', '2', 0);
  if (!r.ok) throw new Error(`door Qty input missing (found ${r.found})`);
  const doorQty = await ev(() => document.querySelector('.fixed.inset-0 input[placeholder="Qty"]').value);
  if (doorQty !== '2') throw new Error(`door Qty reads "${doorQty}" after native setter, expected "2"`);

  await clickBtn({ text: 'Add window size', exact: true, scope: '.fixed.inset-0' });
  await waitFor('window line (2 Qty inputs)', async () => (await ev(() => document.querySelectorAll('.fixed.inset-0 input[placeholder="Qty"]').length)) >= 2);
  r = await setNative('.fixed.inset-0 input[placeholder="Qty"]', '3', 1);
  if (!r.ok) throw new Error('window Qty input missing');
  r = await setNative('.fixed.inset-0 input[placeholder="cft"]', '4', 1);
  if (!r.ok) throw new Error('window cft input missing');

  await clickBtn({ text: 'Add other item', exact: true, scope: '.fixed.inset-0' });
  await waitFor('other item line', async () => (await ev(() => document.querySelectorAll('.fixed.inset-0 input[placeholder^="Other "]').length)) >= 1);

  r = await setNative('.fixed.inset-0 input[inputmode="numeric"]', '5000', 0);
  if (!r.ok) throw new Error('MoneyField price input (inputmode=numeric) not found in modal');
  const price = await ev(() => document.querySelector('.fixed.inset-0 input[inputmode="numeric"]').value);
  if (price !== '5000') throw new Error(`price field reads "${price}", expected "5000"`);

  const specPreview = (await modalText()).toLowerCase();
  const woodPreview = (specPreview.match(/total wood required\s*([\d.]+ cft[^\n]*)/) || [])[1] || '(no total in modal)';

  await clickBtn({ text: 'Save', exact: true, scope: '.fixed.inset-0' });
  await waitFor('modal to close after Save', async () => !(await modalOpen()));

  const after = await countOrderCards();
  if (after !== before + 1) throw new Error(`order cards before=${before} after=${after}, expected ${before + 1}`);
  const txt = await bodyText();
  const txtLc = txt.toLowerCase();
  if (!txtLc.includes('total wood required')) {
    const heads = txt.match(/\d+× \w+/g) || [];
    throw new Error('orders page text has no "Total wood required"; qty×kind tokens seen: ' + JSON.stringify(heads));
  }
  if (!txt.includes('₹5,000')) throw new Error('orders page does not show the ₹5,000 price');
  return `cards ${before}→${after}; modal total was "${woodPreview}"; card shows "Total wood required" + ₹5,000`;
});

await step(3, 'clients → first card "— open" → modal shows new order + wood total', async () => {
  await go('clients');
  await waitFor('Clients screen', async () => (await screenName()) === 'Clients');
  await clickBtn({ text: '— open' });
  await waitFor('client orders modal', modalOpen);
  const title = await modalTitle();
  if (!title.endsWith('— orders')) throw new Error(`modal title "${title}" does not end with "— orders"`);
  const mt = await modalText();
  if (!mt.toLowerCase().includes('total wood required')) throw new Error('client orders modal has no "Total wood required" line; modal text: ' + JSON.stringify(mt.slice(0, 400)));
  const head = (mt.match(/\d+× door/i) || [])[0];
  if (!head) throw new Error('client orders modal has no qty×kind door header; tokens: ' + JSON.stringify(mt.match(/\d+× \w+/g)));
  await closeModalX();
  await waitFor('modal closed', async () => !(await modalOpen()));
  return `modal "${title}" contains ${head} + "Total wood required"; closed via X`;
});

await step(4, 'team → crew roster → worker History modal (7-col grid, legend, payments)', async () => {
  await go('team');
  await waitFor('Team & Attendance screen', async () => (await screenName()) === 'Team & Attendance');
  const chips = await ev(() => {
    const n = t => String(t || '').replace(/\s+/g, ' ').trim();
    const list = [...document.querySelectorAll('button')].filter(b => n(b.innerText).toLowerCase() === 'history');
    return list.map(b => {
      const row = b.closest('div.border-2');
      const nameEl = row && row.querySelector('span.font-black.uppercase.truncate');
      return { name: n(nameEl && nameEl.innerText) };
    });
  });
  if (chips.length < 2) throw new Error(`expected master + worker History chips, saw ${chips.length}`);
  const worker = chips[1];
  if (!worker.name) throw new Error('could not read worker name from the 2nd History chip row');

  const clicked = await ev(() => {
    const n = t => String(t || '').replace(/\s+/g, ' ').trim();
    const list = [...document.querySelectorAll('button')].filter(b => n(b.innerText).toLowerCase() === 'history');
    const b = list[1];
    if (!b) return false;
    b.scrollIntoView({ block: 'center' });
    b.click();
    return true;
  });
  if (!clicked) throw new Error('2nd History chip was not clickable');
  await waitFor('history modal', modalOpen);
  await sleep(250);
  const h3 = await modalTitle();
  if (h3.toLowerCase() !== worker.name.toLowerCase()) throw new Error(`history modal h3 "${h3}" !== worker name "${worker.name}"`);
  const grid7 = await ev(() => document.querySelectorAll('.fixed.inset-0 .grid-cols-7').length);
  if (grid7 < 1) throw new Error('no .grid-cols-7 day grid inside the history modal');
  const mt = (await modalText()).toLowerCase();
  for (const w of ['present', 'absent', 'payments taken']) {
    if (!mt.includes(w)) throw new Error(`history modal missing "${w}"; modal text: ` + JSON.stringify(mt.slice(0, 500)));
  }
  await closeModalX();
  await waitFor('modal closed', async () => !(await modalOpen()));
  return `h3="${h3}", ${grid7} × grid-cols-7, legend Present/Absent, "Payments taken" present`;
});

await step(5, 'money → mark worker present if needed → Pay → Cash → ledger reflects it', async () => {
  await go('money');
  await waitFor('Payments screen', async () => (await screenName()) === 'Payments');
  let rows = await findPayRows();
  let marked = null;
  if (!rows.length) {
    await go('team');
    marked = await ev(() => {
      const n = t => String(t || '').replace(/\s+/g, ' ').trim();
      const grid = [...document.querySelectorAll('div.grid.grid-cols-3')][0];
      const btn = grid && grid.querySelector('button');
      if (!btn) return null;
      btn.scrollIntoView({ block: 'center' });
      btn.click();
      const tile = btn.parentElement;
      return { name: n(btn.innerText), on: String(tile.className).includes('border-green-500') };
    });
    if (!marked || !marked.name) throw new Error('no worker photo tile found on the Team marking grid');
    await sleep(450);
    const state = await ev(() => {
      const grid = [...document.querySelectorAll('div.grid.grid-cols-3')][0];
      const btn = grid && grid.querySelector('button');
      return btn ? String(btn.parentElement.className).includes('border-green-500') : false;
    });
    if (!state) throw new Error(`tapping the "${marked.name}" photo tile did not mark them present (tile not green)`);
    await go('money');
    rows = await findPayRows();
  }
  if (!rows.length) throw new Error('no "Pay" button on the Money page even after marking a worker present today');

  const target = rows.find(r => r.name === (marked && marked.name)) || rows[0];
  const beforeRow = target.row;
  const earned = (beforeRow.match(/= ₹([\d,]+)/) || [])[1];
  if (!earned) throw new Error('could not parse earned amount from wage row: ' + JSON.stringify(beforeRow));

  const errMark = errors.length;
  const openedWagePay = await ev(o => {
    const n = t => String(t || '').replace(/\s+/g, ' ').trim();
    for (const b of document.querySelectorAll('button')) {
      if (n(b.innerText).toLowerCase() !== 'pay') continue;
      const row = b.closest('.flex.items-center.gap-3');
      if (row && n(row.innerText).includes(n(o.name))) { b.scrollIntoView({ block: 'center' }); b.click(); return true; }
    }
    return false;
  }, { name: target.name });
  if (!openedWagePay) throw new Error(`Pay button for ${target.name} not clickable`);
  await waitFor('Pay modal', async () => (await modalOpen()) && (await modalTitle()).toLowerCase().startsWith('pay '));
  const title = await modalTitle();
  if (title.toLowerCase() !== `pay ${target.name}`.toLowerCase()) throw new Error(`modal title "${title}", expected "Pay ${target.name}"`);
  await clickBtn({ text: 'Cash', exact: true, scope: '.fixed.inset-0' });
  await waitFor('Pay modal to close', async () => !(await modalOpen()));
  await sleep(400);

  const stillRows = await findPayRows();
  const stillThere = stillRows.find(r => r.name === target.name);
  if (stillThere) throw new Error(`Pay button still present for ${target.name} after Cash settlement: ` + JSON.stringify(stillThere.row));
  const txt = await bodyText();
  const wageRow = (txt.match(new RegExp(`${target.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^\\n]*\\n[^\\n]*`)) || [''])[0];
  if (!wageRow.includes(`paid ₹${earned}`)) throw new Error(`wage row for ${target.name} does not show paid ₹${earned}; row text: ` + JSON.stringify(wageRow));
  if (!txt.toLowerCase().includes('wage settlement')) throw new Error('ledger "Last transactions" has no "Wage settlement" entry');
  const js = errors.slice(errMark).filter(isJs);
  if (js.length) throw new Error('JS error during payment: ' + js.map(e => e.text).join(' ; '));
  return `marked ${marked ? marked.name : 'worker'} present → Pay ${target.name} → Cash; row now "paid ₹${earned}", ledger has "Wage settlement"`;
});

await step(6, 'more → Add → role Client → name Rashid → 2nd select option → PIN 6789 → Create', async () => {
  await go('more');
  await waitFor('Settings screen', async () => (await screenName()) === 'Settings');
  await clickBtn({ text: 'Add', exact: true });
  await waitFor('"New login" modal', async () => (await modalTitle()) === 'New login');
  await clickBtn({ text: 'Client', exact: true, scope: '.fixed.inset-0' });
  await waitFor('linked-client select inside modal', async () => (await ev(() => !!document.querySelector('.fixed.inset-0 select'))));

  const nameRes = await ev(() => {
    const i = [...document.querySelectorAll('.fixed.inset-0 input')].find(x => x.type === 'text');
    if (!i) return { ok: false, types: [...document.querySelectorAll('.fixed.inset-0 input')].map(x => x.type) };
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(i, 'Rashid');
    i.dispatchEvent(new Event('input', { bubbles: true }));
    return { ok: true, now: i.value };
  });
  if (!nameRes.ok) throw new Error('no text input for the login name; modal input types: ' + JSON.stringify(nameRes.types));

  const selRes = await ev(() => {
    const s = document.querySelector('.fixed.inset-0 select');
    if (!s) return { ok: false, len: 0 };
    if (s.options.length < 2) return { ok: false, len: s.options.length };
    const o = s.options[1];
    s.value = o.value;
    s.dispatchEvent(new Event('change', { bubbles: true }));
    return { ok: true, label: String(o.textContent || '').replace(/\s+/g, ' ').trim(), value: o.value, len: s.options.length };
  });
  if (!selRes.ok) throw new Error(`linked-client select unusable (options=${selRes.len})`);
  if (selRes.label !== 'Rashid Villa') throw new Error(`2nd option is "${selRes.label}", the scenario needs the order's client "Rashid Villa"`);

  const pw = await page.$('.fixed.inset-0 input[type="password"]');
  if (!pw) throw new Error('modal PIN (password) input not found');
  await pw.type('6789', { delay: 20 });
  const pwVal = await ev(() => document.querySelector('.fixed.inset-0 input[type="password"]').value);
  if (pwVal !== '6789') throw new Error(`modal PIN field reads "${pwVal}", expected "6789"`);

  await clickBtn({ text: 'Create', exact: true, scope: '.fixed.inset-0' });
  await waitFor('"New login" modal to close', async () => !(await modalOpen()));
  const hasLogout = await ev(() => [...document.querySelectorAll('button')].some(b => String(b.innerText || '').replace(/\s+/g, ' ').trim().toLowerCase().includes('log out')));
  if (!hasLogout) throw new Error('no "Log out" button on Settings after creating the login');
  return `login created (name Rashid, linked to ${selRes.label}, PIN 6789); modal closed; "Log out" button present`;
});

await step(7, 'logout → account picker shows "Client" → PIN 6789 → "My Orders"', async () => {
  await clickBtn({ text: 'log out', exact: true });
  await waitFor('account picker', async () => (await accountButtons()).length >= 2, 8000);
  const accs = await accountButtons();
  const clientBtn = accs.findIndex(t => t.toLowerCase().includes('client'));
  if (clientBtn < 0) throw new Error('no account button containing "Client"; picker shows: ' + JSON.stringify(accs));
  const clicked = await ev(() => {
    const b = [...document.querySelectorAll('button')].find(x => x.querySelector('img') && String(x.innerText || '').replace(/\s+/g, ' ').trim().toLowerCase().includes('client'));
    if (!b) return false;
    b.click();
    return true;
  });
  if (!clicked) throw new Error('Client account button not clickable');
  await waitFor('PIN field', async () => (await ev(() => !!document.querySelector('input[type="password"]'))));
  await page.focus('input[type="password"]');
  await page.type('input[type="password"]', '6789', { delay: 25 });
  await page.keyboard.press('Enter');
  await waitFor('"My Orders" title', async () => (await screenName()) === 'My Orders', 9000);
  return `picker=${JSON.stringify(accs)} → picked "${accs[clientBtn]}" → PIN 6789 → title "My Orders"`;
});

await step(8, 'client sees master order: "Total wood required" + qty×kind header', async () => {
  const txt = await bodyText();
  if (!txt.toLowerCase().includes('total wood required')) {
    throw new Error('My Orders text lacks "Total wood required"; card headers: ' + JSON.stringify(txt.match(/\d+× \w+/g)));
  }
  const head = (txt.match(/\d+× door/i) || [])[0];
  if (!head) throw new Error('no qty×kind door header on My Orders; tokens: ' + JSON.stringify(txt.match(/\d+× \w+/g)));
  const doorLines = txt.split('\n').filter(l => /door/i.test(l));
  const specLine = (txt.match(/2×\s*Door[^\n]*/i) || [])[0] || '(no "2× Door" line — see doorLines)';
  return `header "${head}"; spec line ${JSON.stringify(specLine.slice(0, 60))}; door lines in DOM ${JSON.stringify(doorLines.slice(0, 6))}; "Total wood required" present`;
});

await step(9, 'client adds a design photo → thumbnail → Send → card shows button + lightbox', async () => {
  await clickBtn({ text: 'Add design / photo' });
  await waitFor('"Add design" modal', async () => (await modalTitle()) === 'Add design');
  const SEL = 'label[title="Pick design photo"]';
  const hasLabel = await ev(s => !!document.querySelector(s), SEL);
  if (!hasLabel) throw new Error(`selector ${SEL} not found in the Add design modal`);
  const fc = page.waitForFileChooser({ timeout: 12000 });
  let viaMouse = true;
  try {
    await ev(s => { const l = document.querySelector(s); l && l.scrollIntoView({ block: 'center' }); }, SEL);
    await page.click(SEL);
  } catch {
    viaMouse = false;
    await ev(s => { const l = document.querySelector(s); l && l.click(); }, SEL);
  }
  let chooser;
  try { chooser = await fc; }
  catch (e) { throw new Error(`file chooser did not open (${viaMouse ? 'mouse click' : 'synthetic click'} on ${SEL}): ${String(e.message).slice(0, 160)}`); }
  await chooser.accept([PNG_PATH]);
  await waitFor('design thumbnail inside the modal', async () =>
    ev(() => !!document.querySelector('.fixed.inset-0 img[src^="data:"]')), 9000);
  const thumbSrc = await ev(() => document.querySelector('.fixed.inset-0 img[src^="data:"]')?.src?.slice(0, 30) || '');
  await clickBtn({ text: 'Send', exact: true, scope: '.fixed.inset-0' });
  await waitFor('Add design modal to close', async () => !(await modalOpen()));
  const linked = await ev(() => {
    const b = [...document.querySelectorAll('button')].find(x => x.querySelector('img[src^="data:"]'));
    return b ? { img: b.querySelector('img').src.slice(0, 30) } : null;
  });
  if (!linked) throw new Error('order card has no <button><img> design thumbnail after Send');
  // data: URLs can't open in a new tab — the thumbnail must open the in-app lightbox
  await ev(() => {
    const b = [...document.querySelectorAll('button')].find(x => x.querySelector('img[src^="data:"]'));
    b && b.click();
  });
  await waitFor('in-app lightbox to open', async () =>
    ev(() => !!document.querySelector('div.fixed.inset-0[class*="z-[60]"] img[src^="data:"]')), 5000);
  const lightboxImg = await ev(() =>
    document.querySelector('div.fixed.inset-0[class*="z-[60]"] img[src^="data:"]')?.src.slice(0, 30) || '');
  await ev(() => { const x = document.querySelector('div.fixed.inset-0[class*="z-[60]"] button[aria-label="Close"]'); x && x.click(); });
  await waitFor('lightbox to close', async () =>
    !(await ev(() => !!document.querySelector('div.fixed.inset-0[class*="z-[60]"]'))), 5000);
  return `accepted ${path.basename(PNG_PATH)} → thumbnail ${JSON.stringify(thumbSrc)} → card button opens lightbox ${JSON.stringify(lightboxImg)}…`;
});

await step(10, 'back to master → clients → "— open" → modal shows the design thumbnail', async () => {
  await clickBtn({ text: 'log out', exact: true });
  await waitFor('account picker', async () => (await accountButtons()).length >= 2, 8000);
  const accs = await accountButtons();
  const masterIdx = accs.findIndex(t => t.toLowerCase().includes('master'));
  if (masterIdx < 0) throw new Error('no account button containing "Master"; picker shows: ' + JSON.stringify(accs));
  await ev(() => {
    const b = [...document.querySelectorAll('button')].find(x => x.querySelector('img') && String(x.innerText || '').replace(/\s+/g, ' ').trim().toLowerCase().includes('master'));
    b && b.click();
  });
  await waitFor('PIN field', async () => (await ev(() => !!document.querySelector('input[type="password"]'))));
  await page.focus('input[type="password"]');
  await page.type('input[type="password"]', '1234', { delay: 25 });
  await page.keyboard.press('Enter');
  await waitFor('"Master\'s Eye" title', async () => (await screenName()) === "Master's Eye", 9000);
  await go('clients');
  await waitFor('Clients screen', async () => (await screenName()) === 'Clients');
  await clickBtn({ text: '— open' });
  await waitFor('client orders modal', modalOpen);
  const img = await ev(() => {
    const el = document.querySelector('.fixed.inset-0 img[src^="data:"]');
    return el ? String(el.src).slice(0, 30) : null;
  });
  if (!img) {
    const all = await ev(() => [...document.querySelectorAll('.fixed.inset-0 img')].map(i => String(i.src).slice(0, 40)));
    throw new Error('no data-URL design thumbnail in the master\'s client orders modal; imgs inside modal: ' + JSON.stringify(all));
  }
  await closeModalX();
  return `logged in as "${accs[masterIdx]}" → client modal shows design thumbnail ${JSON.stringify(img)}`;
});

await step(11, 'final state: master nav "more" → Settings', async () => {
  await go('more');
  const t = await screenName();
  if (t !== 'Settings') throw new Error(`title is "${t}", expected "Settings"`);
  return 'app resting on Settings as master';
});

await step(12, 'partial wage: 2nd crew member pays half → balance stays due', async () => {
  await go('team');
  await waitFor('Team screen', async () => (await screenName()) === 'Team & Attendance');
  const marked = await ev(() => {
    const n = t => String(t || '').replace(/\s+/g, ' ').trim();
    const grid = [...document.querySelectorAll('div.grid.grid-cols-3')][0];
    // photo tiles are the buttons holding an <img> — the rate-edit and trash
    // buttons sit beside them and must not be clicked
    const tiles = grid ? [...grid.querySelectorAll('button')].filter(b => b.querySelector('img')) : [];
    const btn = tiles[1];
    if (!btn) return null;
    btn.scrollIntoView({ block: 'center' });
    btn.click();
    return { name: n(btn.innerText), count: tiles.length };
  });
  if (!marked || !marked.name) throw new Error('2nd photo tile not found in the marking grid');
  await sleep(450);
  const green = await ev(() => {
    const grid = [...document.querySelectorAll('div.grid.grid-cols-3')][0];
    const tiles = grid ? [...grid.querySelectorAll('button')].filter(b => b.querySelector('img')) : [];
    const b = tiles[1];
    return b ? String(b.parentElement.className).includes('border-green-500') : null;
  });
  if (green !== true) throw new Error('2nd photo tile did not turn green — attendance was not marked');
  await go('money');
  await waitFor('Payments screen', async () => (await screenName()) === 'Payments');
  const rows = await findPayRows();
  const target = rows.find(r => r.name === marked.name);
  if (!target) throw new Error(`no Pay row for ${marked.name} after marking; rows: ` + JSON.stringify(rows));
  const total = Number(((target.row.match(/= ₹([\d,]+)/) || [])[1] || '0').replace(/,/g, ''));
  if (!(total > 0)) throw new Error('could not parse earned total from row: ' + target.row);
  const half = Math.max(1, Math.floor(total / 2));
  const openedPay = await ev(o => {
    const n = t => String(t || '').replace(/\s+/g, ' ').trim();
    for (const b of document.querySelectorAll('button')) {
      if (n(b.innerText).toLowerCase() !== 'pay') continue;
      const row = b.closest('.flex.items-center.gap-3');
      if (row && n(row.innerText).includes(n(o.name))) { b.scrollIntoView({ block: 'center' }); b.click(); return true; }
    }
    return false;
  }, { name: target.name });
  if (!openedPay) throw new Error(`Pay button for ${target.name} not clickable`);
  await waitFor('wage pay modal', async () => (await modalOpen()) && (await modalTitle()).toLowerCase().startsWith('pay '));
  const dueLine = (await modalText()).match(/Due ₹([\d,]+)/);
  if (!dueLine || Number(dueLine[1].replace(/,/g, '')) !== total) {
    throw new Error('modal "Due" line does not show the full earned total: ' + (await modalText()).slice(0, 200));
  }
  const set = await setNative('.fixed.inset-0 input[inputmode="numeric"]', String(half));
  if (!set.ok) throw new Error('wage amount field not found in modal');
  const hint = (await modalText()).toLowerCase();
  if (!hint.includes('partial — leaves')) throw new Error('no partial-payment hint after editing the amount; modal: ' + hint.slice(0, 240));
  await clickBtn({ text: 'Cash', exact: true, scope: '.fixed.inset-0' });
  await waitFor('wage modal to close', async () => !(await modalOpen()));
  await sleep(400);
  const after = (await findPayRows()).find(r => r.name === target.name);
  if (!after) throw new Error('Pay row vanished after a PARTIAL payment — it should stay until fully settled');
  if (!after.row.includes(`paid ₹${half.toLocaleString('en-US')}`)) {
    throw new Error(`row does not show paid ₹${half.toLocaleString('en-US')}: ` + after.row);
  }
  // the row text ends with the Pay action button — strip it to read the balance
  const rowNoAction = after.row.replace(/\s+PAY$/, '');
  const bal = (rowNoAction.match(/₹([\d,]+)$/) || [])[1];
  const expectBal = (total - half).toLocaleString('en-US');
  if (bal !== expectBal) throw new Error(`row balance ₹${bal}, expected ₹${expectBal}`);
  return `${target.name} earned ₹${total.toLocaleString('en-US')} → paid ₹${half.toLocaleString('en-US')} → still due ₹${expectBal}, Pay button remains`;
});

await step(13, 'vendor: partial payment → rest stays on credit, ledger shows Wood payment', async () => {
  const opened = await ev(() => {
    const n = t => String(t || '').replace(/\s+/g, ' ').trim();
    const card = [...document.querySelectorAll('div.bg-white')].find(d => n(d.innerText).toLowerCase().includes('money you owe'));
    if (!card) return 'vendor card missing';
    const b = [...card.querySelectorAll('button')].find(x => n(x.innerText).toLowerCase() === 'pay');
    if (!b) return 'Pay button missing on vendor card';
    b.scrollIntoView({ block: 'center' });
    b.click();
    return 'ok';
  });
  if (opened !== 'ok') throw new Error(opened);
  await waitFor('vendor pay modal', async () => (await modalOpen()) && (await modalText()).toLowerCase().includes('you owe'));
  const title = await modalTitle();
  if (!/^pay /i.test(title)) throw new Error('unexpected modal title: ' + title);
  const mt = await modalText();
  const due = Number(((mt.match(/₹\s?([\d,]+)/) || [])[1] || '0').replace(/,/g, ''));
  if (!(due > 0)) throw new Error('could not parse "You owe" total from modal: ' + mt.slice(0, 200));
  const PAY = 100000;
  if (due <= PAY) throw new Error(`demo due ₹${due} is not larger than the test payment`);
  const set = await setNative('.fixed.inset-0 input[inputmode="numeric"]', String(PAY));
  if (!set.ok) throw new Error('vendor amount field not found in modal');
  const hint = (await modalText()).toLowerCase();
  if (!hint.includes('partial — leaves')) throw new Error('no "on credit" partial hint; modal: ' + hint.slice(0, 240));
  if (!hint.includes('oldest wood lots')) throw new Error('modal missing allocation note');
  await clickBtn({ text: 'Cash', exact: true, scope: '.fixed.inset-0' });
  await waitFor('vendor modal to close', async () => !(await modalOpen()));
  await sleep(400);
  const expectBal = (due - PAY).toLocaleString('en-US');
  await waitFor(`vendor row balance ₹${expectBal}`, async () => (await bodyText()).includes(`balance ₹${expectBal}`));
  const txt = await bodyText();
  if (!txt.includes('Wood payment')) throw new Error('ledger has no "Wood payment" row after the settlement');
  return `${title}: owed ₹${due.toLocaleString('en-US')} → paid ₹${PAY.toLocaleString('en-US')} → balance ₹${expectBal} on credit; ledger row "Wood payment" present`;
});

/* ───────────────────────────── report ───────────────────────────── */
console.log('\n=== STEP RESULTS ===');
for (const r of results) console.log(`STEP ${r.n} ${r.ok ? 'PASS' : 'FAIL'} — ${r.name}${r.ok ? '' : '\n        ' + r.detail}`);

const jsErrs = errors.filter(isJs);
const netErrs = errors.filter(e => !isJs(e));
console.log(`\n=== PAGE/CONSOLE ERRORS: ${jsErrs.length} JS + ${netErrs.length} network-resource ===`);
for (const e of jsErrs) console.log(`[${e.kind}] ${e.text}${e.url ? ' @ ' + e.url : ''}`);
for (const e of netErrs) console.log(`[network] ${e.text}${e.url ? ' @ ' + e.url : ''}`);

if (dialogs.length) {
  console.log(`\n=== DIALOGS SEEN (${dialogs.length}) ===`);
  for (const d of dialogs) console.log(`[${d.type}] ${d.msg}`);
}

const failed = results.filter(r => !r.ok);
console.log('');
if (!failed.length && !jsErrs.length) {
  console.log('E2E RESULT: ALL PASS');
} else {
  console.log('E2E RESULT: FAILURES — ' + failed.map(f => `step ${f.n} (${f.name})`).join('; ') +
    (jsErrs.length ? ` ; ${jsErrs.length} JS error(s)` : ''));
}

await browser.close();
process.exit(failed.length || jsErrs.length ? 1 : 0);
