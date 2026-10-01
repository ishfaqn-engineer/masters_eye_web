import React, { useEffect, useState } from 'react';
import { MessageCircle, LogOut, RefreshCw, UserRound, Download } from 'lucide-react';
import { AppState, Account, APP_VERSION, APP_CODE } from '../store';
import { call, checkUpdate, UpdateInfo, getServerUrl } from '../lib/server';
import { StatCard, WhatsAppBtn } from '../components/ui';

/* Landing page for public sign-ups (role 'user'): profile, how to reach the
   developer, and the update banner. No business records — those stay with
   master / vendor / team / client logins. */
export default function UserHome({ state, account, onLogout }: {
  state: AppState; account: Account; onLogout: () => void;
}) {
  const [update, setUpdate] = useState<UpdateInfo | null>(null);
  const [checking, setChecking] = useState(false);
  const [status, setStatus] = useState('');

  useEffect(() => {
    if (!getServerUrl(state)) return;
    let dead = false;
    (async () => {
      const res = await checkUpdate(APP_CODE);
      if (!dead && res.ok && res.update?.latest) setUpdate(res.update as UpdateInfo);
    })().catch(() => { /* offline */ });
    return () => { dead = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const checkNow = async () => {
    setChecking(true);
    setStatus('');
    try {
      const res = await call({ op: 'ping' });
      if (!res.ok) { setStatus('✗ ' + (res.error || 'server unreachable')); return; }
      const up = await checkUpdate(APP_CODE);
      if (up.ok && up.update?.latest) { setUpdate(up.update as UpdateInfo); setStatus(''); }
      else setStatus(up.ok ? '✓ You have the latest version.' : '✗ ' + (up.error || ''));
    } finally { setChecking(false); }
  };

  return (
    <div className="p-4 space-y-4">
      <div className="bg-white rounded-3xl shadow p-4">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-wood/10 flex items-center justify-center">
            <UserRound size={30} className="text-wood" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-black uppercase text-lg truncate">{account.name}</div>
            <div className="text-xs font-bold text-gray-400 uppercase">
              Member{account.username ? ` · @${account.username}` : ''}
            </div>
          </div>
        </div>
        <button onClick={onLogout}
          className="mt-4 w-full py-3 rounded-2xl bg-gray-900 text-white font-black uppercase text-xs active:scale-95 flex items-center justify-center gap-2">
          <LogOut size={16} /> Log out
        </button>
      </div>

      {update && (
        <div className="bg-amber-50 border-2 border-amber-200 rounded-3xl p-4">
          <div className="flex items-center gap-2 font-black uppercase text-sm text-amber-800">
            <Download size={16} /> Version {update.latest} is out
          </div>
          {update.notes && <div className="text-xs font-bold text-amber-700 mt-1">{update.notes}</div>}
          {update.url && (
            <a href={update.url} target="_blank" rel="noreferrer"
              className="mt-3 block w-full py-3 rounded-2xl bg-amber-500 text-white font-black uppercase text-xs text-center active:scale-95">
              Get the update
            </a>
          )}
        </div>
      )}

      <div className="bg-white rounded-3xl shadow p-4">
        <div className="font-black uppercase text-sm mb-3">App</div>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <StatCard label="Version" value={`v${APP_VERSION}`} sub="installed" />
          <StatCard label="Server" value={getServerUrl(state) ? 'On' : 'Off'} sub={getServerUrl(state) ? 'connected' : 'local only'} />
        </div>
        <button onClick={checkNow} disabled={checking}
          className="w-full py-3 rounded-2xl bg-gray-100 font-black uppercase text-xs active:scale-95 flex items-center justify-center gap-2">
          <RefreshCw size={15} className={checking ? 'animate-spin' : ''} /> {checking ? 'Checking…' : 'Check for updates'}
        </button>
        {status && <div className="text-xs font-black mt-2 text-center text-gray-600">{status}</div>}
      </div>

      {state.settings.supportEmail && (
        <div className="bg-white rounded-3xl shadow p-4">
          <div className="font-black uppercase text-sm mb-1">Need help?</div>
          <div className="text-xs font-bold text-gray-400 mb-3">
            Password reset, questions about the app — contact the developer.
          </div>
          <div className="grid grid-cols-2 gap-3">
            <a href={`mailto:${state.settings.supportEmail}`}
              className="py-3 rounded-2xl bg-wood text-white font-black uppercase text-xs active:scale-95 text-center">
              Email support
            </a>
            {state.settings.whatsappNumber && (
              <WhatsAppBtn phone={state.settings.whatsappNumber} message="Master's Eye — I need help with my account." label="WhatsApp" />
            )}
          </div>
        </div>
      )}

      <div className="text-center pb-2 text-[11px] font-bold text-gray-400 uppercase">
        The Master's Eye · Designed by Dr. Ishfaq Najar
      </div>
    </div>
  );
}
