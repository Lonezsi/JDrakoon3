import { ExtendedWebSocket, registerClient, getClient } from './server';
import { broadcast } from './broadcast';
import { v4 as uuidv4 } from 'uuid';
import { Player, Action } from '../models/types';
import { inputService } from '../services/InputService';
import { lobbySync } from '../services/LobbySyncService';
import { appLauncher } from '../services/AppLauncher';
import { videoQueue } from '../services/VideoQueueService';
import { settingsService } from '../services/SettingsService';
import { gameScanner } from '../services/GameScanner';
import logger from '../utils/logger';

export async function handleMessage(ws: ExtendedWebSocket, msg: any) {
  switch (msg.type) {
    case 'join':
      const playerId = uuidv4();
      const player: Player = {
        id: playerId,
        name: msg.name || 'Guest',
        color: msg.color || '#6366f1',
        deviceType: msg.deviceType || 'phone',
        isActive: true,
        lastSeen: Date.now(),
        pos: { x: 0, z: 0 },
        vel: { x: 0, z: 0 },
      };
      registerClient(ws, playerId);
      lobbySync.addPlayer(player);
      broadcast('player_joined', player);
      ws.send(JSON.stringify({ type: 'joined', playerId }));
      break;

    case 'input':
      if (!ws.playerId) return;
      const actions = inputService.processInput({
        playerId: ws.playerId,
        buttons: msg.buttons,
        analog: msg.analog,
      });
      for (const action of actions) {
        broadcast('action', action);
        if (action.type === 'move' || action.type === 'emote' || action.type === 'jump') {
          lobbySync.handleAction(action);
        }
      }
      break;

    case 'action':
      if (!ws.playerId) return;
      const action = msg.action;
      action.playerId = ws.playerId;
      broadcast('action', action);
      if (action.type === 'move' || action.type === 'emote' || action.type === 'jump') {
        lobbySync.handleAction(action);
      }
      break;

    case 'queue_add':
      const item = await videoQueue.addToQueue(msg.url, msg.requestedBy || 'Phone');
      if (item) broadcast('queue_updated', videoQueue.getState());
      break;

    case 'queue_remove':
      videoQueue.removeFromQueue(msg.index);
      broadcast('queue_updated', videoQueue.getState());
      break;

    case 'queue_move':
      videoQueue.moveItem(msg.index, msg.direction);
      broadcast('queue_updated', videoQueue.getState());
      break;

    case 'clear_queue':
      videoQueue.clearQueue();
      broadcast('queue_updated', videoQueue.getState());
      break;

    case 'shuffle_queue':
      videoQueue.shuffle();
      broadcast('queue_updated', videoQueue.getState());
      break;

    case 'loop_toggle':
      videoQueue.toggleLoop();
      broadcast('queue_updated', videoQueue.getState());
      break;

    case 'media_playpause':
      videoQueue.setPlaying(!videoQueue.getState().playback.isPlaying);
      break;

    case 'media_next':
      videoQueue.next();
      break;

    case 'media_prev':
      videoQueue.previous();
      break;

    case 'media_seek':
      videoQueue.setPosition(msg.progress);
      break;

    case 'media_volume':
      videoQueue.setVolume(msg.volume);
      break;

    case 'media_mute':
      videoQueue.toggleMute();
      break;

    case 'launch_app':
      const apps = gameScanner.getLibrary();
      const app = apps.find(a => a.id === msg.appId);
      if (app) {
        const launched = await appLauncher.launch(app);
        if (launched) {
          broadcast('app_launched', { appId: app.id });
          inputService.setFocus('fullscreen');
        }
      }
      break;

    case 'close_app':
      await appLauncher.close();
      broadcast('app_closed', {});
      inputService.setFocus('menu');
      break;

    case 'settings_get':
      ws.send(JSON.stringify({ type: 'settings', settings: settingsService.get() }));
      break;

    case 'settings_update':
      await settingsService.update(msg.settings);
      broadcast('settings_updated', settingsService.get());
      break;

    case 'scan_library':
      const library = await gameScanner.scan();
      broadcast('library_updated', library);
      break;

    case 'ping':
      ws.send(JSON.stringify({ type: 'pong' }));
      break;

    default:
      logger.warn('Unknown message type:', msg.type);
  }
}
