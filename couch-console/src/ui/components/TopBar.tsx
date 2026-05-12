import { Gamepad2, Smartphone } from "lucide-react";
import type { Player } from "../../shared/types";

interface TopBarProps {
  clock: Date;
  players: Player[];
}

export function TopBar({ clock, players }: TopBarProps) {
  const timeStr = clock.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
  return (
    <div className="flex justify-between items-start mb-2">
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-500/40 flex-shrink-0">
          <img src="dragon.svg" alt="Dragon" />
        </div>
        <div>
          <h1 className="text-xl font-black uppercase tracking-tight italic leading-none">
            JDrakoon 3
          </h1>
          <div className="flex items-center gap-2 mt-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse flex-shrink-0" />
            <p className="text-[10px] text-indigo-400 font-bold uppercase tracking-widest">
              {players.length} Active ·&nbsp;
              <span className="text-gray-500">WIFI: LIVING_ROOM_5G</span>
            </p>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-5">
        <div className="text-right">
          <span className="text-3xl font-mono leading-none block tabular-nums">
            {timeStr}
          </span>
          <span className="text-[10px] text-gray-600 font-bold uppercase tracking-widest mt-1 block">
            CRT Active · Physics On
          </span>
        </div>
        <div className="p-3 bg-white/5 rounded-2xl border border-white/10 text-indigo-400">
          <Smartphone size={20} />
        </div>
      </div>
    </div>
  );
}
