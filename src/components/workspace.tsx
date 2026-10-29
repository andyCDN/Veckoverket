"use client";
import { useCallback, useEffect, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  LayoutDashboard,
  Menu,
  Plus,
  Settings2,
  Sparkles,
  Target,
  X,
  BookOpen,
  AlertCircle,
  Cloud,
  ShieldCheck,
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
  monday,
  time,
  today,
  uid,
  weekLabel,
  weekNumber,
} from "@/lib/date";
import {
  assessWeek,
  categoryMinutes,
  generateWeek,
  targetMinutes,
  validateMove,
  validatePlan,
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
  const [mobileMenu, setMobileMenu] = useState(false),
    [editor, setEditor] = useState<{
      activity?: Activity;
      date: string;
      start?: number;
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
    setMobileMenu(false);
  };
  function changeWeek(w: string) {
    setWeek(w);
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
    conflicts = assessWeek(plan, data),
    totals = categoryMinutes(activities),
    completed = categoryMinutes(activities, "done");
  const focus =
    activities.find(
      (a) =>
        a.status === "planned" && a.blockType !== "locked" && a.date >= today(),
    ) ??
    activities.find((a) => a.status === "planned" && a.blockType !== "locked");
  const goals = data.goals.filter((g) => g.week === week);
  const currentWeek = week === monday(today());
  const weekData = { ...data, settings: plan.rules ?? data.settings };
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
    setData(imported);
    const w = Object.keys(imported.weeks).sort().at(-1);
    if (w) setWeek(w);
    setView("dashboard");
    notify("Planen har lästs in.");
  }
  const generation = generator ? generateWeek(week, data, plan) : null;
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Hoppa till innehållet
      </a>
      {mobileMenu && (
        <button
          className="sidebar-scrim"
          onClick={() => setMobileMenu(false)}
          aria-label="Stäng menyn"
        />
      )}
      <aside className={`sidebar ${mobileMenu ? "is-open" : ""}`}>
        <button
          className="brand"
          onClick={() => navigate("dashboard")}
          aria-label="Veckoverket, startsida"
        >
          <span className="brand-symbol">
            <i />
            <i />
            <i />
          </span>
          veckoverket<span className="brand-dot">.</span>
        </button>
        <button
          className="mobile-menu-close icon-button"
          onClick={() => setMobileMenu(false)}
          aria-label="Stäng menyn"
        >
          <X size={20} />
        </button>
        <div className="workspace-label">NAVIGATION</div>
        <nav aria-label="Huvudnavigation">
          {NAV.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              className={`nav-item ${view === id ? "active" : ""}`}
              aria-current={view === id ? "page" : undefined}
              onClick={() => navigate(id)}
            >
              <Icon size={19} />
              {label}
              {view === id && <span className="nav-active-dot" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button className="help-button" onClick={() => setHelp(true)}>
            <CircleHelp size={18} />
            Hjälp
            <ArrowUpRight size={14} />
          </button>
          <button className="profile-button" onClick={() => setAccount(true)}>
            <span className="avatar">
              {data.profile.name.slice(0, 1).toUpperCase()}
            </span>
            <span>
              <strong>{data.profile.name}</strong>
              <small>{user ? "Anslutet konto" : "Lokal profil"}</small>
            </span>
            <Settings2 size={16} />
          </button>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div>
            <button
              className="icon-button mobile-menu-button"
              onClick={() => setMobileMenu(true)}
              aria-label="Öppna menyn"
            >
              <Menu size={21} />
            </button>
            <span className="breadcrumb">
              Planering<span>/</span>
              <strong>{NAV.find((n) => n.id === view)?.label}</strong>
            </span>
          </div>
          <button className="local-badge" onClick={() => setAccount(true)}>
            <span />
            {user ? (
              <>
                <Cloud size={13} />
                Anslutet konto
              </>
            ) : (
              "Lokalt demoläge"
            )}
            <ChevronRight size={13} />
          </button>
        </header>
        <main id="main-content" tabIndex={-1}>
          <div className="main-heading">
            <div>
              <h1>
                {view === "dashboard"
                  ? "Min vecka"
                  : NAV.find((n) => n.id === view)?.label}
              </h1>
            </div>
            {(view === "dashboard" || view === "planner") && (
              <button
                className="button primary"
                onClick={() =>
                  setEditor({ date: week, start: weekData.settings.start })
                }
              >
                <Plus size={18} />
                Ny aktivitet
              </button>
            )}
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
              <section
                className="balance-section"
                aria-label="Veckans tidsfördelning"
              >
                <div className="balance-heading">
                  <h2>Veckans tidsfördelning</h2>
                  <span>Planerad tid per livsområde</span>
                </div>
                <div className="balance-stats">
                  {data.categories.map((c) => (
                    <button
                      className="balance-stat"
                      key={c.id}
                      onClick={() => navigate("settings")}
                      style={{ "--category": c.color } as React.CSSProperties}
                    >
                      <span className="stat-name">
                        <i />
                        {c.name}
                      </span>
                      <strong>
                        {hours(totals[c.id] ?? 0)}
                        <span>
                          {c.id === "career"
                            ? "planerad jobbtid"
                            : c.id === "family"
                              ? "reserverad tid"
                              : c.id === "rest"
                                ? "inklusive lunch & paus"
                                : `av ${hours(plan.targets?.[c.id] ?? targetMinutes(c, weekData.settings))}`}
                        </span>
                      </strong>
                      <div className="stat-track">
                        <span
                          style={{
                            width: `${Math.min(100, ((totals[c.id] ?? 0) / ((plan.targets?.[c.id] ?? targetMinutes(c, weekData.settings)) || 300)) * 100)}%`,
                          }}
                        />
                      </div>
                    </button>
                  ))}
                </div>
              </section>
              <section className="week-section">
                <div className="week-toolbar">
                  <div className="week-title">
                    <h2>Vecka {weekNumber(week)}</h2>
                    <span>{weekLabel(week)}</span>
                  </div>
                  <div className="week-actions">
                    <div className="week-navigation">
                      <button
                        className="icon-button"
                        aria-label="Föregående vecka"
                        onClick={() => changeWeek(addDays(week, -7))}
                      >
                        <ChevronLeft size={17} />
                      </button>
                      <button
                        className="this-week-button"
                        onClick={() => changeWeek(monday(today()))}
                      >
                        {currentWeek ? "Denna vecka" : "Till idag"}
                      </button>
                      <button
                        className="icon-button"
                        aria-label="Nästa vecka"
                        onClick={() => changeWeek(addDays(week, 7))}
                      >
                        <ChevronRight size={17} />
                      </button>
                    </div>
                    <button
                      className="button secondary generate-button"
                      onClick={() => setGenerator(true)}
                    >
                      <Sparkles size={15} />
                      Planera veckan
                    </button>
                  </div>
                </div>
                <div
                  className={`week-layout ${view === "planner" ? "full-calendar" : ""}`}
                >
                  <Calendar
                    week={week}
                    data={weekData}
                    activities={activities}
                    onEdit={(a) => setEditor({ activity: a, date: a.date })}
                    onMove={move}
                    onCreate={(date, start) =>
                      setEditor({
                        date,
                        start: start ?? weekData.settings.start,
                      })
                    }
                  />
                  {view === "dashboard" && (
                    <aside className="week-aside">
                      <section className="focus-panel">
                        <h3>Nästa aktivitet</h3>
                        {focus ? (
                          <>
                            <span
                              className="focus-category"
                              style={{
                                color: data.categories.find(
                                  (c) => c.id === focus.categoryId,
                                )?.color,
                              }}
                            >
                              {
                                data.categories.find(
                                  (c) => c.id === focus.categoryId,
                                )?.name
                              }
                            </span>
                            <button
                              className="focus-title"
                              onClick={() =>
                                setEditor({ activity: focus, date: focus.date })
                              }
                            >
                              {focus.title}
                              <ArrowUpRight size={16} />
                            </button>
                            <p>
                              {new Intl.DateTimeFormat("sv-SE", {
                                weekday: "long",
                                day: "numeric",
                                month: "short",
                                timeZone: "UTC",
                              }).format(
                                new Date(`${focus.date}T12:00:00Z`),
                              )}{" "}
                              · {time(focus.start)}–{time(focus.end)}
                            </p>
                            <button
                              className="text-button"
                              onClick={() => {
                                updatePlan({
                                  ...plan,
                                  activities: activities.map((a) =>
                                    a.id === focus.id
                                      ? { ...a, status: "done" }
                                      : a,
                                  ),
                                });
                                notify("Genomförd tid är sparad.");
                              }}
                            >
                              <Check size={15} />
                              Markera som genomförd
                            </button>
                          </>
                        ) : (
                          <p>Inga återstående planerade aktiviteter.</p>
                        )}
                      </section>
                      <section className="weekly-goals">
                        <div className="aside-heading">
                          <h3>Veckans mål</h3>
                          <Target size={16} />
                        </div>
                        {goals.slice(0, 3).map((g) => (
                          <div className="mini-goal" key={g.id}>
                            <span className="mini-goal-title">
                              <i
                                style={{
                                  background: data.categories.find(
                                    (c) => c.id === g.categoryId,
                                  )?.color,
                                }}
                              />
                              {g.title}
                            </span>
                            {data.tasks
                              .filter((t) => t.goalId === g.id)
                              .slice(0, 2)
                              .map((t) => (
                                <label
                                  className={`task ${t.done ? "complete" : ""}`}
                                  key={t.id}
                                >
                                  <input
                                    type="checkbox"
                                    checked={t.done}
                                    onChange={() => toggleTask(t.id)}
                                  />
                                  <span className="custom-check">
                                    {t.done && <Check size={11} />}
                                  </span>
                                  <span>{t.title}</span>
                                </label>
                              ))}
                          </div>
                        ))}
                        {!goals.length && <p>Inga mål för den här veckan.</p>}
                        <button
                          className="text-button"
                          onClick={() => navigate("goals")}
                        >
                          Alla mål & aktiviteter
                          <ArrowRight size={14} />
                        </button>
                      </section>
                    </aside>
                  )}
                </div>
              </section>
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
          <footer className="page-footer">
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
              Klicka på ett tidsblock för att redigera. Dra flexibla aktiviteter
              till en ledig tid. Skyddad tid hålls samman och låst tid flyttas
              aldrig med dra och släpp. Alla tider går också att ändra med
              tangentbord i formuläret.
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
