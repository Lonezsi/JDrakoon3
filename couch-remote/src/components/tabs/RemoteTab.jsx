import { useState } from 'react';
import {
  ArrowUp, ArrowDown, ArrowLeft, ArrowRight,
  Home, Power, Play, Pause, Volume2, VolumeX,
  Maximize, Keyboard, MousePointer2, Gamepad2, Settings, X, Circle, Square, Triangle
} from 'lucide-react';
import {
  sendAction, Actions,
  navUp, navDown, navLeft, navRight, confirm, back, home, start, menu, power,
} from '../../services/inputActions';
import { useConsoleState } from '../../hooks/useConsoleState';

export default function RemoteTab() {
  const state = useConsoleState();
  const [vol, setVol] = useState(72);
  const [muted, setMuted] = useState(false);

  const currentScreen = state?.currentScreen || 'HOME';

  // Context-aware button labels
  const getABXYLabels = () => {
    switch (currentScreen) {
      case 'HOME': return { A: 'Launch', B: 'Back', X: 'Info', Y: 'Settings' };
      case 'APP_RUNNING': return { A: 'Select', B: 'Back', X: 'Menu', Y: 'Options' };
      default: return { A: 'A', B: 'B', X: 'X', Y: 'Y' };
    }
  };
  const labels = getABXYLabels();

  return (
    <div className="flex flex-col gap-5 pt-3 h-full">
      {/* System bar */}
      <div className="flex justify-between items-center">
        <button onClick={home} className="p-3 rounded-2xl bg-white/5 border border-white/10 active:scale-90">
          <Home size={18} className="text-slate-300" />
        </button>
        <button onClick={back} className="p-3 rounded-2xl bg-white/5 border border-white/10 active:scale-90">
          <ArrowLeft size={18} className="text-slate-300" />
        </button>
        <button onClick={start} className="p-3 rounded-2xl bg-white/5 border border-white/10 active:scale-90">
          <Triangle size={18} className="text-slate-300" />
        </button>
        <button onClick={menu} className="p-3 rounded-2xl bg-white/5 border border-white/10 active:scale-90">
          <Settings size={18} className="text-slate-300" />
        </button>
        <button onClick={power} className="p-3 rounded-2xl bg-red-500/10 border border-red-500/20 active:scale-90 text-red-400">
          <Power size={18} />
        </button>
      </div>

      {/* D-Pad + ABXY */}
      <div className="flex items-center justify-between flex-1">
        {/* D-Pad */}
        <div className="grid grid-cols-3 gap-1.5 w-36">
          <div></div>
          <button onTouchStart={navUp} onMouseDown={navUp} className="p-4 rounded-2xl bg-white/5 border border-white/10 active:scale-90 text-slate-300">
            <ArrowUp size={22} />
          </button>
          <div></div>
          <button onTouchStart={navLeft} onMouseDown={navLeft} className="p-4 rounded-2xl bg-white/5 border border-white/10 active:scale-90 text-slate-300">
            <ArrowLeft size={22} />
          </button>
          <div className="p-4 rounded-full bg-indigo-600/20 border border-indigo-500/30"></div>
          <button onTouchStart={navRight} onMouseDown={navRight} className="p-4 rounded-2xl bg-white/5 border border-white/10 active:scale-90 text-slate-300">
            <ArrowRight size={22} />
          </button>
          <div></div>
          <button onTouchStart={navDown} onMouseDown={navDown} className="p-4 rounded-2xl bg-white/5 border border-white/10 active:scale-90 text-slate-300">
            <ArrowDown size={22} />
          </button>
          <div></div>
        </div>

        {/* ABXY */}
        <div className="grid grid-cols-3 gap-2 w-36">
          <div></div>
          <button onTouchStart={() => confirm()} onMouseDown={() => confirm()} className="p-4 rounded-full bg-green-500/20 border border-green-500/30 active:scale-90 text-green-400 font-black text-xs">
            A
          </button>
          <div></div>
          <button onTouchStart={back} onMouseDown={back} className="p-4 rounded-full bg-red-500/20 border border-red-500/30 active:scale-90 text-red-400 font-black text-xs">
            B
          </button>
          <div className="p-4 rounded-full bg-indigo-600/20 border border-indigo-500/30"></div>
          <button onTouchStart={() => sendAction(Actions.CONFIRM)} onMouseDown={() => sendAction(Actions.CONFIRM)} className="p-4 rounded-full bg-blue-500/20 border border-blue-500/30 active:scale-90 text-blue-400 font-black text-xs">
            X
          </button>
          <div></div>
          <button onTouchStart={() => sendAction(Actions.BACK)} onMouseDown={() => sendAction(Actions.BACK)} className="p-4 rounded-full bg-yellow-500/20 border border-yellow-500/30 active:scale-90 text-yellow-400 font-black text-xs">
            Y
          </button>
          <div></div>
        </div>
      </div>

      {/* Bottom controls */}
      <div className="flex items-center gap-3 justify-between">
        <button onClick={() => sendAction(Actions.FULLSCREEN)} className="p-3 rounded-2xl bg-white/5 border border-white/10 active:scale-90 text-slate-400">
          <Maximize size={18} />
        </button>
        <div className="flex items-center gap-2 flex-1">
          <button onClick={() => setMuted(m => !m)} className="p-2 text-slate-500 active:text-white">
            {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
          </button>
          <input type="range" min={0} max={100} value={muted ? 0 : vol}
            onChange={e => { setVol(+e.target.value); setMuted(false); sendAction(Actions.MEDIA_VOLUME, { volume: +e.target.value }); }}
            className="flex-1 h-1.5 appearance-none rounded-full"
            style={{ accentColor: '#6366f1' }}
          />
          <span className="text-xs font-black text-slate-600 w-7">{muted ? 0 : vol}</span>
        </div>
        <button onClick={() => sendAction(Actions.KEY_PRESS, { key: 'Keyboard' })} className="p-3 rounded-2xl bg-white/5 border border-white/10 active:scale-90 text-slate-400">
          <Keyboard size={18} />
        </button>
        <button onClick={() => sendAction(Actions.KEY_PRESS, { key: 'Touchpad' })} className="p-3 rounded-2xl bg-white/5 border border-white/10 active:scale-90 text-slate-400">
          <MousePointer2 size={18} />
        </button>
      </div>
    </div>
  );
}
