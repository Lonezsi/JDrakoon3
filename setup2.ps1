# ------------------------------------------------------------
# 2. Create couch-remote (Phone)
# ------------------------------------------------------------
Write-Host "`n[2/2] Building couch-remote" -ForegroundColor Green

Push-Location couch-remote

@'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
})
'@ | Out-File -FilePath vite.config.js -Encoding utf8

@'
@import "tailwindcss";
'@ | Out-File -FilePath src/index.css -Encoding utf8

# Create directories
mkdir src/services, src/hooks, src/components/tabs -Force

# src/services/inputActions.js
@'
let sendFn = (action) => console.log('[mock] sendAction', action);

export function setTransport(fn) {
  sendFn = fn;
}

export const Actions = {
  NAV_UP: 'NAV_UP',
  NAV_DOWN: 'NAV_DOWN',
  NAV_LEFT: 'NAV_LEFT',
  NAV_RIGHT: 'NAV_RIGHT',
  CONFIRM: 'CONFIRM',
  BACK: 'BACK',
  HOME: 'HOME',
  START: 'START',
  MENU: 'MENU',
  POWER: 'POWER',
  MOUSE_MOVE: 'MOUSE_MOVE',
  MOUSE_CLICK: 'MOUSE_CLICK',
  MOUSE_RIGHT_CLICK: 'MOUSE_RIGHT_CLICK',
  SCROLL: 'SCROLL',
  KEY_PRESS: 'KEY_PRESS',
  TEXT_INPUT: 'TEXT_INPUT',
  MEDIA_PLAY_PAUSE: 'MEDIA_PLAY_PAUSE',
  MEDIA_NEXT: 'MEDIA_NEXT',
  MEDIA_PREV: 'MEDIA_PREV',
  MEDIA_VOLUME: 'MEDIA_VOLUME',
  MEDIA_MUTE: 'MEDIA_MUTE',
  MEDIA_SEEK: 'MEDIA_SEEK',
  FULLSCREEN: 'FULLSCREEN',
  ADD_TO_QUEUE: 'ADD_TO_QUEUE',
  REMOVE_FROM_QUEUE: 'REMOVE_FROM_QUEUE',
  MOVE_QUEUE_ITEM: 'MOVE_QUEUE_ITEM',
  CLEAR_QUEUE: 'CLEAR_QUEUE',
  SHUFFLE_QUEUE: 'SHUFFLE_QUEUE',
  LOOP_TOGGLE: 'LOOP_TOGGLE',
  PLAYBACK_SPEED: 'PLAYBACK_SPEED',
  SUBTITLES_TOGGLE: 'SUBTITLES_TOGGLE',
  EMOTE: 'EMOTE',
  CUBE_MOVE: 'CUBE_MOVE',
  JUMP: 'JUMP',
};

export function sendAction(type, payload = {}) {
  sendFn({ type, payload });
}

export function navUp()    { sendAction(Actions.NAV_UP); }
export function navDown()  { sendAction(Actions.NAV_DOWN); }
export function navLeft()  { sendAction(Actions.NAV_LEFT); }
export function navRight() { sendAction(Actions.NAV_RIGHT); }
export function confirm()  { sendAction(Actions.CONFIRM); }
export function back()     { sendAction(Actions.BACK); }
export function home()     { sendAction(Actions.HOME); }
export function start()    { sendAction(Actions.START); }
export function menu()     { sendAction(Actions.MENU); }
export function power()    { sendAction(Actions.POWER); }
'@ | Out-File -FilePath src/services/inputActions.js -Encoding utf8

# src/services/socket.js
@'
const MOCK_STATE = {
  currentApp: 'home',
  currentScreen: 'HOME',
  mediaState: {
    playing: false,
    current: null,
    queue: [],
    volume: 72,
    muted: false,
    progress: 0,
    loop: false,
    shuffle: false,
  },
  connectedPlayers: [],
  fullscreen: false,
};

let listeners = [];

export function connect(url) {
  return {
    subscribe(fn) {
      listeners.push(fn);
      fn(MOCK_STATE);
      return () => { listeners = listeners.filter(l => l !== fn); };
    },
    sendAction: (action) => {
      console.log('[WebSocket]', action);
    },
    disconnect() {},
  };
}
'@ | Out-File -FilePath src/services/socket.js -Encoding utf8

