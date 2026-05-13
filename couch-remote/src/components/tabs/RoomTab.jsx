import { Gamepad2 } from 'lucide-react';
import { useConsoleState } from '../../hooks/useConsoleState';
import { sendAction, Actions } from '../../services/inputActions';

export default function RoomTab() {
  const state = useConsoleState();
  const players = state?.connectedPlayers || [];

  const emote = (type) => sendAction(Actions.EMOTE, { type });

  return (
    <div className="flex flex-col gap-5 pt-3 h-full">
      <div className="flex items-center justify-between">
        <h2 className="text-[10px] font-black uppercase tracking-widest text-slate-600">Lobby</h2>
        <div className="flex gap-2">
          <button onClick={() => emote('wave')} className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-sm font-bold text-slate-300 active:scale-95">👋 Wave</button>
          <button onClick={() => emote('hype')} className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-sm font-bold text-slate-300 active:scale-95">🎉 Hype</button>
        </div>
      </div>

      <div className="space-y-2">
        {players.length === 0 && (
          <div className="text-center py-8 text-slate-600">
            <Gamepad2 size={40} className="mx-auto mb-2 opacity-40" />
            <p className="text-sm font-bold">No one else here yet.</p>
            <p className="text-xs mt-1">Open the TV dashboard to see cubes.</p>
          </div>
        )}
        {players.map(p => (
          <div key={p.id} className="flex items-center gap-3 p-4 rounded-2xl border bg-white/5 border-white/10">
            <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-black text-white"
              style={{ backgroundColor: p.color }}>
              {p.name[0].toUpperCase()}
            </div>
            <div>
              <p className="text-sm font-bold text-white">{p.name}</p>
              <p className="text-[10px] text-slate-500">{p.deviceType || 'local'}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-auto">
        <p className="text-[10px] text-slate-600 mb-2">Quick Joystick (cube move)</p>
        <div className="grid grid-cols-3 gap-2 w-36">
          <div></div>
          <button onTouchStart={() => sendAction(Actions.CUBE_MOVE, { direction: 'up' })}
            className="p-3 rounded-2xl bg-white/5 border border-white/10 text-slate-400 active:scale-90">↑</button>
          <div></div>
          <button onTouchStart={() => sendAction(Actions.CUBE_MOVE, { direction: 'left' })}
            className="p-3 rounded-2xl bg-white/5 border border-white/10 text-slate-400 active:scale-90">←</button>
          <div className="p-3 rounded-full bg-indigo-600/20 border border-indigo-500/30"></div>
          <button onTouchStart={() => sendAction(Actions.CUBE_MOVE, { direction: 'right' })}
            className="p-3 rounded-2xl bg-white/5 border border-white/10 text-slate-400 active:scale-90">→</button>
          <div></div>
          <button onTouchStart={() => sendAction(Actions.CUBE_MOVE, { direction: 'down' })}
            className="p-3 rounded-2xl bg-white/5 border border-white/10 text-slate-400 active:scale-90">↓</button>
          <div></div>
        </div>
        <button onTouchStart={() => sendAction(Actions.JUMP)} className="mt-2 w-full py-3 rounded-xl bg-indigo-600/30 border border-indigo-500/50 text-indigo-400 font-black text-sm active:scale-95">
          Jump
        </button>
      </div>
    </div>
  );
}
