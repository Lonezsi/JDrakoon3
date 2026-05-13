import { Action, Player } from '../models/types';
import { settingsService } from './SettingsService';

export type InputPacket = {
  playerId: string;
  buttons: {
    up: boolean; down: boolean; left: boolean; right: boolean;
    a: boolean; b: boolean; x: boolean; y: boolean;
    start: boolean; select: boolean;
  };
  analog: { x: number; y: number };
};

class InputService {
  private currentFocus: 'menu' | 'lobby' | 'fullscreen' = 'menu';

  setFocus(focus: typeof this.currentFocus) {
    this.currentFocus = focus;
  }

  processInput(packet: InputPacket): Action[] {
    const actions: Action[] = [];
    const { playerId, buttons, analog } = packet;
    const deadzone = settingsService.get().input.deadzone;

    let dx = analog.x;
    let dy = analog.y;
    if (Math.abs(dx) < deadzone) dx = 0;
    if (Math.abs(dy) < deadzone) dy = 0;
    if (dx !== 0 || dy !== 0) {
      actions.push({ type: 'move', playerId, dx, dy });
    }

    if (this.currentFocus === 'menu') {
      if (buttons.up) actions.push({ type: 'navigate', playerId, direction: 'up' });
      if (buttons.down) actions.push({ type: 'navigate', playerId, direction: 'down' });
      if (buttons.left) actions.push({ type: 'navigate', playerId, direction: 'left' });
      if (buttons.right) actions.push({ type: 'navigate', playerId, direction: 'right' });
      if (buttons.a) actions.push({ type: 'confirm', playerId });
      if (buttons.b) actions.push({ type: 'back', playerId });
      if (buttons.start) actions.push({ type: 'home', playerId });
    } else if (this.currentFocus === 'lobby') {
      if (buttons.a) actions.push({ type: 'jump', playerId });
      if (buttons.x) actions.push({ type: 'emote', playerId, emote: 'wave' });
      if (buttons.y) actions.push({ type: 'emote', playerId, emote: 'hype' });
    } else if (this.currentFocus === 'fullscreen') {
      actions.push({ type: 'gamepad_input', playerId, buttons, analog });
    }

    return actions;
  }
}

export const inputService = new InputService();