# src/hooks/useConsoleState.js
@'
import { useState, useEffect } from 'react';
import { connect } from '../services/socket';

let cachedState = null;
const subscriberSet = new Set();

export function useConsoleState() {
  const [state, setState] = useState(cachedState);

  useEffect(() => {
    const connection = connect();
    const unsub = connection.subscribe((newState) => {
      cachedState = newState;
      setState(newState);
      subscriberSet.forEach(fn => fn(newState));
    });
    return () => unsub();
  }, []);

  return state;
}

export function onStateChange(fn) {
  subscriberSet.add(fn);
  return () => subscriberSet.delete(fn);
}
'@ | Out-File -FilePath src/hooks/useConsoleState.js -Encoding utf8

# src/components/Header.jsx
@'
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
'@ | Out-File -FilePath src/components/Header.jsx -Encoding utf8

# src/components/LoginScreen.jsx (original)
@'
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
'@ | Out-File -FilePath src/components/LoginScreen.jsx -Encoding utf8

# Now the tabs... We'll write RemoteTab, TouchpadTab, MediaTab, RoomTab.
# Since they are large, we'll use here-strings for each.

# RemoteTab.jsx
@'
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
'@ | Out-File -FilePath src/components/tabs/RemoteTab.jsx -Encoding utf8

# TouchpadTab.jsx
@'
import { useState, useRef } from 'react';
import { Keyboard, CornerDownLeft } from 'lucide-react';
import { sendAction, Actions } from '../../services/inputActions';

