import { useCallback, useEffect, useRef, useState } from 'react';
import { usePetEvents } from './usePet';

const MESSAGE_MS = 4200;
const SECOND_ACTION_DELAY_MS = 1100;

/**
 * Drives the visuals of one on-screen pet: plays each new batch's reaction
 * (avatar actions in order, plus its line) while `enabled`. Haptics and the
 * VoiceOver announcement are not here: PetProvider fires those once per batch,
 * however many pets are mounted. `play` lets the screen add its own actions.
 * @param {boolean} enabled whether this pet is actually on screen
 * @returns {{ action: object|null, message: {id: number, text: string}|null, play: Function }}
 */
export const usePetReactions = (enabled) => {
  const [action, setAction] = useState(null);
  const [message, setMessage] = useState(null);
  const seq = useRef(0);
  const timers = useRef([]);

  useEffect(
    () => () => {
      timers.current.forEach(clearTimeout);
      timers.current = [];
    },
    []
  );

  const later = useCallback((fn, ms) => {
    const t = setTimeout(() => {
      timers.current = timers.current.filter((x) => x !== t);
      fn();
    }, ms);
    timers.current.push(t);
  }, []);

  const play = useCallback((next) => {
    seq.current += 1;
    setAction({ ...next, id: seq.current });
  }, []);

  const onBatch = useCallback(
    (events, reaction) => {
      if (!enabled || !reaction) return;
      const [first, second] = reaction.actions;
      if (first) play(first);
      if (second) later(() => play(second), SECOND_ACTION_DELAY_MS);
      if (reaction.message) {
        seq.current += 1;
        const id = seq.current;
        setMessage({ id, text: reaction.message });
        later(() => setMessage((m) => (m && m.id === id ? null : m)), MESSAGE_MS);
      }
    },
    [enabled, play, later]
  );
  usePetEvents(onBatch);

  return { action, message, play };
};
