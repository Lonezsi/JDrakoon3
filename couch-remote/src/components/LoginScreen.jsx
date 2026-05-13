import { useState } from 'react';
import { Check, Tv } from 'lucide-react';

const AVATAR_COLORS = [
  { hex:"#6366f1", name:"Indigo"  },
  { hex:"#ec4899", name:"Pink"    },
  { hex:"#10b981", name:"Emerald" },
  { hex:"#f59e0b", name:"Amber"   },
  { hex:"#06b6d4", name:"Cyan"    },
  { hex:"#ef4444", name:"Red"     },
];

function Pip({ color, pulse }) {
  return (
    <span className="relative flex h-2 w-2">
      {pulse && <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-60" style={{ backgroundColor: color }} />}
      <span className="relative inline-flex rounded-full h-2 w-2" style={{ backgroundColor: color }} />
    </span>
  );
}

export default function LoginScreen({ onJoin }) {
  const [name,  setName]  = useState("");
  const [color, setColor] = useState(AVATAR_COLORS[0]);
  const [err,   setErr]   = useState("");
  const [shake, setShake] = useState(false);

  const submit = () => {
    if (!name.trim()) {
      setErr("Pick a name first!"); setShake(true);
      setTimeout(() => setShake(false), 400);
      return;
    }
    onJoin(name.trim(), color);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-10" style={{ background:"#06060c" }}>
      <div className="mb-10 text-center">
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-xl"
          style={{ background:"#6366f1", boxShadow:"0 12px 32px #6366f150" }}>
          <Tv size={30} className="text-white" />
        </div>
        <h1 className="text-2xl font-black italic uppercase tracking-tight text-white">Couch Console</h1>
        <p className="text-slate-500 text-sm mt-1 font-medium">Your phone is the controller.</p>
      </div>

      <div className="w-full max-w-sm space-y-5">
        <div>
          <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Your Name</label>
          <input
            type="text" value={name} maxLength={20}
            onChange={e => { setName(e.target.value); setErr(""); }}
            onKeyDown={e => e.key === "Enter" && submit()}
            placeholder="e.g. couch_goblin"
            className={`w-full rounded-2xl px-4 py-4 text-base font-bold outline-none transition-all ${shake ? 'error-shake' : ''}`}
            style={{
              background:"rgba(255,255,255,0.05)",
              border: err ? "1.5px solid #ef4444" : "1.5px solid rgba(255,255,255,0.10)",
              color:"#f1f5f9",
              caretColor:"#6366f1"
            }}
          />
          {err && <p className="text-red-400 text-xs mt-1.5 font-bold">{err}</p>}
        </div>

        <div>
          <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-3">Your Color</label>
          <div className="flex gap-3">
            {AVATAR_COLORS.map(c => (
              <button key={c.hex} onClick={() => setColor(c)}
                className="w-11 h-11 rounded-full flex items-center justify-center transition-all active:scale-90 flex-shrink-0"
                style={{
                  backgroundColor: c.hex,
                  boxShadow: color.hex === c.hex ? `0 0 0 3px #06060c, 0 0 0 5.5px ${c.hex}` : "none",
                  transform: color.hex === c.hex ? "scale(1.18)" : "scale(1)"
                }}>
                {color.hex === c.hex && <Check size={15} className="text-white" strokeWidth={3} />}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-3 rounded-2xl px-4 py-3 border"
          style={{ background:"rgba(255,255,255,0.04)", borderColor:"rgba(255,255,255,0.08)" }}>
          <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-black flex-shrink-0 text-white"
            style={{ backgroundColor: color.hex, boxShadow:`0 4px 12px ${color.hex}50` }}>
            {name ? name[0].toUpperCase() : "?"}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-black text-white leading-none truncate">{name || "Your Name"}</p>
            <p className="text-[10px] text-slate-500 mt-0.5 font-bold">Phone Controller · Remote</p>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <Pip color="#4ade80" pulse />
            <span className="text-[10px] text-emerald-400 font-black">READY</span>
          </div>
        </div>

        <button onClick={submit}
          className="w-full py-4 rounded-2xl font-black text-base uppercase tracking-widest text-white transition-all active:scale-95"
          style={{ background: color.hex, boxShadow:`0 10px 28px ${color.hex}45` }}>
          Join the Couch →
        </button>

        <button onClick={() => onJoin("Guest", AVATAR_COLORS[3])}
          className="w-full py-3 text-slate-600 text-sm font-bold hover:text-slate-400 transition-colors">
          Continue as Guest
        </button>
      </div>

      <style>{`
        @keyframes shake { 0%,100%{transform:translateX(0)} 20%,60%{transform:translateX(-6px)} 40%,80%{transform:translateX(6px)} }
        .error-shake { animation: shake 0.35s ease; }
      `}</style>
    </div>
  );
}
