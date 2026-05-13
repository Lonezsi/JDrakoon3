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
