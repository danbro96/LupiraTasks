import { useSyncExternalStore } from 'react';
import { LIST_POLL_IDLE_MS, LIST_POLL_MS } from '../config';

// Polling an open list is only worth it while someone is there to see the result. React Query pauses
// on a hidden tab (its focus manager watches visibilitychange), but not on a visible tab nobody is
// looking at — so this adds the missing half: pause after a quiet period, resume on interaction.
//
// Module-level rather than per-hook so every consumer shares one set of listeners and one timer.

const ACTIVITY = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'scroll', 'touchstart'] as const;
const ENABLED = LIST_POLL_IDLE_MS > 0;

let idle = false;
let lastActive = 0;
let timer: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();

function notify(): void {
  for (const l of listeners) l();
}

// One timer that re-checks and reschedules, so a flood of pointermove events costs a ref write each
// rather than tearing down and recreating a timeout.
function check(): void {
  timer = undefined;
  const quiet = Date.now() - lastActive;
  if (quiet >= LIST_POLL_IDLE_MS) {
    if (!idle) {
      idle = true;
      notify();
    }
    return;
  }
  timer = setTimeout(check, LIST_POLL_IDLE_MS - quiet);
}

function markActive(): void {
  lastActive = Date.now();
  if (idle) {
    idle = false;
    notify();
  }
  if (timer === undefined) timer = setTimeout(check, LIST_POLL_IDLE_MS);
}

function subscribe(onChange: () => void): () => void {
  if (!ENABLED) return () => {};
  listeners.add(onChange);
  if (listeners.size === 1) {
    lastActive = Date.now();
    for (const e of ACTIVITY) window.addEventListener(e, markActive, { passive: true });
    if (timer === undefined) timer = setTimeout(check, LIST_POLL_IDLE_MS);
  }
  return () => {
    listeners.delete(onChange);
    if (listeners.size > 0) return;
    for (const e of ACTIVITY) window.removeEventListener(e, markActive);
    clearTimeout(timer);
    timer = undefined;
    idle = false;
  };
}

function useIdle(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => idle,
    () => false,
  );
}

/**
 * The `refetchInterval` an open list should use — `false` while the user is idle or polling is off.
 * Coming back from idle restarts the interval, so a returning user is at most one tick stale.
 */
export function useListPollInterval(): number | false {
  return !useIdle() && LIST_POLL_MS > 0 ? LIST_POLL_MS : false;
}

/** Whether the idle pause is what stopped polling — false when polling is off by configuration, so
 *  the UI never explains a pause that isn't happening. */
export function useListPollPaused(): boolean {
  return useIdle() && LIST_POLL_MS > 0;
}
