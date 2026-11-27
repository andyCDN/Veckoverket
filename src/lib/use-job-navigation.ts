"use client";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type { JobLane } from "./job-workspace";
import { monday } from "./date";
import { isLocalDate } from "./google-time";

type JobNavigation = {
  tab: string;
  lane: JobLane;
  query: string;
  detailId: string | null;
  lastId: string | null;
  scrolls: Record<string, number>;
  pickWeek?: string;
  watchAll?: boolean;
};
const viewKey = (s: JobNavigation) =>
  s.tab === "applications" && s.detailId ? `job:${s.detailId}` : s.tab;
const validId = (value: unknown) =>
  value === null ||
  (typeof value === "string" && value.length > 0 && value.length <= 200);

export function readJobNavigation(raw: string | null): JobNavigation | null {
  try {
    const s = JSON.parse(raw ?? "null");
    if (
      !s ||
      !["applications", "watch", "deadlines"].includes(s.tab) ||
      !["todo", "waiting", "closed"].includes(s.lane) ||
      typeof s.query !== "string" ||
      s.query.length > 300 ||
      !validId(s.detailId) ||
      !validId(s.lastId) ||
      (s.pickWeek !== undefined &&
        (typeof s.pickWeek !== "string" ||
          !isLocalDate(s.pickWeek) ||
          monday(s.pickWeek) !== s.pickWeek)) ||
      (s.watchAll !== undefined && typeof s.watchAll !== "boolean") ||
      !s.scrolls ||
      typeof s.scrolls !== "object" ||
      Array.isArray(s.scrolls) ||
      Object.keys(s.scrolls).length > 30 ||
      Object.values(s.scrolls).some(
        (value) =>
          typeof value !== "number" ||
          !Number.isFinite(value) ||
          value < 0 ||
          value > 1000000,
      )
    )
      return null;
    return s;
  } catch {
    return null;
  }
}

export function useJobNavigation(
  scope: string,
  enabled: boolean,
  initialId?: string,
  initialTab = "contacts",
) {
  const key = `veckoverket.job-navigation.v1.${scope}`;
  const [navigation, setNavigation] = useState<JobNavigation>(() => {
    let saved: JobNavigation | null = null;
    if (enabled)
      try {
        saved = readJobNavigation(localStorage.getItem(key));
      } catch {}
    const state = saved ?? {
      tab: enabled ? "applications" : initialTab,
      lane: "todo",
      query: "",
      detailId: null,
      lastId: null,
      scrolls: {},
    };
    return initialId
      ? {
          ...state,
          tab: "applications",
          detailId: initialId,
          lastId: initialId,
          scrolls: { ...state.scrolls, [`job:${initialId}`]: 0 },
        }
      : state;
  });
  const current = useRef(navigation),
    restoring = useRef(false);
  const persist = useCallback(() => {
    if (!enabled) return;
    try {
      localStorage.setItem(key, JSON.stringify(current.current));
    } catch {
      /* Navigation remains usable when browser storage is unavailable. */
    }
  }, [key, enabled]);
  const rememberScroll = useCallback(() => {
    if (!enabled || restoring.current) return;
    const s = current.current;
    const scrolls = { ...s.scrolls, [viewKey(s)]: window.scrollY };
    current.current = {
      ...s,
      scrolls: Object.fromEntries(Object.entries(scrolls).slice(-30)),
    };
    persist();
  }, [enabled, persist]);
  const update = useCallback(
    (patch: Partial<JobNavigation>) => {
      const before = current.current;
      const switching = viewKey(before) !== viewKey({ ...before, ...patch });
      if (switching) rememberScroll();
      const next = { ...current.current, ...patch };
      if (patch.detailId) next.lastId = patch.detailId;
      if (switching) restoring.current = true;
      current.current = next;
      setNavigation(next);
      persist();
    },
    [persist, rememberScroll],
  );
  const mode = viewKey(navigation);
  useLayoutEffect(() => {
    if (!enabled) return;
    restoring.current = true;
    const frame = requestAnimationFrame(() => {
      window.scrollTo({
        top: current.current.scrolls[mode] ?? 0,
        behavior: "instant",
      });
      restoring.current = false;
    });
    return () => cancelAnimationFrame(frame);
  }, [enabled, mode]);
  useLayoutEffect(() => () => rememberScroll(), [rememberScroll]);
  useEffect(() => {
    if (!enabled) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const scroll = () => {
      clearTimeout(timer);
      timer = setTimeout(rememberScroll, 150);
    };
    window.addEventListener("scroll", scroll, { passive: true });
    window.addEventListener("pagehide", rememberScroll);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("scroll", scroll);
      window.removeEventListener("pagehide", rememberScroll);
    };
  }, [enabled, rememberScroll]);
  return { navigation, update };
}
