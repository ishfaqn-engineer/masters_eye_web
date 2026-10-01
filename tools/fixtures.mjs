/* Demo fixtures for the headless harnesses.
   Fresh installs intentionally boot blank (loadState → blankState), but the
   audit and e2e scenarios still need sample clients, crew and orders to click
   through. This writes the old demo records into localStorage BEFORE the app
   loads, and skips itself as soon as the app has real data.
   Used only by tools/*.mjs — never shipped, never imported by the app. */
export function demoSeed() {
  try {
    if (localStorage.getItem('masters-eye-v2')) return;
    const d = new Date();
    const pad = n => String(n).padStart(2, '0');
    const t = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    localStorage.setItem('masters-eye-v2', JSON.stringify({
      v: 2,
      settings: { masterName: 'Master', masterPhoto: 'https://i.pravatar.cc/300?u=master', masterRate: 2000, whatsappNumber: '', currency: 'Rs', googleClientId: '' },
      accounts: [],
      workers: [
        { id: 'w1', name: 'Ali', photo: 'https://i.pravatar.cc/150?u=ali', rate: 1500, phone: '03001112223' },
        { id: 'w2', name: 'Khan', photo: 'https://i.pravatar.cc/150?u=khan', rate: 1200, phone: '03112223334' },
        { id: 'w3', name: 'Zaid', photo: 'https://i.pravatar.cc/150?u=zaid', rate: 1500, phone: '03334445557' },
      ],
      attendance: [],
      clients: [
        { id: 'c1', name: 'Rashid Villa', photo: 'https://i.pravatar.cc/300?u=rashid', phone: '03001234567', notes: 'Main door + 4 windows', totalOrderValue: 85000 },
        { id: 'c2', name: 'Sara Apartments', photo: 'https://i.pravatar.cc/300?u=sara', phone: '03117654321', notes: '', totalOrderValue: 40000 },
      ],
      vendors: [
        { id: 'v1', name: 'Timber Mart', phone: '03221112223', photo: 'https://i.pravatar.cc/150?u=timber' },
        { id: 'v2', name: 'Forest Co.', phone: '03334445556', photo: 'https://i.pravatar.cc/150?u=forest' },
      ],
      woodLots: [
        { id: 'l1', type: 'Teak', cubicFeet: 450, ratePerCubicFeet: 3200, vendorId: 'v1', photo: '', date: t },
        { id: 'l2', type: 'Sheesham', cubicFeet: 120, ratePerCubicFeet: 2400, vendorId: 'v2', photo: '', date: t },
        { id: 'l3', type: 'Oak', cubicFeet: 85, ratePerCubicFeet: 1900, vendorId: 'v1', photo: '', date: t },
      ],
      orders: [
        {
          id: 'o1', clientId: 'c1', kind: 'door', qty: 6, widthIn: 36, heightIn: 84, woodType: 'Teak', price: 48000, status: 'cutting', notes: '', files: [],
          specs: { doors: [{ id: 'sl1', label: 'Main door', qty: 6, widthIn: 36, heightIn: 84, woodCft: 9 }], windows: [], others: [], designs: [] }
        },
        {
          id: 'o2', clientId: 'c1', kind: 'window', qty: 4, widthIn: 48, heightIn: 60, woodType: 'Sheesham', price: 24000, status: 'pending', notes: '', files: [],
          specs: { doors: [], windows: [{ id: 'sl2', label: 'Sliding window', qty: 4, widthIn: 48, heightIn: 60, woodCft: 4.5 }], others: [], designs: [] }
        },
        {
          id: 'o3', clientId: 'c2', kind: 'door', qty: 2, widthIn: 32, heightIn: 80, woodType: 'Oak', price: 18000, status: 'polish', notes: '', files: [],
          specs: { doors: [{ id: 'sl3', label: 'Kitchen door', qty: 2, widthIn: 32, heightIn: 80, woodCft: 2.5 }], windows: [], others: [], designs: [] }
        },
      ],
      expenses: [
        { id: 'e1', label: 'Sanding belts', amount: 2500, category: 'consumable', recurring: 'monthly', date: t, photo: '' },
        { id: 'e2', label: 'Machine oil', amount: 1200, category: 'daily', recurring: 'daily', date: t, photo: '' },
        { id: 'e3', label: 'CNC blade', amount: 32000, category: 'asset', recurring: 'yearly', date: t, photo: '' },
      ],
      ledger: [
        { id: 'led0', kind: 'in', bucket: 'capital', refId: 'master', amount: 400000, date: t, note: 'Opening capital / own money' },
        { id: 'led1', kind: 'in', bucket: 'client', refId: 'c1', amount: 20000, date: t, note: 'Advance' },
        { id: 'led2', kind: 'in', bucket: 'client', refId: 'c2', amount: 10000, date: t, note: 'Advance' },
        { id: 'led3', kind: 'out', bucket: 'vendor', refId: 'l2', amount: 150000, date: t, note: 'Part payment' },
        { id: 'led4', kind: 'out', bucket: 'vendor', refId: 'l3', amount: 161500, date: t, note: 'Full payment' },
      ],
      quotes: [
        { id: 'q1', clientId: 'c1', date: t, items: [{ id: 'qi1', desc: 'Wardrobe 6ft', qty: 1, rate: 65000 }], discount: 5000, note: 'Includes polish', validDays: 7, status: 'draft' },
      ],
      lastSync: null,
    }));
  } catch { /* storage unavailable — the run simply starts blank */ }
}
