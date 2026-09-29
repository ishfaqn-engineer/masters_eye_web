import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { AppState, monthLabel, monthKey, daysInMonth, today } from '../store';
import * as D from './derive';

const cur = (n: number) => n.toLocaleString('en-US');

/* parse YYYY-MM-DD in LOCAL time (toISOString dates are UTC) */
const localDate = (d: string) => {
  const [y, m, dd] = d.split('-').map(Number);
  return new Date(y, m - 1, dd);
};

const dayName = (d: string) => localDate(d).toLocaleDateString('en', { weekday: 'long' });

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function exportExcel(rows: (string | number)[][], filename: string, sheetName = 'Report') {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  /* widths must come from EVERY row — rows[0] is usually a 1-cell title */
  const colCount = rows.reduce((m, r) => Math.max(m, r.length), 0);
  ws['!cols'] = Array.from({ length: colCount }, (_, i) => ({
    wch: Math.max(12, Math.min(40, rows.reduce((m, r) => Math.max(m, String(r[i] ?? '').length), 0) + 2))
  }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  download(new Blob([out], { type: 'application/octet-stream' }), filename + '.xlsx');
}

export function exportPdf(title: string, subtitle: string, head: string[], body: (string | number)[][], filename: string, foot?: string) {
  const cols = Math.max(head.length, body[0] ? body[0].length : 0);
  const doc = new jsPDF({ orientation: cols > 5 ? 'landscape' : 'portrait', unit: 'pt', format: 'a4' });
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text(title, 40, 40);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(subtitle, 40, 58);
  autoTable(doc, {
    head: [head],
    body: body.map(r => r.map(c => String(c))),
    startY: 72,
    styles: { fontSize: 9, cellPadding: 5 },
    headStyles: { fillColor: [93, 58, 26], textColor: 255 },
    alternateRowStyles: { fillColor: [245, 241, 235] },
    margin: { left: 40, right: 40 },
  });
  if (foot) {
    const pageH = doc.internal.pageSize.getHeight();
    let fy = (doc as any).lastAutoTable.finalY + 20;
    if (fy > pageH - 40) {
      doc.addPage();
      fy = 40;
    }
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(foot, 40, fy, { maxWidth: doc.internal.pageSize.getWidth() - 80 });
  }
  doc.save(filename + '.pdf');
}

type PdfSection = { title: string; head: string[]; body: (string | number)[][] };

/* several autoTable blocks in one document — same styling as exportPdf,
   landscape whenever any table has more than 5 columns */
function exportPdfSections(title: string, subtitle: string, sections: PdfSection[], filename: string, foot?: string) {
  const maxCols = sections.reduce((m, x) => Math.max(m, x.head.length), 0);
  const doc = new jsPDF({ orientation: maxCols > 5 ? 'landscape' : 'portrait', unit: 'pt', format: 'a4' });
  const pageH = doc.internal.pageSize.getHeight();
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text(title, 40, 40);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(subtitle, 40, 58);
  let y = 76;
  for (const sec of sections) {
    if (y > pageH - 110) {
      doc.addPage();
      y = 44;
    }
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text(sec.title, 40, y);
    autoTable(doc, {
      head: [sec.head],
      body: sec.body.map(r => r.map(c => String(c))),
      startY: y + 8,
      styles: { fontSize: 9, cellPadding: 5 },
      headStyles: { fillColor: [93, 58, 26], textColor: 255 },
      alternateRowStyles: { fillColor: [245, 241, 235] },
      margin: { left: 40, right: 40 },
    });
    y = (doc as any).lastAutoTable.finalY + 26;
  }
  if (foot) {
    if (y > pageH - 70) {
      doc.addPage();
      y = 44;
    }
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(foot, 40, y + 10, { maxWidth: doc.internal.pageSize.getWidth() - 80 });
  }
  doc.save(filename + '.pdf');
}

/* cash paid against wood lots that no longer exist — without this note the
   vendor's paid column would not match what actually left the wallet */
function deletedLotNotes(s: AppState): (string | number)[][] {
  const notes: (string | number)[][] = [];
  for (const v of s.vendors) {
    const liveSum = s.woodLots.filter(l => l.vendorId === v.id)
      .reduce((a, l) => a + D.paidToVendor(s, l.id), 0);
    const diff = D.vendorPaid(s, v.id) - liveSum;
    if (Math.abs(diff) > 0.001) notes.push([`Note: Rs ${cur(diff)} received on lots since deleted (${v.name})`]);
  }
  return notes;
}

/* ---------- Attendance (monthly, per crew member) ---------- */

export function monthAttendanceRows(s: AppState, ym: string, workerId: string | 'master') {
  const isMaster = workerId === 'master';
  const rate = isMaster ? s.settings.masterRate : (s.workers.find(w => w.id === workerId)?.rate || 0);
  const name = isMaster ? s.settings.masterName : (s.workers.find(w => w.id === workerId)?.name || '');
  const days: string[] = [];
  const dim = daysInMonth(ym);
  for (let d = 1; d <= dim; d++) {
    const date = `${ym}-${String(d).padStart(2, '0')}`;
    const rec = s.attendance.find(a => a.date === date);
    const present = isMaster ? !!rec?.masterPresent : !!rec?.presentIds.includes(workerId);
    if (present) days.push(date);
  }
  /* money always comes from derive so Excel, PDF and the UI can never disagree */
  const worker = s.workers.find(w => w.id === workerId);
  const count = isMaster ? D.masterDays(s, ym) : D.workerDays(s, workerId, ym);
  const wages = isMaster ? D.masterWage(s, ym) : (worker ? D.workerWage(s, worker, ym) : 0);
  const paid = D.paidWages(s, workerId, ym);
  const remaining = D.wageRemaining(s, workerId, ym);
  return { name, rate, days, wages, count, paid, remaining };
}

export function exportAttendanceExcel(s: AppState, ym: string, workerId: string | 'master') {
  const r = monthAttendanceRows(s, ym, workerId);
  const rows: (string | number)[][] = [
    ['MONTHLY ATTENDANCE & WAGE REPORT'],
    ['Month', monthLabel(ym)],
    ['Worker', r.name],
    ['Daily Rate', r.rate],
    ['Days Present', r.count],
    ['Wages earned', r.wages],
    [],
    ['S.No', 'Date', 'Day', 'Present'],
    ...r.days.map((d, i) => [i + 1, d, dayName(d), 'YES']),
    [],
    ['Total Days', r.count],
    ['Wages earned', r.wages],
    ['Wages paid', r.paid],
    ['Still to pay', r.remaining],
  ];
  exportExcel(rows, `attendance-${r.name}-${ym}`);
}

export function exportAttendancePdf(s: AppState, ym: string, workerId: string | 'master') {
  const r = monthAttendanceRows(s, ym, workerId);
  exportPdf(
    'Monthly Attendance Report',
    `${r.name}  |  ${monthLabel(ym)}  |  Rate: ${cur(r.rate)}/day`,
    ['#', 'Date', 'Day', 'Status'],
    r.days.map((d, i) => [i + 1, d, dayName(d), 'Present']),
    `attendance-${r.name}-${ym}`,
    `Total Days: ${r.count}    Wages earned: ${cur(r.wages)}    Paid: ${cur(r.paid)}    Still to pay: ${cur(r.remaining)}\nGenerated: ${new Date().toLocaleString()}`
  );
}

export function exportAllAttendanceExcel(s: AppState, ym: string) {
  const head = ['Worker', 'Rate/Day', 'Days Present', 'Wages earned', 'Paid', 'Still to pay'];
  const totalDays = D.masterDays(s, ym) + s.workers.reduce((a, w) => a + D.workerDays(s, w.id, ym), 0);
  const rows: (string | number)[][] = [
    ['CREW ATTENDANCE SUMMARY'],
    ['Month', monthLabel(ym)],
    [],
    head,
    [s.settings.masterName, s.settings.masterRate, D.masterDays(s, ym), D.masterWage(s, ym), D.paidWages(s, 'master', ym), D.wageRemaining(s, 'master', ym)],
    ...s.workers.map(w => [w.name, w.rate, D.workerDays(s, w.id, ym), D.workerWage(s, w, ym), D.paidWages(s, w.id, ym), D.wageRemaining(s, w.id, ym)]),
    [],
    ['TOTAL', '', totalDays, D.crewWagesDue(s, ym), D.crewWagesPaid(s, ym), D.crewWagesRemaining(s, ym)],
  ];
  exportExcel(rows, `crew-attendance-${ym}`);
}

export function exportAllAttendancePdf(s: AppState, ym: string) {
  exportPdf(
    'Crew Attendance Summary',
    monthLabel(ym),
    ['Worker', 'Rate/Day', 'Days', 'Wages earned', 'Paid', 'Still to pay'],
    [
      [s.settings.masterName, cur(s.settings.masterRate), D.masterDays(s, ym), cur(D.masterWage(s, ym)), cur(D.paidWages(s, 'master', ym)), cur(D.wageRemaining(s, 'master', ym))],
      ...s.workers.map(w => [w.name, cur(w.rate), D.workerDays(s, w.id, ym), cur(D.workerWage(s, w, ym)), cur(D.paidWages(s, w.id, ym)), cur(D.wageRemaining(s, w.id, ym))]),
    ],
    `crew-attendance-${ym}`,
    `Wages earned: ${cur(D.crewWagesDue(s, ym))}    Paid: ${cur(D.crewWagesPaid(s, ym))}    Still to pay: ${cur(D.crewWagesRemaining(s, ym))}`
  );
}

/* ---------- Payments / dues ---------- */

export function exportPaymentsExcel(s: AppState, ym = today().slice(0, 7)) {
  const rows: (string | number)[][] = [
    ['PAYMENTS & DUES REPORT'],
    ['Generated', new Date().toLocaleString()],
    [],
    ['CLIENTS'],
    ['Client', 'Order Value', 'Received', 'Due', 'Paid ahead', 'Phone'],
    ...s.clients.map(c => [c.name, D.clientTotal(s, c), D.clientPaid(s, c), Math.max(0, D.clientDue(s, c)), Math.max(0, -D.clientDue(s, c)), c.phone]),
    [],
    ['VENDORS (WOOD)'],
    ['Vendor', 'Lots', 'Value', 'Paid', 'Due'],
    ...s.vendors.map(v => {
      const lots = s.woodLots.filter(l => l.vendorId === v.id);
      const val = lots.reduce((a, l) => a + D.lotValue(l), 0);
      const due = D.vendorDue(s, v.id);
      return [v.name, lots.length, val, D.vendorPaid(s, v.id), due];
    }),
    ['Note: Paid includes cash paid against wood lots that have since been deleted.'],
    [],
    ['WAGES (' + monthLabel(ym) + ')'],
    ['Worker', 'Total Days', 'Rate', 'Earned', 'Paid', 'Balance'],
    [s.settings.masterName, D.masterDays(s, ym), s.settings.masterRate, D.masterWage(s, ym), D.paidWages(s, 'master', ym), D.wageRemaining(s, 'master', ym)],
    ...s.workers.map(w => [w.name, D.workerDays(s, w.id, ym), w.rate, D.workerWage(s, w, ym), D.paidWages(s, w.id, ym), D.wageRemaining(s, w.id, ym)]),
    [],
    ['SUMMARY'],
    ['From clients', D.clientCollected(s)],
    ['Own capital in', D.capitalIn(s)],
    ['Total cash in', D.cashCollected(s)],
    ['Cash paid out', D.cashPaidOut(s)],
    ['Expenses', D.expensesTotal(s)],
    ['Still to collect', D.toCollect(s)],
    ['Vendor udhar (you owe)', D.totalVendorDebt(s)],
    ['Cash in hand', D.cashInHand(s)],
  ];
  exportExcel(rows, 'payments-report');
}

export function exportPaymentsPdf(s: AppState, ym: string = today().slice(0, 7)) {
  exportPdfSections('Payments & Dues', `Generated ${new Date().toLocaleString()}`,
    [
      {
        title: 'CLIENTS',
        head: ['Client', 'Order Value', 'Received', 'Due', 'Paid ahead'],
        body: s.clients.map(c => [
          c.name, cur(D.clientTotal(s, c)), cur(D.clientPaid(s, c)),
          cur(Math.max(0, D.clientDue(s, c))), cur(Math.max(0, -D.clientDue(s, c))),
        ]),
      },
      {
        title: 'VENDORS (WOOD)',
        head: ['Vendor', 'Paid', 'Balance'],
        body: s.vendors.map(v => [v.name, cur(D.vendorPaid(s, v.id)), cur(D.vendorDue(s, v.id))]),
      },
      {
        title: `WAGES (${monthLabel(ym)})`,
        head: ['Worker', 'Days', 'Rate', 'Earned', 'Paid', 'Balance'],
        body: [
          [s.settings.masterName, D.masterDays(s, ym), cur(s.settings.masterRate), cur(D.masterWage(s, ym)), cur(D.paidWages(s, 'master', ym)), cur(D.wageRemaining(s, 'master', ym))],
          ...s.workers.map(w => [w.name, D.workerDays(s, w.id, ym), cur(w.rate), cur(D.workerWage(s, w, ym)), cur(D.paidWages(s, w.id, ym)), cur(D.wageRemaining(s, w.id, ym))]),
        ],
      },
    ],
    'payments-report',
    [
      `From clients: ${cur(D.clientCollected(s))}    Own capital in: ${cur(D.capitalIn(s))}    Total in: ${cur(D.cashCollected(s))}`,
      `Paid out: ${cur(D.cashPaidOut(s))}    Expenses: ${cur(D.expensesTotal(s))}    Still to collect: ${cur(D.toCollect(s))}`,
      `Vendor udhar: ${cur(D.totalVendorDebt(s))}    Cash in hand: ${cur(D.cashInHand(s))}`,
      `Wages earned ${monthLabel(ym)}: ${cur(D.crewWagesDue(s, ym))}    Paid: ${cur(D.crewWagesPaid(s, ym))}    Still to pay: ${cur(D.crewWagesRemaining(s, ym))}`,
    ].join('\n')
  );
}

/* ---------- Orders ---------- */

export function exportOrdersExcel(s: AppState) {
  const rows: (string | number)[][] = [
    ['ORDERS REPORT'],
    ['Generated', new Date().toLocaleString()],
    [],
    ['Client', 'Type', 'Qty', 'Width"', 'Height"', 'Wood', 'Price', 'Status', 'Notes'],
    ...s.orders.map(o => [
      s.clients.find(c => c.id === o.clientId)?.name || '—',
      o.kind, o.qty, o.widthIn, o.heightIn, o.woodType, o.price, o.status, o.notes
    ]),
    [],
    ['Total Order Value', s.orders.reduce((a, o) => a + o.price, 0)],
  ];
  exportExcel(rows, 'orders-report');
}

export function exportOrdersPdf(s: AppState) {
  exportPdf('Orders Report', `Generated ${new Date().toLocaleString()}`,
    ['Client', 'Item', 'Qty', 'Size', 'Wood', 'Price', 'Status'],
    s.orders.map(o => [
      s.clients.find(c => c.id === o.clientId)?.name || '—',
      `${o.qty}x ${o.kind}`,
      o.qty,
      `${o.widthIn}x${o.heightIn}"`,
      o.woodType,
      cur(o.price),
      o.status,
    ]),
    'orders-report',
    `Total: ${cur(s.orders.reduce((a, o) => a + o.price, 0))}`
  );
}

/* ---------- Stock & consumables ---------- */

export function exportStockExcel(s: AppState) {
  const notes = deletedLotNotes(s);
  const rows: (string | number)[][] = [
    ['WOOD STOCK & VENDOR CREDIT'],
    [],
    ['Type', 'Qty (ft3)', 'Rate/ft3', 'Value', 'Paid', 'Due', 'Vendor', 'Date'],
    ...s.woodLots.map(l => [
      l.type, l.cubicFeet, l.ratePerCubicFeet, D.lotValue(l), D.paidToVendor(s, l.id),
      D.lotDue(s, l.id), s.vendors.find(v => v.id === l.vendorId)?.name || '—', l.date
    ]),
    ...notes,
    [],
    ['CONSUMABLES & ASSETS'],
    ['Item', 'Amount', 'Category', 'Repeat', 'Date'],
    ...s.expenses.map(e => [e.label, e.amount, e.category, e.recurring, e.date]),
    [],
    ['Total Stock (ft3)', s.woodLots.reduce((a, l) => a + l.cubicFeet, 0)],
    ['Vendor Debt', D.totalVendorDebt(s)],
    ['Vendor Paid', s.vendors.reduce((a, v) => a + D.vendorPaid(s, v.id), 0)],
    ['Expenses', D.expensesTotal(s)],
  ];
  exportExcel(rows, 'stock-report');
}

export function exportStockPdf(s: AppState) {
  const pad = (cells: (string | number)[]) => {
    const out: (string | number)[] = cells.slice();
    while (out.length < 8) out.push('');
    return out;
  };
  exportPdf('Wood Stock & Credit', `Generated ${new Date().toLocaleString()}`,
    ['Type', 'ft3', 'Rate/ft3', 'Value', 'Paid', 'Due', 'Vendor', 'Date'],
    [
      ...s.woodLots.map(l => [
        l.type, String(l.cubicFeet), cur(l.ratePerCubicFeet), cur(D.lotValue(l)), cur(D.paidToVendor(s, l.id)),
        cur(D.lotDue(s, l.id)), s.vendors.find(v => v.id === l.vendorId)?.name || '—', l.date
      ]),
      ...deletedLotNotes(s).map(pad),
    ],
    'stock-report',
    `Vendor debt total: ${cur(D.totalVendorDebt(s))} | Vendor paid: ${cur(s.vendors.reduce((a, v) => a + D.vendorPaid(s, v.id), 0))} | Expenses: ${cur(D.expensesTotal(s))}`
  );
}

export function exportExpensesExcel(s: AppState) {
  exportExcel([
    ['EXPENSES / CONSUMABLES'],
    ['Item', 'Amount', 'Category', 'Repeat', 'Date'],
    ...s.expenses.map(e => [e.label, e.amount, e.category, e.recurring, e.date]),
    [], ['Total', D.expensesTotal(s)],
    [], ['By Month'],
    ...Array.from(new Set(s.expenses.map(e => monthKey(e.date)))).sort().map(ym => [monthLabel(ym), D.expensesTotal(s, ym)]),
  ], 'expenses-report');
}

export function exportExpensesPdf(s: AppState) {
  exportPdf(
    'Consumables & Assets',
    `Generated ${new Date().toLocaleString()}`,
    ['Item', 'Amount', 'Type', 'Repeat', 'Date'],
    s.expenses.map(e => [e.label, cur(e.amount), e.category, e.recurring, e.date]),
    'expenses-report',
    `Total: ${cur(D.expensesTotal(s))}`
  );
}
