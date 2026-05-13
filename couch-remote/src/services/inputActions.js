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
