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
