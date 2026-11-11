import { useContext, useEffect, useRef } from 'react';
import { PetContext, PetViewContext } from '../context/PetContext';

const useRequired = (context, name) => {
  const value = useContext(context);
  if (value === undefined) throw new Error(`${name} must be used within a PetProvider`);
  return value;
};

/**
 * The pet record and its actions only: `{ status, pet, batch, visible, wake,
 * rename, setColor, setCalm, setHidden, restorePet }`. Does not re-render on the
 * provider's minute tick, so use it where the derived view isn't needed.
 */
export const usePetRecord = () => useRequired(PetContext, 'usePetRecord');

/** The pet, its derived view for right now (`view`, `now`), and the actions. */
export const usePet = () => {
  const record = useRequired(PetContext, 'usePet');
  const live = useRequired(PetViewContext, 'usePet');
  return { ...record, ...live };
};

/**
 * Calls `onBatch(events, reaction)` once for every pet event batch that arrives
 * AFTER this component mounted. A batch that was already current at mount is
 * treated as seen, so opening a screen never replays an old celebration.
 */
export const usePetEvents = (onBatch) => {
  const { batch } = usePetRecord();
  const seen = useRef(batch?.id ?? 0);

  // Re-running for a new `onBatch` identity is harmless: a seen id returns early.
  useEffect(() => {
    if (!batch || batch.id <= seen.current) return;
    seen.current = batch.id;
    onBatch(batch.events, batch.reaction);
  }, [batch, onBatch]);
};

// Long enough to see the nap before the pet notices you're back.
const WAKE_DELAY_MS = 900;

/**
 * Wakes a napping pet shortly after it comes into view, on whichever screen
 * shows it first (iOS often resumes the app straight into a list). The engine
 * also wakes it before feeding if a task gets finished first.
 */
export const useWakeOnView = (visible) => {
  const { view, wake } = usePet();
  const needsWake = !!view?.needsWake;
  useEffect(() => {
    if (!visible || !needsWake) return undefined;
    const t = setTimeout(wake, WAKE_DELAY_MS);
    return () => clearTimeout(t);
  }, [visible, needsWake, wake]);
};
