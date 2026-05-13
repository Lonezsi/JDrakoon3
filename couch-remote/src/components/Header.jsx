import { useEffect, useState } from 'react';
import { Tv, WifiOff } from 'lucide-react';
import { useConsoleState } from '../hooks/useConsoleState';

function Pip({ color, pulse }) {
  return (
    <span className="relative flex h-2 w-2">
      {pulse && <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-60" style={{ backgroundColor: color }} />}
      <span className="relative inline-flex rounded-full h-2 w-2" style={{ backgroundColor: color }} />
    </span>
  );
}

export default function Header({ user }) {
  const state = useConsoleState();
  const [ping, setPing] = useState('--ms');
  const appName = state?.currentApp || 'Home';
  const connected = !!state;

  useEffect(() => {
    const id = setInterval(() => {
      setPing(`${Math.floor(Math.random() * 25 + 5)}ms`);
    }, 2000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="flex items-center gap-3 px-4 pt-5 pb-3 flex-shrink-0"
      style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
      <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-black text-white flex-shrink-0"
        style={{ backgroundColor: user.color.hex, boxShadow: `0 4px 12px ${user.color.hex}50` }}>
        {user.name[0].toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-black text-white leading-none truncate">{user.name}</p>
        <div className="flex items-center gap-1.5 mt-0.5">
          {connected ? (
            <>
              <Pip color="#4ade80" pulse />
              <p className="text-[10px] text-slate-600 font-bold uppercase tracking-wide">COUCH_BRAIN · {appName}</p>
            </>
          ) : (
            <>
              <WifiOff size={10} className="text-slate-500" />
              <p className="text-[10px] text-slate-600 font-bold uppercase tracking-wide">Disconnected</p>
            </>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <span className="text-[10px] text-slate-600 tabular-nums font-bold">{ping}</span>
        <div className="flex items-center gap-1.5 rounded-full px-3 py-1.5 border"
          style={{ background: 'rgba(99,102,241,0.10)', borderColor: 'rgba(99,102,241,0.25)' }}>
          <Tv size={11} className="text-indigo-400" />
          <span className="text-[10px] font-black text-indigo-400 uppercase tracking-wide">TV</span>
        </div>
      </div>
    </div>
  );
}
