/**
 * Undo/redo for the designer. Three ways to change the document:
 *  - set(next, key?)  a normal edit; edits with the same key within 800 ms
 *                     merge into one undo step (typing, nudging);
 *  - live(next)       during a drag: show it, but do not record it yet;
 *  - commit(origin)   at the end of a drag: record ONE step from origin.
 */
import { useCallback, useState } from "react";

interface State<T> { past: T[]; present: T; future: T[]; key: string | null; at: number }
const LIMIT = 100;

export function useHistory<T>(initial: T) {
  const [s, setS] = useState<State<T>>({ past: [], present: initial, future: [], key: null, at: 0 });

  const set = useCallback((next: T, key?: string) => {
    const now = Date.now();
    setS((st) => {
      if (next === st.present) return st;
      const merge = key !== undefined && key === st.key && now - st.at < 800;
      return { past: merge ? st.past : [...st.past.slice(-LIMIT), st.present], present: next, future: [], key: key ?? null, at: now };
    });
  }, []);

  const live = useCallback((next: T) => setS((st) => ({ ...st, present: next })), []);

  const commit = useCallback((origin: T) => {
    setS((st) => (st.present === origin ? st : { past: [...st.past.slice(-LIMIT), origin], present: st.present, future: [], key: null, at: 0 }));
  }, []);

  const undo = useCallback(() => setS((st) => (st.past.length ? { past: st.past.slice(0, -1), present: st.past[st.past.length - 1], future: [st.present, ...st.future], key: null, at: 0 } : st)), []);
  const redo = useCallback(() => setS((st) => (st.future.length ? { past: [...st.past, st.present], present: st.future[0], future: st.future.slice(1), key: null, at: 0 } : st)), []);

  return { doc: s.present, set, live, commit, undo, redo, canUndo: s.past.length > 0, canRedo: s.future.length > 0 };
}
