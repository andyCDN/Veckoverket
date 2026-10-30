"use client";
import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  LayoutDashboard,
  Plus,
  Settings2,
  Sparkles,
  Target,
  X,
  BookOpen,
  AlertCircle,
  ShieldCheck,
  Printer,
  MoreHorizontal,
  ListFilter,
  Undo2,
} from "lucide-react";
import type {
  Activity,
  AppData,
  Category,
  Goal,
  RecurringActivity,
  Settings,
  Task,
  WeekPlan,
} from "@/lib/types";
import { createData } from "@/lib/defaults";
import {
  addDays,
  hours,
  initialDay,
  monday,
  time,
  today,
  uid,
  weekLabel,
  weekNumber,
  weekday,
  planningBoundary,
} from "@/lib/date";
import {
  assessWeek,
  categoryMinutes,
  generateWeek,
  validateMove,
  validatePlan,
  plannedDays,
  visibleDays,
} from "@/lib/planner";
import { downloadData } from "@/lib/storage";
import { useWorkspaceStorage } from "@/lib/use-workspace-storage";
import { StorageStatus, syncLabel } from "./storage-status";
import { supabase } from "@/lib/supabase";
import { Calendar } from "./calendar";
import { ActivityEditor } from "./activity-editor";
import { GoalsView, GoalForm } from "./goals";
import { SettingsView } from "./settings";
import { ReflectionView } from "./reflection";
import { Account } from "./account";
import { Modal } from "./modal";
import { AppInstallButton, useStandaloneMode } from "./app-install";
import { ResetPlanningModal } from "./reset-planning";
import { resetPlanning } from "@/lib/reset-planning";
import { upgradeWeeklyRoutines } from "@/lib/weekly-routines";
import { WeeklyRoutineModal } from "./weekly-routine";
import { LoadingScreen } from "./loading-screen";
import { bookingConstraints, replanAfterBookings } from "@/lib/auto-planning";
import { EditorialSidebar, CategoryFilter } from "./riso";
import { PlannerMasthead, WorkspaceTools, BackCoverInfo } from "./punk";
import { GoogleCalendarModal } from "./google-calendar";
import { useGoogleCalendar } from "@/lib/use-google-calendar";
import { useIcalCalendar } from "@/lib/use-ical-calendar";
import { applyCalendarCategoryRules } from "@/lib/calendar-categories";
import {
  previewGoogleImport,
  removeGoogleImports,
  categorizeGoogleEvent,
  type GoogleCategoryChoices,
  type GoogleSnapshot,
} from "@/lib/google-calendar";
import { CareerView } from "./career";
import { FollowUpPanel } from "./follow-up";
import { followUps, type FollowUp } from "@/lib/follow-up";
type View =
  "dashboard" | "planner" | "goals" | "reflection" | "settings" | "career";