export default function TouchpadTab() {
  const [inputText, setInputText] = useState('');
  const [twoFinger, setTwoFinger] = useState(false);
  const touchRef = useRef(null);

  const sendText = () => {
    if (inputText.trim()) {
      sendAction(Actions.TEXT_INPUT, { text: inputText });
      setInputText('');
    }
  };

  const handleTouchStart = (e) => {
    if (e.touches.length >= 2) setTwoFinger(true);
  };
  const handleTouchEnd = (e) => {
    if (e.touches.length === 0) setTwoFinger(false);
  };
  const handleTouchMove = (e) => {
    if (e.touches.length === 1 && !twoFinger) {
      const dx = e.touches[0].clientX - (touchRef.current?.lastX || e.touches[0].clientX);
      const dy = e.touches[0].clientY - (touchRef.current?.lastY || e.touches[0].clientY);
      touchRef.current.lastX = e.touches[0].clientX;
      touchRef.current.lastY = e.touches[0].clientY;
      sendAction(Actions.MOUSE_MOVE, { dx, dy });
    } else if (e.touches.length === 2) {
      const dy = e.touches[0].clientY - (touchRef.current?.lastScrollY || e.touches[0].clientY);
      touchRef.current.lastScrollY = e.touches[0].clientY;
      sendAction(Actions.SCROLL, { dy });
    }
  };

  const handleTap = (e) => {
    if (twoFinger) {
      sendAction(Actions.MOUSE_RIGHT_CLICK);
    } else {
      sendAction(Actions.MOUSE_CLICK);
    }
  };

  return (
    <div className="flex flex-col gap-4 pt-3 h-full">
      {/* Touch surface */}
      <div
        ref={touchRef}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onTouchMove={handleTouchMove}
        onClick={handleTap}
        className="flex-1 rounded-3xl border-2 border-dashed border-white/10 flex items-center justify-center text-slate-700 font-bold text-sm active:bg-white/5 transition-colors"
        style={{ background: 'rgba(255,255,255,0.02)' }}
      >
        <span>{twoFinger ? 'Two‑finger (scroll / right‑click)' : 'Drag to move · Tap to click'}</span>
      </div>

      {/* Utility row */}
      <div className="flex flex-wrap gap-2">
        {['ESC', 'ALT+TAB', 'WIN', 'Enter'].map(key => (
          <button key={key}
            onClick={() => sendAction(Actions.KEY_PRESS, { key })}
            className="flex-1 py-3 rounded-xl bg-white/5 border border-white/10 text-slate-400 font-black text-xs active:scale-95">
            {key}
          </button>
        ))}
      </div>

      {/* Keyboard input */}
      <div className="flex gap-2 items-center">
        <input
          type="text" value={inputText}
          onChange={e => setInputText(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && sendText()}
          placeholder="Type to send to TV…"
          className="flex-1 rounded-2xl px-4 py-3.5 text-sm font-bold outline-none"
          style={{
            background: 'rgba(255,255,255,0.05)',
            border: '1.5px solid rgba(255,255,255,0.09)',
            color: '#f1f5f9',
            caretColor: '#6366f1'
          }}
        />
        <button onClick={sendText}
          className="p-3.5 rounded-2xl bg-indigo-600 active:scale-90 text-white">
          <CornerDownLeft size={18} />
        </button>
      </div>
    </div>
  );
}
'@ | Out-File -FilePath src/components/tabs/TouchpadTab.jsx -Encoding utf8

# MediaTab.jsx
@'
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
'@ | Out-File -FilePath src/components/tabs/MediaTab.jsx -Encoding utf8

# RoomTab.jsx
@'
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
'@ | Out-File -FilePath src/components/tabs/RoomTab.jsx -Encoding utf8

# src/App.jsx (phone)
@'
import { useState } from 'react';
import LoginScreen from './components/LoginScreen';
import Header from './components/Header';
import RemoteTab from './components/tabs/RemoteTab';
import TouchpadTab from './components/tabs/TouchpadTab';
import MediaTab from './components/tabs/MediaTab';
import RoomTab from './components/tabs/RoomTab';
import { Gamepad2, MousePointer2, Play, Users } from 'lucide-react';

const TABS = [
  { id: 'REMOTE', Icon: Gamepad2, label: 'Remote' },
  { id: 'TOUCHPAD', Icon: MousePointer2, label: 'Touchpad' },
  { id: 'MEDIA', Icon: Play, label: 'Media' },
  { id: 'ROOM', Icon: Users, label: 'Room' },
];

export default function App() {
  const [screen, setScreen] = useState('LOGIN');
  const [tab, setTab] = useState('REMOTE');
  const [user, setUser] = useState(null);

  const join = (name, color) => {
    setUser({ name, color });
    setScreen('MAIN');
  };

  if (screen === 'LOGIN') return <LoginScreen onJoin={join} />;

  const tabContent = () => {
    switch (tab) {
      case 'REMOTE': return <RemoteTab />;
      case 'TOUCHPAD': return <TouchpadTab />;
      case 'MEDIA': return <MediaTab />;
      case 'ROOM': return <RoomTab />;
      default: return null;
    }
  };

  return (
    <div className="flex flex-col overflow-hidden"
      style={{
        height: '100dvh',
        background: '#06060c',
        fontFamily: "'Segoe UI',system-ui,sans-serif",
        maxWidth: '480px',
        margin: '0 auto'
      }}>

      <Header user={user} />

      <div className="px-4 pt-4 pb-2 flex-shrink-0">
        <h2 className="text-[10px] font-black uppercase tracking-widest text-slate-600">
          {tab === 'REMOTE' && 'Remote Control'}
          {tab === 'TOUCHPAD' && 'Touchpad'}
          {tab === 'MEDIA' && 'Media'}
          {tab === 'ROOM' && 'Lobby'}
        </h2>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-3 min-h-0">
        {tabContent()}
      </div>

      <div className="flex-shrink-0"
        style={{ borderTop: '1px solid rgba(255,255,255,0.07)', background: '#050509', paddingBottom: 'env(safe-area-inset-bottom, 12px)' }}>
        <div className="flex">
          {TABS.map(({ id, Icon, label }) => {
            const active = tab === id;
            return (
              <button key={id} onClick={() => setTab(id)}
                className="flex-1 flex flex-col items-center gap-1 py-3.5 transition-all active:scale-90 relative"
                style={{ color: active ? user?.color?.hex || '#6366f1' : '#475569' }}>
                {active && (
                  <div className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-[2px] rounded-full"
                    style={{ background: user?.color?.hex || '#6366f1' }} />
                )}
                <Icon size={20} strokeWidth={active ? 2.2 : 1.8} />
                <span className="text-[10px] font-black uppercase tracking-wide">{label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
'@ | Out-File -FilePath src/App.jsx -Encoding utf8

# Clean up default files
Remove-Item src/assets -Recurse -Force
Remove-Item src/App.css -Force

# Done
cd ..
Write-Host "`n✅ Both apps created successfully!" -ForegroundColor Green