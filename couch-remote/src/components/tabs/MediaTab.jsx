import { useState } from 'react';
import {
  Play, Pause, SkipForward, SkipBack, Volume2, VolumeX,
  Trash2, ChevronUp, ChevronDown, Shuffle, Repeat, Plus, Send
} from 'lucide-react';
import { sendAction, Actions } from '../../services/inputActions';
import { useConsoleState } from '../../hooks/useConsoleState';

function NowPlayingBars() {
  return (
    <div className="flex items-end gap-[2px] h-4">
      {[5,9,7,11,6].map((h,i) => (
        <div key={i} className="w-[3px] rounded-full bg-indigo-400 bar-bounce"
          style={{ height:`${h}px`, animationDelay:`${i*80}ms` }} />
      ))}
    </div>
  );
}

export default function MediaTab() {
  const state = useConsoleState();
  const media = state?.mediaState || {
    playing: false, current: null, queue: [], volume: 72, muted: false, progress: 0, loop: false, shuffle: false
  };
  const [newUrl, setNewUrl] = useState('');

  const addToQueue = () => {
    if (newUrl.trim()) {
      sendAction(Actions.ADD_TO_QUEUE, { url: newUrl });
      setNewUrl('');
    }
  };

  const removeFromQueue = (index) => sendAction(Actions.REMOVE_FROM_QUEUE, { index });
  const moveUp = (index) => sendAction(Actions.MOVE_QUEUE_ITEM, { index, direction: -1 });
  const moveDown = (index) => sendAction(Actions.MOVE_QUEUE_ITEM, { index, direction: 1 });
  const clearQueue = () => sendAction(Actions.CLEAR_QUEUE);

  const currentItem = media.queue[0] || null;

  return (
    <div className="flex flex-col gap-4 pt-3 h-full">
      {currentItem && (
        <div className="w-full rounded-3xl border p-4 flex gap-4 items-center"
          style={{ background: 'rgba(255,255,255,0.05)', borderColor: 'rgba(255,255,255,0.09)' }}>
          <img src={currentItem.thumb} className="w-16 h-16 rounded-2xl object-cover flex-shrink-0" alt="" />
          <div className="flex-1 min-w-0">
            <p className="font-black text-sm text-white leading-snug truncate">{currentItem.title}</p>
            <p className="text-[10px] text-slate-500 mt-1 font-bold">{currentItem.channel}</p>
            <div className="flex items-center gap-2 mt-1.5">
              {media.playing ? <NowPlayingBars /> : <div className="w-3 h-3 rounded-sm bg-slate-600" />}
              <span className="text-[10px] text-indigo-400 font-black uppercase tracking-wide">
                {media.playing ? 'Playing' : 'Paused'}
              </span>
            </div>
          </div>
        </div>
      )}

      <input type="range" min={0} max={100} value={media.progress}
        onChange={e => sendAction(Actions.MEDIA_SEEK, { progress: +e.target.value })}
        className="w-full h-1.5 rounded-full appearance-none"
        style={{ accentColor: '#6366f1' }}
      />

      <div className="flex items-center justify-center gap-6 w-full">
        <button onClick={() => sendAction(Actions.MEDIA_PREV)}
          className="w-14 h-14 rounded-full flex items-center justify-center text-slate-400 active:text-white active:scale-90"
          style={{ background: 'rgba(255,255,255,0.06)', border: '1.5px solid rgba(255,255,255,0.09)' }}>
          <SkipBack size={22} />
        </button>
        <button onClick={() => sendAction(Actions.MEDIA_PLAY_PAUSE)}
          className="w-20 h-20 rounded-full flex items-center justify-center active:scale-90"
          style={{ background: '#6366f1', boxShadow: '0 10px 30px #6366f155' }}>
          {media.playing ? <Pause size={30} className="text-white" /> : <Play size={30} className="text-white ml-1" />}
        </button>
        <button onClick={() => sendAction(Actions.MEDIA_NEXT)}
          className="w-14 h-14 rounded-full flex items-center justify-center text-slate-400 active:text-white active:scale-90"
          style={{ background: 'rgba(255,255,255,0.06)', border: '1.5px solid rgba(255,255,255,0.09)' }}>
          <SkipForward size={22} />
        </button>
      </div>

      <div className="flex items-center gap-3">
        <button onClick={() => sendAction(Actions.MEDIA_MUTE)} className="p-2 text-slate-500 active:text-white">
          {media.muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
        </button>
        <input type="range" min={0} max={100} value={media.muted ? 0 : media.volume}
          onChange={e => sendAction(Actions.MEDIA_VOLUME, { volume: +e.target.value })}
          className="flex-1 h-1.5 appearance-none rounded-full"
          style={{ accentColor: '#6366f1' }}
        />
        <span className="text-xs font-black text-slate-600 w-7">{media.muted ? 0 : media.volume}</span>
      </div>

      <div className="flex gap-2">
        <button onClick={() => sendAction(Actions.LOOP_TOGGLE)}
          className={`flex-1 py-3 rounded-xl font-black text-xs active:scale-95 ${media.loop ? 'bg-indigo-600 text-white' : 'bg-white/5 text-slate-400 border border-white/10'}`}>
          <Repeat size={14} className="inline mr-1" />{media.loop ? 'Loop On' : 'Loop'}
        </button>
        <button onClick={() => sendAction(Actions.SHUFFLE_QUEUE)}
          className={`flex-1 py-3 rounded-xl font-black text-xs active:scale-95 ${media.shuffle ? 'bg-indigo-600 text-white' : 'bg-white/5 text-slate-400 border border-white/10'}`}>
          <Shuffle size={14} className="inline mr-1" />{media.shuffle ? 'Shuffle On' : 'Shuffle'}
        </button>
        <button onClick={() => sendAction(Actions.PLAYBACK_SPEED, { speed: 2 })}
          className="flex-1 py-3 rounded-xl font-black text-xs bg-white/5 text-slate-400 border border-white/10 active:scale-95">
          Speed
        </button>
        <button onClick={() => sendAction(Actions.SUBTITLES_TOGGLE)}
          className="flex-1 py-3 rounded-xl font-black text-xs bg-white/5 text-slate-400 border border-white/10 active:scale-95">
          Subs
        </button>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-600">Queue</span>
          <button onClick={clearQueue} className="text-[10px] text-red-400 font-black">Clear</button>
        </div>
        {media.queue.map((item, i) => (
          <div key={item.id} className="flex items-center gap-3 p-3 rounded-2xl border border-white/[0.07] bg-white/5">
            <img src={item.thumb} className="w-10 h-10 rounded-xl object-cover flex-shrink-0" alt="" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-slate-100 truncate">{item.title}</p>
              <p className="text-[10px] text-slate-500">{item.channel} · {item.duration}</p>
            </div>
            <div className="flex flex-col gap-0.5">
              <button onClick={() => moveUp(i)} disabled={i===0} className="p-1.5 rounded-lg text-slate-600 disabled:opacity-20"><ChevronUp size={13} /></button>
              <button onClick={() => moveDown(i)} disabled={i===media.queue.length-1} className="p-1.5 rounded-lg text-slate-600 disabled:opacity-20"><ChevronDown size={13} /></button>
            </div>
            <button onClick={() => removeFromQueue(i)} className="p-2 text-slate-700 active:text-red-400"><Trash2 size={16} /></button>
          </div>
        ))}
      </div>

      <div className="flex gap-2 items-center">
        <input
          type="url" value={newUrl}
          onChange={e => setNewUrl(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addToQueue()}
          placeholder="Paste URL to add…"
          className="flex-1 rounded-2xl px-4 py-3.5 text-sm font-bold outline-none"
          style={{ background: 'rgba(255,255,255,0.05)', border: '1.5px solid rgba(255,255,255,0.09)', color: '#f1f5f9', caretColor: '#6366f1' }}
        />
        <button onClick={addToQueue} className="p-3.5 rounded-2xl bg-indigo-600 active:scale-90 text-white">
          <Plus size={18} />
        </button>
      </div>
    </div>
  );
}