const NAV = [
  { id: "dashboard", label: "Min vecka", icon: LayoutDashboard },
  { id: "planner", label: "Veckoplanerare", icon: CalendarDays },
  { id: "goals", label: "Mål & aktiviteter", icon: Target },
  { id: "career", label: "Jobb & nätverk", icon: BookOpen },
  { id: "reflection", label: "Veckoreflektion", icon: BookOpen },
  { id: "settings", label: "Inställningar", icon: Settings2 },
] as const;
const APP_NAV_LABELS: Record<View, string> = {
  dashboard: "Idag",
  planner: "Planera",
  goals: "Mål",
  reflection: "Reflektion",
  settings: "Inställningar",
  career: "Jobb",
};
function linkedPlan(plan: WeekPlan, goals: Goal[], preserved: Activity[] = []) {
  return {
    ...plan,
    activities: plan.activities.map((a) =>
      a.goalId || preserved.includes(a)
        ? a
        : {
            ...a,
            goalId: goals.find(
              (g) => g.categoryId === a.categoryId && g.week === plan.week,
            )?.id,
          },
    ),
  };
}
function newWorkspace() {
  const data = createData(),
    week = monday(today());
  data.weeks[week] = linkedPlan(generateWeek(week, data).plan, data.goals);
  return data;
}
export function Workspace() {
  const standalone = useStandaloneMode();
  const {
    data,
    setData,
    undo,
    undoLabel,
    user,
    authReady,
    authError,
    configured,
    cloud,
    retry,
    logout,
    setEditing,
    chooseInitial,
    resolveConflict,
    storageError,
    blockedSave,
    setBlockedSave,
  } = useWorkspaceStorage(newWorkspace);
  const [careerEditing, setCareerEditing] = useState(false);
  const [week, setWeek] = useState(monday(today())),
    [view, setView] = useState<View>("dashboard");
  const [daySelection, setDaySelection] = useState<{
    week: string;
    day: number;
  } | null>(null);
  const [categoryFilter, setCategoryFilter] = useState("all"),
    [mobile, setMobile] = useState(false),
    [mobileFiltersOpen, setMobileFiltersOpen] = useState(false),
    [editor, setEditor] = useState<{
      activity?: Activity;
      date: string;
      start?: number;
      followUp?: { source: Activity; week: string; minutes: number };
    } | null>(null),
    [newGoal, setNewGoal] = useState(false),
    [generator, setGenerator] = useState(false),
    [automaticDraft, setAutomaticDraft] = useState(true),
    [account, setAccount] = useState(false),
    [help, setHelp] = useState(false),
    [googleOpen, setGoogleOpen] = useState(false),
    [resetOpen, setResetOpen] = useState(false),
    [routineId, setRoutineId] = useState<string | null>(null),
    [notice, setNotice] = useState(""),
    [undoVersion, setUndoVersion] = useState(0);
  const google = useGoogleCalendar(
    configured ? (user?.id ?? "signed-out") : "local",
  );
  const autoImportIcal = useCallback(
    (snapshot: GoogleSnapshot) => {
      setData(
        (current) =>
          current?.icalCalendar?.autoRefresh &&
          current.icalCalendar.calendarId === snapshot.calendarIds[0]
            ? previewGoogleImport(
                current,
                snapshot,
                Boolean(current.settings.autoPlanning),
              ).data
            : current,
        { history: false },
      );
    },
    [setData],
  );
  const ical = useIcalCalendar({
    userId: user?.id,
    week,
    calendarId: data?.icalCalendar?.calendarId,
    automatic: Boolean(data?.icalCalendar?.autoRefresh),
    paused:
      cloud.phase !== "synced" ||
      Boolean(
        editor ||
        newGoal ||
        generator ||
        googleOpen ||
        resetOpen ||
        routineId ||
        account ||
        view === "settings" ||
        careerEditing,
      ),
    onSnapshot: autoImportIcal,
  });
  const notify = useCallback((message: string) => setNotice(message), []);
  useEffect(() => {
    if (!data || (configured && cloud.phase !== "synced")) return;
    setData((current) => (current ? upgradeWeeklyRoutines(current) : current), {
      history: false,
    });
  }, [data, configured, cloud.phase, setData]);
  const undoAvailable = Boolean(
    undoLabel &&
    !editor &&
    !generator &&
    !newGoal &&
    !account &&
    !googleOpen &&
    !resetOpen &&
    !routineId &&
    !help,
  );
  const performUndo = useCallback(() => {
    if (undo()) {
      setUndoVersion((value) => value + 1);
      setNotice("Den senaste ändringen har ångrats.");
    }
  }, [undo]);
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      const element = event.target as HTMLElement | null;
      if (
        !undoAvailable ||
        (!event.ctrlKey && !event.metaKey) ||
        event.altKey ||
        event.shiftKey ||
        event.key.toLowerCase() !== "z" ||
        element?.closest("input,textarea,select,[contenteditable=true]")
      )
        return;
      event.preventDefault();
      performUndo();
    };
    document.addEventListener("keydown", keydown);
    return () => document.removeEventListener("keydown", keydown);
  }, [performUndo, undoAvailable]);
  useEffect(() => {
    const query = window.matchMedia(
      standalone ? "(max-width: 950px)" : "(max-width: 700px)",
    );
    const update = () => {
      setMobile(query.matches);
      document.documentElement.dataset.layout = query.matches
        ? "daily"
        : "weekly";
    };
    update();
    query.addEventListener("change", update);
    return () => {
      query.removeEventListener("change", update);
      document.documentElement.removeAttribute("data-layout");
    };
  }, [standalone]);
  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setNotice(""), 6000);
    return () => clearTimeout(id);
  }, [notice]);
  useEffect(() => {
    setEditor(null);
    setNewGoal(false);
    setGenerator(false);
    setAccount(false);
    setHelp(false);
    setGoogleOpen(false);
    setResetOpen(false);
    setRoutineId(null);
    setNotice("");
    setView("dashboard");
    setWeek(monday(today()));
    setDaySelection(null);
  }, [user?.id]);
  useLayoutEffect(() => {
    setEditing(
      Boolean(
        editor ||
        newGoal ||
        generator ||
        googleOpen ||
        resetOpen ||
        routineId ||
        view === "settings" ||
        careerEditing,
      ),
    );
    return () => setEditing(false);
  }, [
    editor,
    newGoal,
    generator,
    googleOpen,
    resetOpen,
    routineId,
    view,
    careerEditing,
    setEditing,
  ]);
  const navigate = (v: View) => {
    setView(v);
  };
  const navigateAndReveal = (v: View, target: string) => {
    navigate(v);
    requestAnimationFrame(() => {
      const section = document.getElementById(target);
      section?.scrollIntoView({ block: "start", behavior: "instant" });
      section?.focus({ preventScroll: true });
    });
  };
  function changeWeek(w: string) {
    setRoutineId(null);
    setWeek(w);
    setDaySelection(null);
    setData(
      (d) => {
        if (!d || d.weeks[w]) return d;
        return {
          ...d,
          weeks: {
            ...d.weeks,
            [w]: linkedPlan(
              generateWeek(
                w,
                d,
                undefined,
                d.settings.autoPlanning
                  ? { notBefore: planningBoundary() }
                  : {},
              ).plan,
              d.goals,
            ),
          },
        };
      },
      { history: false },
    );
  }
  function updatePlan(plan: WeekPlan) {
    setData(
      (d) => (d ? { ...d, weeks: { ...d.weeks, [plan.week]: plan } } : d),
      { undoLabel: "aktivitetsstatus" },
    );
  }
  if (configured && authReady && !user)
    return (
      <main className="cloud-gate">
        {authError && <p role="alert">{authError}</p>}
        <Account
          data={null}
          user={null}
          state={cloud}
          onSync={retry}
          onLogout={logout}
          onClose={() => {}}
          embedded
        />
      </main>
    );
  if (configured && cloud.phase === "migration" && data)
    return (
      <main className="cloud-gate">
        <section className="cloud-auth">
          <h1>Flytta planen till molnet</h1>
          {notice && <p role="alert">{notice}</p>}
          <p>
            Ingen molnplan finns på det här kontot. På den här enheten finns en
            lokal plan med {Object.keys(data.weeks).length} sparade veckor. Välj
            om den ska flyttas till kontot.
          </p>
          <button
            className="button primary"
            onClick={() => chooseInitial(true)}
          >
            Flytta min lokala plan till molnet
          </button>
          <button
            className="button secondary"
            onClick={() => downloadData(data)}
          >
            Exportera den lokala planen
          </button>
          <button className="text-button" onClick={() => chooseInitial(false)}>
            Skapa en ny molnplan
          </button>
          <button
            className="text-button"
            onClick={() => {
              void logout().catch((error) =>
                notify(
                  error instanceof Error
                    ? error.message
                    : "Utloggningen misslyckades.",
                ),
              );
            }}
          >
            Logga ut
          </button>
        </section>
      </main>
    );
  if (!data || (configured && (cloud.phase === "loading" || !authReady)))
    return (
      <LoadingScreen
        failed={Boolean(configured && cloud.error)}
        message={
          configured && cloud.error
            ? "Planen kunde inte hämtas."
            : configured
              ? "Hämtar molnplanen…"
              : "Laddar veckoplanen…"
        }
      >
        {configured && cloud.error && (
          <div className="stack">
            <p role="alert">{cloud.error}</p>
            <button className="button primary" onClick={retry}>
              Försök igen
            </button>
            <button
              className="text-button"
              onClick={() => {
                void supabase!.auth.signOut();
              }}
            >
              Logga ut
            </button>
          </div>
        )}
      </LoadingScreen>
    );
  const plan =
      data.weeks[week] ??
      generateWeek(
        week,
        data,
        undefined,
        data.settings.autoPlanning ? { notBefore: planningBoundary() } : {},
      ).plan,
    activities = plan.activities,
    conflicts = assessWeek(plan, data);
  const focus =
    activities.find(
      (a) =>
        a.status === "planned" && a.blockType !== "locked" && a.date >= today(),
    ) ??
    activities.find((a) => a.status === "planned" && a.blockType !== "locked");
  const goals = data.goals.filter((g) => g.week === week);
  const routineActivity = activities.find(
    (a) => a.id === routineId && a.routine,
  );
  const openActivity = (a: Activity) =>
    a.routine ? setRoutineId(a.id) : setEditor({ activity: a, date: a.date });
  const currentWeek = week === monday(today());
  const weekData = {
    ...data,
    settings: {
      ...(plan.rules ?? data.settings),
      autoPlanning: data.settings.autoPlanning,
    },
  };
  const days = mobile
    ? [0, 1, 2, 3, 4, 5, 6]
    : visibleDays(weekData.settings, activities);
  const activeDay =
    daySelection?.week === week && days.includes(daySelection.day)
      ? daySelection.day
      : mobile && currentWeek
        ? weekday(today())
        : initialDay(week, days);
  const filterActivities = mobile
    ? activities.filter((a) => a.date === addDays(week, activeDay))
    : activities;
  const selectDay = (day: number) => setDaySelection({ week, day });
  function editInWeek(targetWeek: string, activity: Activity) {
    changeWeek(targetWeek);
    setDaySelection({
      week: targetWeek,
      day: weekday(activity.date),
    });
    setEditor({ activity, date: activity.date });
  }
  function reschedule(item: FollowUp) {
    const settings = weekData.settings;
    let slot: { date: string; start: number } | undefined;
    // Suggest a real free slot without moving or deleting existing passes.
    for (const day of plannedDays(settings)) {
      const date = addDays(week, day);
      if (date < item.activity.date) continue;
      for (
        let start = settings.start;
        start + item.remaining <= settings.end;
        start += 5
      ) {
        const candidate = {
          ...item.activity,
          id: "followup-draft",
          date,
          start,
          end: start + item.remaining,
          source: "manual" as const,
          blockType: "flexible" as const,
        };
        if (
          !validatePlan([...activities, candidate], settings).some(
            (c) => c.severity === "error",
          )
        ) {
          slot = { date, start };
          break;
        }
      }
      if (slot) break;
    }
    setEditor({
      date: slot?.date ?? addDays(week, activeDay),
      start: slot?.start ?? settings.start,
      followUp: {
        source: item.activity,
        week: item.week,
        minutes: item.remaining,
      },
    });
    if (!slot)
      notify(
        "Ingen ledig sammanhängande tid i veckan. Frigör tid i kalendern eller välj en annan vecka innan du bokar om.",
      );
  }
  const toggleTask = (id: string) =>
    setData((d) =>
      d
        ? {
            ...d,
            tasks: d.tasks.map((t) =>
              t.id === id ? { ...t, done: !t.done } : t,
            ),
          }
        : d,
    );
  function move(a: Activity, date: string, start: number) {
    const current = data!;
    const moved = {
      ...a,
      date,
      start,
      end: start + a.end - a.start,
      source: "manual" as const,
    };
    const error = validateMove(
      a,
      moved,
      bookingConstraints(activities, weekData),
      weekData.settings,
      data!.categories,
    );
    if (error) {
      notify(error);
      return;
    }
    const next = replanAfterBookings(
      {
        ...current,
        weeks: {
          ...current.weeks,
          [week]: {
            ...plan,
            activities: activities.map((item) =>
              item.id === a.id ? moved : item,
            ),
          },
        },
      },
      [week],
    );
    const conflict = validatePlan(
      next.weeks[week].activities,
      weekData.settings,
    ).find((issue) => issue.severity === "error" && issue.id.includes(a.id));
    if (conflict) {
      notify(conflict.message);
      return;
    }
    setData(next, { undoLabel: "flytt av aktivitet" });
    notify("Aktiviteten har flyttats.");
  }
  function saveActivity(
    a: Activity,
    recurrence?: RecurringActivity,
    removeRecurrence?: boolean,
  ) {
    const current = data!;
    if (editor?.activity?.external) {
      notify("Ändra Google-händelsens datum och tid i Google Kalender.");
      return;
    }
    if (editor?.followUp) {
      const item = followUps(current).find(
        (item) =>
          item.week === editor.followUp!.week &&
          item.activity.id === editor.followUp!.source.id,
      );
      if (
        !item ||
        item.remaining <= 0 ||
        a.categoryId !== item.activity.categoryId
      ) {
        notify(
          "Ombokningen kunde inte sparas. Kontrollera ursprungspassets status och välj samma livsområde.",
        );
        return;
      }
    }
    let weeks = { ...current.weeks };
    const original = editor?.activity;
    // A series change updates future, uncompleted occurrences, and validates every affected week atomically.
    if (original?.recurrenceId && (recurrence || removeRecurrence))
      for (const [key, wp] of Object.entries(weeks)) {
        weeks[key] = {
          ...wp,
          activities: wp.activities.map((old) =>
            old.recurrenceId === original.recurrenceId &&
            old.id !== a.id &&
            old.date >= a.date &&
            old.status === "planned"
              ? recurrence
                ? {
                    ...old,
                    title: recurrence.title,
                    description: recurrence.description,
                    start: recurrence.start,
                    end: recurrence.end,
                    blockType: recurrence.blockType,
                    categoryId: recurrence.categoryId,
                    priority: recurrence.priority,
                    estimatedMinutes: recurrence.estimatedMinutes,
                    goalId: recurrence.goalId,
                  }
                : { ...old, recurrenceId: undefined, source: "manual" as const }
              : old,
          ),
        };
      }
    weeks[week] = {
      ...(weeks[week] ?? plan),
      activities: [
        ...(weeks[week]?.activities ?? activities).filter(
          (old) => old.id !== a.id,
        ),
        a,
      ],
    };
    const changedWeeks = Object.keys(weeks).filter(
      (key) =>
        JSON.stringify(weeks[key]) !== JSON.stringify(current.weeks[key]) ||
        (Boolean(recurrence || removeRecurrence) && key >= week),
    );
    const recurring = current.recurring.filter(
      (r) =>
        r.id !== recurrence?.id &&
        !(removeRecurrence && r.id === original?.recurrenceId),
    );
    if (recurrence) recurring.push(recurrence);
    const replanned = replanAfterBookings(
      { ...current, weeks, recurring },
      changedWeeks,
    );
    weeks = replanned.weeks;
    for (const wp of Object.values(weeks)) {
      if (
        wp.week !== week &&
        JSON.stringify(wp) === JSON.stringify(current.weeks[wp.week])
      )
        continue;
      const errors = validatePlan(
        wp.activities,
        wp.rules ?? current.settings,
      ).filter((c) => c.severity === "error");
      const before = current.weeks[wp.week];
      const previousErrors = new Set(
        validatePlan(
          before?.activities ?? [],
          before?.rules ?? current.settings,
        )
          .filter((c) => c.severity === "error")
          .map((c) => c.id),
      );
      const changed = wp.activities
        .filter(
          (a) =>
            JSON.stringify(a) !==
            JSON.stringify(before?.activities.find((old) => old.id === a.id)),
        )
        .map((a) => a.id);
      const relevant = errors.filter(
        (c) =>
          !previousErrors.has(c.id) || changed.some((id) => c.id.includes(id)),
      );
      if (relevant.length && wp.week >= week) {
        notify(`Ändringen kunde inte sparas: ${relevant[0].message}`);
        return;
      }
    }
    setData(
      { ...current, weeks, recurring },
      { undoLabel: "sparad aktivitet" },
    );
    setEditor(null);
    notify(
      recurrence
        ? "Aktiviteten och veckoregeln är sparade. Nya tillfällen läggs in när en vecka genereras."
        : "Aktiviteten är sparad.",
    );
  }
  function deleteActivity(id: string, series: boolean) {
    const a = activities.find((a) => a.id === id);
    if (!a) return;
    if (a.external) {
      notify("Ta bort händelsen i Google Kalender och uppdatera importen.");
      return;
    }
    let weeks = { ...data!.weeks };
    if (series && a.recurrenceId) {
      for (const [w, p] of Object.entries(weeks))
        weeks[w] = {
          ...p,
          activities: p.activities.filter(
            (item) =>
              item.recurrenceId !== a.recurrenceId ||
              item.date < a.date ||
              item.status !== "planned",
          ),
        };
    } else
      weeks[week] = {
        ...plan,
        activities: activities.filter((a) => a.id !== id),
      };
    const changedWeeks = Object.keys(weeks).filter(
      (key) => JSON.stringify(weeks[key]) !== JSON.stringify(data!.weeks[key]),
    );
    const next = {
      ...data!,
      weeks,
      recurring: series
        ? data!.recurring.filter((r) => r.id !== a.recurrenceId)
        : data!.recurring,
    };
    setData(
      a.source !== "generated" ? replanAfterBookings(next, changedWeeks) : next,
      { undoLabel: "borttagning av aktivitet" },
    );
    setEditor(null);
    notify(
      series
        ? "Framtida planerade tillfällen och regeln är borttagna."
        : "Aktiviteten är borttagen.",
    );
  }
  function applySettings(
    settings: Settings,
    categories: Category[],
    name: string,
  ) {
    const next = { ...data!, settings, categories, profile: { name } },
      result = generateWeek(
        week,
        next,
        plan,
        settings.autoPlanning || data!.settings.autoPlanning
          ? { notBefore: planningBoundary() }
          : {},
      );
    const error = result.conflicts.find((c) => c.severity === "error");
    if (error) {
      notify(
        `Veckan kunde inte ändras: ${error.message} Redigera berörd aktivitet först.`,
      );
      return;
    }
    next.weeks = {
      ...next.weeks,
      [week]: linkedPlan(
        result.plan,
        next.goals,
        settings.autoPlanning || data!.settings.autoPlanning
          ? plan.activities
          : [],
      ),
    };
    setData(next, { undoLabel: "planeringsinställningar" });
    navigate("dashboard");
    notify(
      result.conflicts.length
        ? "Inställningarna är sparade. Se planeringsförslagen för det som inte ryms."
        : "Veckoplanen är uppdaterad.",
    );
  }
  function replaceData(imported: AppData) {
    setBlockedSave(false);
    setDaySelection(null);
    setData(imported, {
      history: !blockedSave,
      undoLabel: "inläst säkerhetskopia",
    });
    const w = Object.keys(imported.weeks).sort().at(-1);
    if (w) setWeek(w);
    setView("dashboard");
    notify("Planen har lästs in.");
  }
  function importGoogle(
    snapshot: GoogleSnapshot,
    replan: boolean,
    categories: GoogleCategoryChoices,
  ) {
    setData((current) =>
      current
        ? {
            ...previewGoogleImport(current, snapshot, replan, categories).data,
            ...(snapshot.transport === "ical"
              ? {
                  icalCalendar: {
                    calendarId: snapshot.calendarIds[0],
                    autoRefresh: true,
                  },
                }
              : {}),
          }
        : current,
    );
    setGoogleOpen(false);
    notify(
      "Google-händelserna har importerats. Planeringskonflikter visas under kalendern.",
    );
  }
  function resetPlanAndStatistics() {
    if (configured && cloud.phase === "conflict") return;
    const currentWeek = monday(today());
    setBlockedSave(false);
    setData(
      (current) => (current ? resetPlanning(current, currentWeek) : current),
      {
        history: !blockedSave,
        undoLabel: "nollställning av planering och statistik",
      },
    );
    setResetOpen(false);
    setCategoryFilter("all");
    setMobileFiltersOpen(false);
    setDaySelection(null);
    setWeek(currentWeek);
    navigate("dashboard");
    notify("Planering och statistik har nollställts.");
    requestAnimationFrame(() =>
      window.scrollTo({ top: 0, behavior: "instant" }),
    );
  }
  const weekControls = (
    <div className="week-controls">
      <button
        className="icon-button"
        aria-label="Föregående vecka"
        onClick={() => changeWeek(addDays(week, -7))}
      >
        <ChevronLeft size={18} />
      </button>
      <div className="week-title">
        <h2>Vecka {weekNumber(week)}</h2>
        <span>{weekLabel(week)}</span>
      </div>
      <button
        className="icon-button"
        aria-label="Nästa vecka"
        onClick={() => changeWeek(addDays(week, 7))}
      >
        <ChevronRight size={18} />
      </button>
    </div>
  );
  const calendarTools = (
    <>
      <button
        className="text-button undo-action"
        disabled={!undoAvailable}
        title={
          undoLabel
            ? `Ångra: ${undoLabel}`
            : "Inget att ångra i den här sessionen"
        }
        onClick={performUndo}
        aria-label="Ångra senaste ändringen"
      >
        <Undo2 size={16} />
        Ångra
      </button>
      <button
        className="text-button print-button"
        onClick={() => window.print()}
      >
        <Printer size={16} /> Skriv ut
      </button>
      <button
        className="text-button generate-button"
        aria-label="Planera veckan"
        onClick={() => setGenerator(true)}
      >
        <Sparkles size={16} /> Planera veckan
      </button>
      <button
        className="text-button google-calendar-button"
        onClick={() => setGoogleOpen(true)}
        aria-label="Öppna Google Kalender"
      >
        <CalendarDays size={16} />
        <span>Google Kalender</span>
      </button>
    </>
  );
  const generationData = {
    ...data,
    settings: { ...weekData.settings, autoPlanning: automaticDraft },
  };
  const generation = generator
    ? generateWeek(
        week,
        generationData,
        plan,
        automaticDraft ? { notBefore: planningBoundary() } : {},
      )
    : null;
  return (
    <div className="app-shell" data-view={view}>
      <a className="skip-link" href="#main-content">
        Hoppa till innehållet
      </a>
      <PlannerMasthead
        settings={weekData.settings}
        minutes={Object.values(categoryMinutes(activities)).reduce(
          (sum, n) => sum + n,
          0,
        )}
      />
      <div className="navigation-bar">
        <nav className="workspace-navigation" aria-label="Huvudnavigation">
          {NAV.map(({ id, label, icon: Icon }, index) => (
            <button
              key={id}
              aria-label={standalone && mobile ? APP_NAV_LABELS[id] : label}
              className={`nav-item ${view === id ? "active" : ""}`}
              aria-current={view === id ? "page" : undefined}
              onClick={() => {
                navigate(id);
                if (standalone && mobile) {
                  if (id === "dashboard") changeWeek(monday(today()));
                  requestAnimationFrame(() =>
                    window.scrollTo({ top: 0, behavior: "instant" }),
                  );
                }
              }}
            >
              <span className="nav-index" aria-hidden="true">
                0{index + 1}
              </span>
              <Icon size={15} />
              <span className="nav-label">
                {standalone && mobile ? APP_NAV_LABELS[id] : label}
              </span>
            </button>
          ))}
        </nav>
        <WorkspaceTools
          connected={Boolean(user)}
          onAccount={() => setAccount(true)}
          onHelp={() => setHelp(true)}
          undoLabel={undoAvailable ? undoLabel : ""}
          onUndo={performUndo}
        />
      </div>
      <div className="main-shell">
        <main id="main-content" tabIndex={-1}>
          <div
            className={`main-heading ${view === "dashboard" || view === "planner" ? "calendar-page-heading" : ""}`}
          >
            <div>
              <h1>
                {view === "dashboard"
                  ? "Min vecka"
                  : NAV.find((n) => n.id === view)?.label}
              </h1>
            </div>
          </div>
          <StorageStatus
            compact={standalone && mobile}
            configured={configured}
            state={cloud}
            onAccount={() => setAccount(true)}
            onRetry={() => {
              void retry();
            }}
            onResolve={(choice) => {
              void resolveConflict(choice);
            }}
          />
          {ical.error && data.icalCalendar?.autoRefresh && !googleOpen && (
            <div className="ical-sync-error" role="status">
              <p>{ical.error}</p>
              <button
                className="text-button"
                onClick={() => setGoogleOpen(true)}
              >
                Hantera kalenderanslutning
              </button>
            </div>
          )}
          {storageError && (
            <div className="storage-error" role="alert">
              <AlertCircle size={18} />
              <span>{storageError}</span>
              <button
                className="text-button"
                onClick={() => navigate("settings")}
              >
                Till inställningar
              </button>
            </div>
          )}
          {(view === "dashboard" || view === "planner") && (
            <>
              <section className="week-section">
                <div className="week-toolbar">
                  <div className="toolbar-week-controls">{weekControls}</div>
                  <div className="week-actions">
                    <button
                      className="text-button this-week-button"
                      onClick={() => changeWeek(monday(today()))}
                    >
                      {currentWeek
                        ? mobile
                          ? "Idag"
                          : "Denna vecka"
                        : "Till idag"}
                    </button>
                    {mobile ? (
                      <details className="calendar-tools-menu">
                        <summary>
                          <MoreHorizontal size={19} aria-hidden="true" />{" "}
                          Verktyg
                        </summary>
                        <div
                          className="calendar-menu-options"
                          onClick={(event) => {
                            if ((event.target as Element).closest("button")) {
                              const menu =
                                event.currentTarget.closest("details");
                              if (menu) menu.open = false;
                              menu?.querySelector("summary")?.focus();
                            }
                          }}
                        >
                          <button
                            className="text-button"
                            aria-expanded={mobileFiltersOpen}
                            aria-controls="calendar-category-filters"
                            onClick={() =>
                              setMobileFiltersOpen((open) => !open)
                            }
                          >
                            <ListFilter size={16} />{" "}
                            {mobileFiltersOpen
                              ? "Dölj filter"
                              : "Filtrera aktiviteter"}
                          </button>
                          {weekControls}
                          {calendarTools}
                          <AppInstallButton className="text-button" />
                        </div>
                      </details>
                    ) : (
                      calendarTools
                    )}
                    <button
                      className="button primary new-session"
                      aria-label="Ny aktivitet"
                      onClick={() =>
                        setEditor({
                          date: addDays(week, activeDay),
                          start: weekData.settings.start,
                        })
                      }
                    >
                      <Plus size={14} />
                      Nytt pass
                    </button>
                  </div>
                </div>
                <div
                  className={`week-layout ${view === "planner" ? "full-calendar" : ""}`}
                >
                  <div className="week-board">
                    {mobile && categoryFilter !== "all" && (
                      <div className="mobile-active-filter">
                        <span>
                          Visar{" "}
                          {
                            data.categories.find((c) => c.id === categoryFilter)
                              ?.name
                          }
                        </span>
                        <button
                          className="text-button"
                          onClick={() => setCategoryFilter("all")}
                        >
                          Visa alla
                        </button>
                      </div>
                    )}
                    <div
                      id="calendar-category-filters"
                      className={`calendar-filters ${mobileFiltersOpen ? "is-open" : ""}`}
                    >
                      <CategoryFilter
                        categories={data.categories}
                        selected={categoryFilter}
                        onChange={setCategoryFilter}
                        count={
                          filterActivities.filter(
                            (a) => a.categoryId === categoryFilter,
                          ).length
                        }
                        total={filterActivities.length}
                      />
                    </div>
                    <FollowUpPanel
                      data={data}
                      week={week}
                      onReschedule={reschedule}
                      onEdit={editInWeek}
                    />
                    <Calendar
                      mobile={mobile}
                      activeDay={activeDay}
                      onSelectDay={selectDay}
                      onDelete={(a) => deleteActivity(a.id, false)}
                      week={week}
                      data={weekData}
                      activities={activities}
                      categoryFilter={categoryFilter}
                      onEdit={openActivity}
                      onMove={move}
                      onStatusChange={(activity, status) =>
                        updatePlan({
                          ...plan,
                          activities: activities.map((a) =>
                            a.id === activity.id ? { ...a, status } : a,
                          ),
                        })
                      }
                      onCreate={(date, start) =>
                        setEditor({
                          date,
                          start: start ?? weekData.settings.start,
                        })
                      }
                    />
                    <div className="bottomstrip">
                      <span>{time(weekData.settings.start)} / Start</span>
                      <span className="registration-line" aria-hidden="true" />
                      <span>{time(weekData.settings.end)} / Slut</span>
                    </div>
                  </div>
                </div>
              </section>
              {view === "dashboard" && (
                <details className="info-drawer">
                  <summary>
                    <span className="section-tag">[ Bilaga 01 ]</span>
                    <strong>Planinfo / mål / tidsfördelning</strong>
                    <span aria-hidden="true">＋</span>
                  </summary>
                  <EditorialSidebar
                    data={weekData}
                    plan={plan}
                    goals={goals}
                    focus={focus}
                    onToggleTask={toggleTask}
                    onGoalView={() => navigate("goals")}
                    onSettings={() => navigate("settings")}
                    onEdit={openActivity}
                    onComplete={(activity) => {
                      updatePlan({
                        ...plan,
                        activities: activities.map((a) =>
                          a.id === activity.id ? { ...a, status: "done" } : a,
                        ),
                      });
                      notify("Genomförd tid är sparad.");
                    }}
                  />
                </details>
              )}
              <div
                className={`conflicts-panel ${conflicts.length ? "has-conflicts" : ""}`}
              >
                <div className="conflict-icon">
                  {conflicts.length ? (
                    <AlertCircle size={20} />
                  ) : (
                    <ShieldCheck size={20} />
                  )}
                </div>
                <div>
                  <h3>
                    {conflicts.length
                      ? `${conflicts.length} saker att se över`
                      : "Inga planeringskonflikter"}
                  </h3>
                  {conflicts.length ? (
                    conflicts.map((c) => (
                      <div className="conflict-message" key={c.id}>
                        <strong>{c.message}</strong>
                        <p>{c.suggestion}</p>
                      </div>
                    ))
                  ) : (
                    <p>Inga överlappningar eller saknade tidsmål.</p>
                  )}
                </div>
                {conflicts.length > 0 && (
                  <button
                    className="text-button"
                    onClick={() => navigate("settings")}
                  >
                    Justera veckan
                    <ArrowRight size={15} />
                  </button>
                )}
              </div>
              {view === "planner" && (
                <section className="activity-list">
                  <h3>Veckans aktiviteter</h3>
                  <p className="muted">
                    Öppna en aktivitet för att ändra tid, status, mål eller
                    återkommande regel. Genomförd tid följs upp i
                    veckoreflektionen.
                  </p>
                  <div className="activity-table">
                    {activities.map((a) => (
                      <button
                        key={a.id}
                        onClick={() => setEditor({ activity: a, date: a.date })}
                      >
                        <span
                          className="activity-dot"
                          style={{
                            background: data.categories.find(
                              (c) => c.id === a.categoryId,
                            )?.color,
                          }}
                        />
                        <strong>{a.title}</strong>
                        <span>
                          {a.date.slice(5)} · {time(a.start)}–{time(a.end)}
                        </span>
                        <span>
                          {a.status === "done"
                            ? "Genomförd"
                            : a.status === "skipped"
                              ? "Blev inte av"
                              : a.blockType === "locked"
                                ? "Låst"
                                : a.blockType === "protected"
                                  ? "Skyddad"
                                  : "Flexibel"}
                        </span>
                        <ArrowUpRight size={15} />
                      </button>
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
          {view === "career" && (
            <CareerView
              key={`career-${user?.id ?? "local"}-${undoVersion}`}
              data={data}
              onEditing={setCareerEditing}
              onChange={(next, base) => {
                setData(
                  (current) => {
                    if (
                      !current ||
                      JSON.stringify(current) !== JSON.stringify(base)
                    ) {
                      notify(
                        "Arbetsytan har ändrats. Öppna formuläret eller förhandsvisningen igen.",
                      );
                      return current;
                    }
                    return next;
                  },
                  { undoLabel: "jobb och nätverk" },
                );
              }}
              onOpen={(activity) => {
                changeWeek(monday(activity.date));
                setEditor({ activity, date: activity.date });
              }}
            />
          )}
          {view === "goals" && (
            <GoalsView
              data={data}
              week={week}
              onToggle={toggleTask}
              onNew={() => setNewGoal(true)}
              onAddTask={(goalId, title) =>
                setData({
                  ...data,
                  tasks: [
                    ...data.tasks,
                    { id: uid(), goalId, title, done: false },
                  ],
                })
              }
              onDelete={(id) => {
                if (
                  window.confirm(
                    "Ta bort målet och dess uppgifter? Planerade aktiviteter bevaras.",
                  )
                )
                  setData({
                    ...data,
                    goals: data.goals.filter((g) => g.id !== id),
                    tasks: data.tasks.filter((t) => t.goalId !== id),
                    weeks: Object.fromEntries(
                      Object.entries(data.weeks).map(([w, p]) => [
                        w,
                        {
                          ...p,
                          activities: p.activities.map((a) =>
                            a.goalId === id ? { ...a, goalId: undefined } : a,
                          ),
                        },
                      ]),
                    ),
                  });
              }}
            />
          )}
          {view === "reflection" && (
            <>
              <div className="reflection-week">
                <button
                  className="icon-button"
                  aria-label="Föregående reflektionsvecka"
                  onClick={() => changeWeek(addDays(week, -7))}
                >
                  <ChevronLeft size={18} />
                </button>
                <span>
                  Vecka {weekNumber(week)} · {weekLabel(week)}
                </span>
                <button
                  className="icon-button"
                  aria-label="Nästa reflektionsvecka"
                  onClick={() => changeWeek(addDays(week, 7))}
                >
                  <ChevronRight size={18} />
                </button>
              </div>
              <ReflectionView
                data={data}
                week={week}
                storageLabel={
                  configured
                    ? syncLabel(cloud)
                    : "Sparas automatiskt på enheten"
                }
                onWeek={changeWeek}
                onChange={(r) =>
                  setData({
                    ...data,
                    reflections: { ...data.reflections, [week]: r },
                  })
                }
              />
            </>
          )}
          {view === "settings" && (
            <SettingsView
              key={`settings-${week}-${undoVersion}`}
              data={data}
              week={week}
              cloudEnabled={configured}
              onGoogle={() => setGoogleOpen(true)}
              onCategoryRules={(rules) =>
                setData(
                  (current) =>
                    current
                      ? { ...current, calendarCategoryRules: rules }
                      : current,
                  { undoLabel: "kategoriregler" },
                )
              }
              onApplyCategoryRules={() => {
                setData(
                  (current) => {
                    if (!current) return current;
                    const result = applyCalendarCategoryRules(current);
                    return replanAfterBookings(
                      result.data,
                      Object.keys(current.weeks).filter(
                        (key) => current.weeks[key] !== result.data.weeks[key],
                      ),
                    );
                  },
                  { undoLabel: "kategorisering av sparade bokningar" },
                );
                notify(
                  "Kategorireglerna har tillämpats. Manuella kategorival har behållits.",
                );
              }}
              onApply={applySettings}
              onImport={replaceData}
              onRemoveRecurring={(id) =>
                setData({
                  ...data,
                  recurring: data.recurring.filter((r) => r.id !== id),
                })
              }
              onAccount={() => setAccount(true)}
              onReset={() => setResetOpen(true)}
            />
          )}
          <BackCoverInfo
            storageText={
              configured
                ? "Planer, mål och reflektioner sparas automatiskt i ditt konto."
                : "Planer, mål och reflektioner sparas på den här enheten. Molnanslutning saknas."
            }
            onReflection={() => navigateAndReveal("reflection", "main-content")}
            onStorage={() => navigateAndReveal("settings", "storage-settings")}
          />
          <footer className="page-footer">
            <span>Veckoverket / Nr 005 / Punk × Riso</span>
            <span>
              {storageError
                ? "Lagring behöver ses över"
                : blockedSave
                  ? "Originalplanen är skyddad"
                  : configured
                    ? syncLabel(cloud)
                    : "Ändringar sparas på den här enheten"}
              <span className="footer-dot" />
              Europe/Stockholm
            </span>
          </footer>
        </main>
      </div>
      {notice && (
        <div className="toast" role="status">
          <span>{notice}</span>
          {undoAvailable && (
            <button
              className="text-button"
              onClick={performUndo}
              aria-label="Ångra senaste ändringen"
            >
              Ångra
            </button>
          )}
          <button
            className="icon-button"
            onClick={() => setNotice("")}
            aria-label="Stäng meddelandet"
          >
            <X size={16} />
          </button>
        </div>
      )}
      {resetOpen && (
        <ResetPlanningModal
          data={data}
          cloudEnabled={configured}
          protectedCopy={blockedSave}
          blockedReason={
            configured && cloud.phase === "conflict"
              ? "Lös versionskonflikten innan du nollställer. Välj vilken plan som ska användas under Konto & molnlagring."
              : undefined
          }
          onClose={() => setResetOpen(false)}
          onConfirm={resetPlanAndStatistics}
        />
      )}
      {googleOpen && (
        <GoogleCalendarModal
          data={data}
          week={week}
          connection={google}
          ical={ical}
          onIcalAutomatic={(enabled) =>
            setData((current) =>
              current?.icalCalendar
                ? {
                    ...current,
                    icalCalendar: {
                      ...current.icalCalendar,
                      autoRefresh: enabled,
                    },
                  }
                : current,
            )
          }
          onIcalDisconnected={() =>
            setData(
              (current) => {
                if (!current) return current;
                const { icalCalendar: _feed, ...rest } = current;
                return rest;
              },
              { history: false },
            )
          }
          onImport={importGoogle}
          onRemove={() => {
            setData((current) => {
              if (!current) return current;
              const next = removeGoogleImports(current);
              return replanAfterBookings(
                next,
                Object.keys(current.weeks).filter((key) =>
                  current.weeks[key].activities.some((a) => a.external),
                ),
              );
            });
            notify(
              "Importerade Google-händelser har tagits bort från Veckoverket.",
            );
          }}
          onClose={() => setGoogleOpen(false)}
        />
      )}
      {editor && (
        <ActivityEditor
          activity={editor.activity}
          initialStart={editor.start}
          followUp={editor.followUp}
          data={weekData}
          activities={activities}
          date={editor.date}
          onSave={saveActivity}
          onDelete={deleteActivity}
          onCategorize={(activity, categoryId) => {
            setData((current) => {
              if (!current) return current;
              const affected = Object.keys(current.weeks).filter((key) =>
                current.weeks[key].activities.some(
                  (a) =>
                    a.external?.calendarId === activity.external?.calendarId &&
                    a.external?.eventId === activity.external?.eventId,
                ),
              );
              return replanAfterBookings(
                categorizeGoogleEvent(current, activity, categoryId),
                affected,
              );
            });
            setEditor(null);
            notify("Bokningens kategori är sparad.");
          }}
          onClose={() => setEditor(null)}
        />
      )}
      {routineActivity && (
        <WeeklyRoutineModal
          activity={routineActivity}
          data={data}
          week={week}
          storageLabel={
            configured ? syncLabel(cloud) : "Sparas automatiskt på enheten"
          }
          onChange={(reflection) =>
            setData((current) =>
              current
                ? {
                    ...current,
                    reflections: { ...current.reflections, [week]: reflection },
                  }
                : current,
            )
          }
          onTask={toggleTask}
          onComplete={() => {
            updatePlan({
              ...plan,
              activities: activities.map((a) =>
                a.id === routineActivity.id ? { ...a, status: "done" } : a,
              ),
            });
            setRoutineId(null);
          }}
          onEdit={() => {
            setRoutineId(null);
            setEditor({
              activity: routineActivity,
              date: routineActivity.date,
            });
          }}
          onGoals={() => {
            setRoutineId(null);
            navigate("goals");
          }}
          onNextWeek={() => {
            changeWeek(addDays(week, 7));
            navigate("planner");
          }}
          onClose={() => setRoutineId(null)}
        />
      )}
      {newGoal && (
        <GoalForm
          data={data}
          week={week}
          onSave={(goal: Goal, tasks: Task[]) => {
            setData({
              ...data,
              goals: [...data.goals, goal],
              tasks: [...data.tasks, ...tasks],
            });
            setNewGoal(false);
            notify("Målet har skapats.");
          }}
          onClose={() => setNewGoal(false)}
        />
      )}
      {generator && generation && (
        <Modal
          title="Automatisk veckoplanering"
          description="Planera utifrån bokningar, tillgänglighet och tidsmål."
          onClose={() => setGenerator(false)}
        >
          <div className="stack">
            <label className="switch-row">
              <span>
                Automatisk planering
                <small>
                  Jobb och kompetens först i lediga tider. Planera om efter
                  ändrade bokningar.
                </small>
              </span>
              <input
                type="checkbox"
                checked={automaticDraft}
                onChange={(event) => setAutomaticDraft(event.target.checked)}
              />
            </label>
            <p>
              Oredigerade, planerade förslag ersätts. Dina egna, flyttade och
              redan genomförda aktiviteter bevaras. Låsta åtaganden och
              återkommande regler ligger till grund för den nya planen.
            </p>
            {automaticDraft && (
              <p>
                Påbörjade pass och tidigare datum behålls. Musikförmiddagar,
                lunch, familjetid och buffert följer dina regler.
                Google-bokningar räknas med när du importerar eller uppdaterar
                dem.
              </p>
            )}
            <div className="generation-totals">
              {data.categories
                .filter((c) => c.id !== "rest" && c.id !== "family")
                .map((c) => (
                  <div key={c.id}>
                    <span>
                      <i style={{ background: c.color }} />
                      {c.name}
                    </span>
                    <strong>
                      {hours(
                        categoryMinutes(generation.plan.activities)[c.id] ?? 0,
                      )}
                    </strong>
                  </div>
                ))}
            </div>
            {generation.conflicts.length > 0 ? (
              <div className="preview-warning">
                {generation.conflicts.map((c) => (
                  <p key={c.id}>
                    <strong>{c.message}</strong>
                    <br />
                    {c.suggestion}
                  </p>
                ))}
              </div>
            ) : (
              <p className="preview-success">
                <Check size={17} />
                Inga konflikter i förslaget.
              </p>
            )}
            <button
              className="button primary"
              disabled={generation.conflicts.some(
                (c) => c.severity === "error",
              )}
              onClick={() => {
                setData({
                  ...data,
                  settings: { ...data.settings, autoPlanning: automaticDraft },
                  weeks: {
                    ...data.weeks,
                    [week]: linkedPlan(
                      generation.plan,
                      data.goals,
                      automaticDraft ? plan.activities : [],
                    ),
                  },
                });
                setGenerator(false);
                notify("Ditt nya veckoförslag är sparat.");
              }}
            >
              <Sparkles size={16} />
              {automaticDraft
                ? "Aktivera och använd planen"
                : "Använd förslaget"}
            </button>
            {data.settings.autoPlanning && (
              <button
                className="button secondary"
                onClick={() => {
                  setData({
                    ...data,
                    settings: { ...data.settings, autoPlanning: false },
                  });
                  setAutomaticDraft(false);
                  setGenerator(false);
                  notify(
                    "Automatisk planering är pausad. Den sparade planen behålls.",
                  );
                }}
              >
                Pausa automatisk planering
              </button>
            )}
          </div>
        </Modal>
      )}
      {account && (
        <Account
          data={data}
          user={user}
          state={cloud}
          onSync={retry}
          onLogout={logout}
          onClose={() => setAccount(false)}
        />
      )}
      {help && (
        <Modal title="Hjälp" onClose={() => setHelp(false)}>
          <div className="stack intro">
            <p>
              <strong>1. Ange planeringsregler.</strong>
              <br />
              Under inställningar väljer du tider, musikförmiddagar,
              träningspass och dina livsområden.
            </p>
            <p>
              <strong>2. Redigera aktiviteter.</strong>
              <br />
              Klicka på ett pass för att ändra datum och tid. Dra flexibla
              aktiviteter till en annan dag med samma starttid. Skyddad tid
              hålls samman och låst tid flyttas aldrig med dra och släpp. Alla
              tider går också att ändra med tangentbord i formuläret.
            </p>
            <p>
              <strong>3. Följ upp tid och uppgifter.</strong>
              <br />
              Skapa mål och bocka av konkreta uppgifter. Markera aktiviteter som
              genomförda för att skilja på planerad och faktisk tid. Reflektera
              när veckan är slut.
            </p>
            <p>
              {configured
                ? "Planen sparas automatiskt i ditt konto. Väntande ändringar har en separat kopia på den här enheten och skickas när anslutningen återkommer."
                : "Planen sparas på den här enheten tills molnanslutningen har aktiverats."}{" "}
              Exportera en säkerhetskopia under inställningar.
            </p>
            <button className="button primary" onClick={() => setHelp(false)}>
              Stäng
              <ArrowRight size={16} />
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
