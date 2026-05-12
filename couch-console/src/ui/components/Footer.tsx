import { MonitorPlay, Play, Settings, LogOut } from 'lucide-react'
import { MOCK_QUEUE } from '../../shared/constants'
import { notifService } from '../../services/notificationService'

interface FooterProps {
  players: { id: string; name: string; color: string }[]
}

export function Footer({ players }: FooterProps) {
  return (
    <div className="flex items-end gap-6 h-32">
      {/* In the Lobby */}
      <div className="flex flex-col gap-2.5 flex-shrink-0">
        <h3 className="text-[10px] font-black text-gray-600 uppercase tracking-widest">In the Lobby</h3>
        <div className="flex -space-x-2.5 min-h-[48px] items-center">
          {players.map(p => (
            <div
              key={p.id}
              style={{ backgroundColor: p.color }}
              className="w-11 h-11 rounded-full border-[3px] border-[#04040a] flex items-center justify-center text-[11px] font-black shadow-lg hover:z-10 hover:scale-110 transition-transform relative"
              title={p.name}
            >
              {p.name[0]}
            </div>
          ))}
          {players.length === 0 && (
            <p className="text-[10px] text-gray-700 italic">WASD · UJHK to join</p>
          )}
        </div>
      </div>

      {/* Media Queue */}
      <div className="flex-1 bg-white/5 rounded-3xl border border-white/10 p-4 flex items-center gap-5 min-w-0">
        <div className="p-2.5 bg-indigo-500/20 rounded-xl text-indigo-400 flex-shrink-0">
          <MonitorPlay size={18} />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-[10px] font-black text-gray-600 uppercase tracking-widest mb-2">Up Next</h3>
          <div className="flex gap-2.5">
            {MOCK_QUEUE.map(item => (
              <div key={item.id} className="flex items-center gap-2.5 bg-white/5 rounded-xl p-2 pr-3 border border-white/5 flex-shrink-0">
                <img src={item.thumb} className="w-9 h-9 rounded-lg object-cover flex-shrink-0" alt="" />
                <div className="min-w-0">
                  <p className="text-xs font-black leading-tight truncate max-w-[120px]">{item.title}</p>
                  <span className="text-[10px] text-gray-500">{item.duration}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
        <button
          onClick={() => notifService.push('Opening video player…')}
          className="flex items-center gap-1.5 bg-white text-black px-4 py-2 rounded-xl font-black text-xs hover:scale-105 active:scale-95 transition-transform uppercase tracking-wide flex-shrink-0"
        >
          <Play size={13} />Play
        </button>
      </div>

      {/* System Buttons */}
      <div className="flex gap-2.5 flex-shrink-0">
        <button
          onClick={() => notifService.push('Settings: configure apps, themes, and input mappings.')}
          className="p-3.5 bg-white/5 rounded-2xl border border-white/10 text-gray-500 hover:text-white hover:bg-white/10 transition-colors"
        >
          <Settings size={18} />
        </button>
        <button
          onClick={() => notifService.push('Shutting down… Goodbye!')}
          className="p-3.5 bg-red-500/10 rounded-2xl border border-red-500/20 text-red-500 hover:bg-red-500/20 transition-colors"
        >
          <LogOut size={18} />
        </button>
      </div>
    </div>
  )
}
