"use client";
import { useCallback, useEffect, useState } from "react";
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
} from "lucide-react";
import type { User } from "@supabase/supabase-js";
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
} from "@/lib/date";
import {
  assessWeek,
  categoryMinutes,
  generateWeek,
  validateMove,
  validatePlan,
  plannedDays,
} from "@/lib/planner";
import { loadLocal, saveLocal } from "@/lib/storage";
import { supabase } from "@/lib/supabase";
import { Calendar } from "./calendar";
import { ActivityEditor } from "./activity-editor";
import { GoalsView, GoalForm } from "./goals";
import { SettingsView } from "./settings";
import { ReflectionView } from "./reflection";
import { Account } from "./account";
import { Modal } from "./modal";
import { EditorialSidebar, CategoryFilter } from "./riso";
import { PlannerMasthead, WorkspaceTools, BackCoverInfo } from "./punk";
import { FollowUpPanel } from "./follow-up";
import { followUps, type FollowUp } from "@/lib/follow-up";
type View = "dashboard" | "planner" | "goals" | "reflection" | "settings";
const NAV = [
  { id: "dashboard", label: "Min vecka", icon: LayoutDashboard },
  { id: "planner", label: "Veckoplanerare", icon: CalendarDays },
  { id: "goals", label: "Mål & aktiviteter", icon: Target },
  { id: "reflection", label: "Veckoreflektion", icon: BookOpen },
  { id: "settings", label: "Inställningar", icon: Settings2 },
] as const;
function linkedPlan(plan: WeekPlan, goals: Goal[]) {
  return {
    ...plan,
    activities: plan.activities.map((a) =>
      a.goalId
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
  const [data, setData] = useState<AppData | null>(null),
    [week, setWeek] = useState(monday(today())),
    [view, setView] = useState<View>("dashboard");
  const [daySelection, setDaySelection] = useState<{
    week: string;
    day: number;
  } | null>(null);
  const [categoryFilter, setCategoryFilter] = useState("all"),
    [editor, setEditor] = useState<{
      activity?: Activity;
      date: string;
      start?: number;
      followUp?: { source: Activity; week: string; minutes: number };
    } | null>(null),
    [newGoal, setNewGoal] = useState(false),
    [generator, setGenerator] = useState(false),
    [account, setAccount] = useState(false),
    [help, setHelp] = useState(false),
    [user, setUser] = useState<User | null>(null),
    [notice, setNotice] = useState(""),
    [storageError, setStorageError] = useState(""),
    [blockedSave, setBlockedSave] = useState(false);
  const notify = useCallback((message: string) => setNotice(message), []);
  useEffect(() => {
    try {
      setData(loadLocal(localStorage) ?? newWorkspace());
    } catch {
      setBlockedSave(true);
      setStorageError(
        "Din sparade plan kunde inte läsas. Originalet har bevarats. Importera en giltig säkerhetskopia eller välj att återställa demoläget i inställningarna.",
      );
      setData(newWorkspace());
    }
  }, []);
  useEffect(() => {
    if (!data || blockedSave) return;
    try {
      saveLocal(localStorage, data);
      setStorageError("");
    } catch {
      setStorageError(
        "Planen kunde inte sparas på enheten. Exportera en säkerhetskopia innan du stänger sidan.",
      );
    }
  }, [data, blockedSave]);
  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setNotice(""), 6000);
    return () => clearTimeout(id);
  }, [notice]);
  useEffect(() => {
    if (!supabase) return;
    supabase.auth
      .getSession()
      .then(({ data }) => setUser(data.session?.user ?? null));
    const { data: listener } = supabase.auth.onAuthStateChange((_e, session) =>
      setUser(session?.user ?? null),
    );
    return () => listener.subscription.unsubscribe();
  }, []);
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
    setWeek(w);
    setDaySelection(null);
    setData((d) => {
      if (!d || d.weeks[w]) return d;
      return {
        ...d,
        weeks: {
          ...d.weeks,
          [w]: linkedPlan(generateWeek(w, d).plan, d.goals),
        },
      };
    });
  }
  function updatePlan(plan: WeekPlan) {
    setData((d) =>
      d ? { ...d, weeks: { ...d.weeks, [plan.week]: plan } } : d,
    );
  }
  if (!data)
    return (
      <div className="loading">
        <div className="brand-mark">v</div>
        <h1>Veckoverket</h1>
        <p>Laddar veckoplanen…</p>
      </div>
    );
  const plan = data.weeks[week] ?? generateWeek(week, data).plan,
    activities = plan.activities,
    conflicts = assessWeek(plan, data);
  const focus =
    activities.find(
      (a) =>
        a.status === "planned" && a.blockType !== "locked" && a.date >= today(),
    ) ??
    activities.find((a) => a.status === "planned" && a.blockType !== "locked");
  const goals = data.goals.filter((g) => g.week === week);
  const currentWeek = week === monday(today());
  const weekData = { ...data, settings: plan.rules ?? data.settings };
  const days = plannedDays(weekData.settings);
  const activeDay =
    daySelection?.week === week && days.includes(daySelection.day)
      ? daySelection.day
      : initialDay(week, days);
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
    for (const day of days) {
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
      activities,
      weekData.settings,
      data!.categories,
    );
    if (error) {
      notify(error);
      return;
    }
    updatePlan({
      ...plan,
      activities: activities.map((item) => (item.id === a.id ? moved : item)),
    });
    notify("Aktiviteten har flyttats.");
  }
  function saveActivity(
    a: Activity,
    recurrence?: RecurringActivity,
    removeRecurrence?: boolean,
  ) {
    const current = data!;
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
      ...weeks[week],
      activities: [
        ...weeks[week].activities.filter((old) => old.id !== a.id),
        a,
      ],
    };
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
      if (errors.length && wp.week >= week) {
        notify(`Ändringen kunde inte sparas: ${errors[0].message}`);
        return;
      }
    }
    const recurring = current.recurring.filter(
      (r) =>
        r.id !== recurrence?.id &&
        !(removeRecurrence && r.id === original?.recurrenceId),
    );
    if (recurrence) recurring.push(recurrence);
    setData({ ...current, weeks, recurring });
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
    const weeks = { ...data!.weeks };
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
    setData({
      ...data!,
      weeks,
      recurring: series
        ? data!.recurring.filter((r) => r.id !== a.recurrenceId)
        : data!.recurring,
    });
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
      result = generateWeek(week, next, plan);
    const error = result.conflicts.find((c) => c.severity === "error");
    if (error) {
      notify(
        `Veckan kunde inte ändras: ${error.message} Redigera berörd aktivitet först.`,
      );
      return;
    }
    next.weeks = { ...next.weeks, [week]: linkedPlan(result.plan, next.goals) };
    setData(next);
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
    setData(imported);
    const w = Object.keys(imported.weeks).sort().at(-1);
    if (w) setWeek(w);
    setView("dashboard");
    notify("Planen har lästs in.");
  }
  const generation = generator ? generateWeek(week, data, plan) : null;
  return (
    <div className="app-shell" data-view={view}>
      <a className="skip-link" href="#main-content">
        Hoppa till innehållet
      </a>
      <PlannerMasthead
        settings={weekData.settings}
        minutes={activities.reduce((n, a) => n + a.end - a.start, 0)}
      />
      <div className="navigation-bar">
        <nav className="workspace-navigation" aria-label="Huvudnavigation">
          {NAV.map(({ id, label, icon: Icon }, index) => (
            <button
              key={id}
              aria-label={label}
              className={`nav-item ${view === id ? "active" : ""}`}
              aria-current={view === id ? "page" : undefined}
              onClick={() => navigate(id)}
            >
              <span className="nav-index" aria-hidden="true">
                0{index + 1}
              </span>
              <Icon size={15} />
              {label}
            </button>
          ))}
        </nav>
        <WorkspaceTools
          connected={Boolean(user)}
          onAccount={() => setAccount(true)}
          onHelp={() => setHelp(true)}
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
                  <div className="week-actions">
                    <button
                      className="text-button this-week-button"
                      onClick={() => changeWeek(monday(today()))}
                    >
                      {currentWeek ? "Denna vecka" : "Till idag"}
                    </button>
                    <button
                      className="text-button print-button"
                      onClick={() => window.print()}
                    >
                      <Printer size={13} />
                      Skriv ut
                    </button>
                    <button
                      className="text-button generate-button"
                      aria-label="Planera veckan"
                      onClick={() => setGenerator(true)}
                    >
                      <Sparkles size={13} />
                      Planera veckan
                    </button>
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
                    <CategoryFilter
                      categories={data.categories}
                      selected={categoryFilter}
                      onChange={setCategoryFilter}
                      count={
                        activities.filter(
                          (a) => a.categoryId === categoryFilter,
                        ).length
                      }
                      total={activities.length}
                    />
                    <FollowUpPanel
                      data={data}
                      week={week}
                      onReschedule={reschedule}
                      onEdit={editInWeek}
                    />
                    <Calendar
                      activeDay={activeDay}
                      onSelectDay={selectDay}
                      onDelete={(a) => deleteActivity(a.id, false)}
                      week={week}
                      data={weekData}
                      activities={activities}
                      categoryFilter={categoryFilter}
                      onEdit={(a) => setEditor({ activity: a, date: a.date })}
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
                    onEdit={(a) => setEditor({ activity: a, date: a.date })}
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
              key={`settings-${week}`}
              data={data}
              week={week}
              onApply={applySettings}
              onImport={replaceData}
              onRemoveRecurring={(id) =>
                setData({
                  ...data,
                  recurring: data.recurring.filter((r) => r.id !== id),
                })
              }
              onAccount={() => setAccount(true)}
              onReset={() => {
                if (
                  window.confirm(
                    "Återställ allt till en ny demoplan? Detta tar bort den lokala planen, alla mål och reflektioner. Exportera först om du vill behålla dem.",
                  )
                ) {
                  setBlockedSave(false);
                  setData(newWorkspace());
                  setWeek(monday(today()));
                  navigate("dashboard");
                  notify("En ny demoplan har skapats.");
                }
              }}
            />
          )}
          <BackCoverInfo
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
          <button
            className="icon-button"
            onClick={() => setNotice("")}
            aria-label="Stäng meddelandet"
          >
            <X size={16} />
          </button>
        </div>
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
          onClose={() => setEditor(null)}
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
          title="Ett nytt förslag för din vecka"
          description="Motorn tar hänsyn till dina ramar och prioriteringar."
          onClose={() => setGenerator(false)}
        >
          <div className="stack">
            <p>
              Oredigerade, planerade förslag ersätts. Dina egna, flyttade och
              redan genomförda aktiviteter bevaras. Låsta åtaganden och
              återkommande regler ligger till grund för den nya planen.
            </p>
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
                updatePlan(linkedPlan(generation.plan, data.goals));
                setGenerator(false);
                notify("Ditt nya veckoförslag är sparat.");
              }}
            >
              <Sparkles size={16} />
              Använd förslaget
            </button>
          </div>
        </Modal>
      )}
      {account && (
        <Account
          data={data}
          user={user}
          onUser={setUser}
          onLoad={replaceData}
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
              Planen sparas lokalt i den här webbläsaren. Exportera en
              säkerhetskopia. Inget konto eller någon extern tjänst behövs.
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
