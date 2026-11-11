import { createContext, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, AppState } from 'react-native';
import { useAppState } from '../hooks/useAppState';
import { loadPet, savePet } from '../services/petService';
import { success, tapMedium } from '../services/haptics';
import { dayKey } from '../utils/dayKey';
import { reactionFor } from '../utils/petMessages';
import {
  advancePet,
  daysTogether,
  growthView,
  isHatched,
  moodFor,
  needsWake,
  normalizePet,
  recolorPet,
  renamePet,
  roomFor,
  snacksOn,
  stageFor,
  statusLine,
  treasureView,
  trickView,
  wakePet,
  weekDiary,
} from '../utils/pet';

export const PetContext = createContext(undefined);
// The per-minute part (derived view and clock) lives in its own context, so a
// screen that only needs the pet record (Homepage) skips the minute tick.
export const PetViewContext = createContext(undefined);

const SAVE_DEBOUNCE_MS = 150;
// The pet's mood only changes at midnight, so a coarse clock is plenty.
const CLOCK_TICK_MS = 60 * 1000;

/**
 * Owns the virtual pet. Snacks are read from the completion log on every
 * mainLists change, so any way a task gets completed (or a backup imported)
 * feeds the pet without the completing code knowing the pet exists.
 *
 * `batch` is the latest set of things that just happened ({ id, events,
 * reaction }); a consumer compares `id` with the last one it handled, so every
 * consumer sees every batch and none of them consumes it for the others.
 */
export const PetProvider = ({ children }) => {
  const { mainLists, isLoading } = useAppState();
  const [pet, setPet] = useState(null);
  // 'loading' → 'ready', or 'unavailable' when storage could not be read
  // (then nothing is saved this session, so the stored pet stays intact).
  const [status, setStatus] = useState('loading');
  const [batch, setBatch] = useState(null);
  const [now, setNow] = useState(() => Date.now());
  const petRef = useRef(null);
  const batchSeq = useRef(0);

  useEffect(() => {
    let cancelled = false;
    loadPet(Date.now()).then((result) => {
      if (cancelled) return;
      if (!result.pet) {
        setStatus('unavailable');
        return;
      }
      petRef.current = result.pet;
      setPet(result.pet);
      setStatus('ready');
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), CLOCK_TICK_MS);
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') setNow(Date.now());
    });
    return () => {
      clearInterval(id);
      sub.remove();
    };
  }, []);

  // Every change goes through here. The ref is updated synchronously, so two
  // transitions in one tick compose instead of the second overwriting the first.
  // Each batch's reaction is worked out once, here, and its haptic and
  // VoiceOver line fire once, here: on-screen pets only play the visuals, so
  // two mounted pets never buzz twice and a hidden pet stays silent.
  const commit = useCallback((transition) => {
    const prev = petRef.current;
    if (!prev) return;
    const { pet: next, events } = transition(prev);
    if (next !== prev) {
      petRef.current = next;
      setPet(next);
      // The engine just used Date.now(); keep the view on the same clock, or a
      // task finished just after midnight shows under yesterday for a minute.
      setNow(Date.now());
    }
    if (events && events.length > 0) {
      batchSeq.current += 1;
      const reaction = reactionFor(events, next, batchSeq.current);
      setBatch({ id: batchSeq.current, events, reaction });
      if (reaction && !next.hidden) {
        if (reaction.haptic === 'success') success();
        else if (reaction.haptic === 'medium') setTimeout(tapMedium, 350);
        if (reaction.message) AccessibilityInfo.announceForAccessibility(reaction.message);
      }
    }
  }, []);

  const today = dayKey(now);
  useEffect(() => {
    if (status !== 'ready' || isLoading) return;
    commit((p) => advancePet(p, mainLists, Date.now()));
  }, [status, isLoading, mainLists, today, commit]);

  useEffect(() => {
    if (status !== 'ready' || !pet) return undefined;
    const t = setTimeout(() => {
      savePet(pet);
    }, SAVE_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [pet, status]);

  const wake = useCallback(() => commit((p) => wakePet(p, Date.now())), [commit]);
  const rename = useCallback((name) => commit((p) => ({ pet: renamePet(p, name) })), [commit]);
  const setColor = useCallback((color) => commit((p) => ({ pet: recolorPet(p, color) })), [commit]);
  const setCalm = useCallback(
    (calm) => commit((p) => ({ pet: p.calm === !!calm ? p : { ...p, calm: !!calm } })),
    [commit]
  );
  const setHidden = useCallback(
    (hidden) => commit((p) => ({ pet: p.hidden === !!hidden ? p : { ...p, hidden: !!hidden } })),
    [commit]
  );

  /**
   * Replace the pet with one from a backup. Returns false, changing nothing, if
   * the record is invalid or there is no live pet (storage unreadable).
   */
  const restorePet = useCallback(
    (raw) => {
      const restored = normalizePet(raw, Date.now());
      if (!restored || !petRef.current) return false;
      commit(() => ({ pet: restored }));
      return true;
    },
    [commit]
  );

  const view = useMemo(() => {
    if (!pet) return null;
    return {
      hatched: isHatched(pet),
      stage: stageFor(pet),
      mood: moodFor(pet, now),
      line: statusLine(pet, now),
      room: roomFor(pet),
      todaySnacks: snacksOn(pet, now),
      needsWake: needsWake(pet, now),
      trick: trickView(pet),
      growth: growthView(pet),
      week: weekDiary(pet, now),
      treasures: treasureView(pet),
      daysTogether: daysTogether(pet, now),
    };
  }, [pet, now]);

  const value = useMemo(
    () => ({
      status,
      pet,
      batch,
      visible: status === 'ready' && !!pet && !pet.hidden,
      wake,
      rename,
      setColor,
      setCalm,
      setHidden,
      restorePet,
    }),
    [status, pet, batch, wake, rename, setColor, setCalm, setHidden, restorePet]
  );
  const liveValue = useMemo(() => ({ view, now }), [view, now]);

  return (
    <PetContext.Provider value={value}>
      <PetViewContext.Provider value={liveValue}>{children}</PetViewContext.Provider>
    </PetContext.Provider>
  );
};
