"use client";
import { useEffect, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { Account } from "./account";
import { WeekTemplateOverview } from "./week-template-overview";
import { appPath } from "@/lib/app-path";
import { cloudTransport, supabase } from "@/lib/supabase";
import { loadLocal, saveLocal } from "@/lib/storage";
import { cacheKey, type SyncSnapshot } from "@/lib/workspace-sync";
import { addDays, monday, today, weekLabel, weekNumber } from "@/lib/date";
import { isLocalDate } from "@/lib/google-time";
import {
  createPersonalSchedule,
  createPersonalScheduleInCloud,
  type PersonalScheduleReport,
} from "@/lib/create-personal-schedule";

const empty: SyncSnapshot = {
  data: null,
  phase: "loading",
  pending: false,
  error: "",
  storageError: "",
  updatedAt: "",
};

export function PersonalSchedulePage() {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(!supabase);
  const [authError, setAuthError] = useState("");
  const [week, setWeek] = useState("");
  const [report, setReport] = useState<PersonalScheduleReport | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const runs = useRef(new Map<string, Promise<PersonalScheduleReport>>());

  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("week");
    const next = addDays(monday(today()), 7);
    if (
      requested &&
      (!isLocalDate(requested) ||
        monday(requested) !== requested ||
        requested < next)
    ) {
      setError(
        "Välj nästa vecka eller en senare vecka. Tidigare veckor ändras inte här.",
      );
      return;
    }
    setWeek(requested ?? next);
  }, []);

  useEffect(() => {
    const client = supabase;
    if (!client) return;
    let active = true,
      observed = false;
    const connect = (next: User | null) => {
      if (!active) return;
      setUser(next);
      setAuthReady(true);
    };
    const { data } = client.auth.onAuthStateChange((_event, session) => {
      observed = true;
      queueMicrotask(() => connect(session?.user ?? null));
    });
    void client.auth
      .getSession()
      .then(({ data, error }) => {
        if (!active || observed) return;
        if (error)
          setAuthError("Inloggningen kunde inte kontrolleras. Logga in igen.");
        connect(data.session?.user ?? null);
      })
      .catch(() => {
        if (active) {
          setAuthError("Inloggningen kunde inte kontrolleras. Logga in igen.");
          setAuthReady(true);
        }
      });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!week || !authReady || (supabase && !user)) return;
    let active = true;
    const key = `${user?.id ?? "local"}:${week}:${retry}`;
    setError("");
    setReport(null);
    if (!runs.current.has(key))
      runs.current.set(
        key,
        Promise.resolve().then(async () => {
          if (user) {
            const cached = localStorage.getItem(cacheKey(user.id));
            if (cached && JSON.parse(cached).dirty)
              throw new Error(
                "Du har osparade ändringar på den här enheten. Öppna veckoplanen och synkronisera dem först. Återvänd sedan hit.",
              );
            return createPersonalScheduleInCloud(cloudTransport(user.id), week);
          }
          const data = loadLocal(localStorage);
          if (!data)
            throw new Error("Ingen sparad plan hittades på den här enheten.");
          const result = createPersonalSchedule(data, week);
          if (result.data !== data) saveLocal(localStorage, result.data);
          const verified = loadLocal(localStorage);
          if (!verified)
            throw new Error(
              "Det sparade veckoschemat kunde inte kontrolleras.",
            );
          const check = createPersonalSchedule(verified, week);
          if (check.data !== verified)
            throw new Error("Veckoschemat kunde inte verifieras. Försök igen.");
          return check.report;
        }),
      );
    void runs.current
      .get(key)!
      .then((value) => {
        if (active) setReport(value);
      })
      .catch((error) => {
        if (active)
          setError(
            error instanceof Error
              ? error.message
              : "Schemat kunde inte sparas. Försök igen.",
          );
      });
    return () => {
      active = false;
    };
  }, [week, authReady, user?.id, retry]);

  if (authReady && supabase && !user)
    return (
      <main className="cloud-gate">
        <p>Logga in för att skapa ditt veckoschema i din sparade plan.</p>
        {authError && <p role="alert">{authError}</p>}
        <Account
          data={null}
          user={null}
          state={empty}
          embedded
          onSync={() => undefined}
          onLogout={async () => {}}
          onClose={() => {}}
        />
      </main>
    );

  return (
    <main
      className="page-section"
      style={{
        maxWidth: 760,
        margin: "40px auto",
        padding: 24,
        display: "grid",
        gap: 20,
      }}
    >
      <h1>Ditt veckoschema</h1>
      {week && (
        <p>
          <strong>
            Vecka {weekNumber(week)} · {weekLabel(week)}
          </strong>
        </p>
      )}
      {user && (
        <p>
          Konto: <strong>{user.email}</strong>
        </p>
      )}
      <p>
        Dina tider måndag–torsdag läggs in i kalendern. Schemat används också
        för nya veckor.
      </p>
      {!report && !error && (
        <p role="status">
          {authReady
            ? "Skapar, sparar och kontrollerar veckoschemat…"
            : "Kontrollerar inloggningen…"}
        </p>
      )}
      {report && (
        <section aria-label="Sparat veckoschema" className="stack">
          <h2>Veckoschemat är sparat</h2>
          <p role="status">
            Kontrollerat i {user ? "molnplanen" : "den sparade planen"}:{" "}
            {report.slots} av 19 schemapass finns på dina tider.
          </p>
          {report.conflicts.length > 0 ? (
            <div>
              <h3>Krockar med egna bokningar</h3>
              <p>
                Dina schemapass och egna bokningar finns kvar. Flytta den
                bokning som passar bäst i kalendern.
              </p>
              <ul>
                {report.conflicts.map((message, i) => (
                  <li key={i}>{message}</li>
                ))}
              </ul>
            </div>
          ) : (
            <p>Inga tidskrockar i den sparade veckan.</p>
          )}
        </section>
      )}
      {error && (
        <div className="stack">
          <p role="alert">{error}</p>
          {week && (
            <button
              className="button primary"
              onClick={() => setRetry((value) => value + 1)}
            >
              Försök igen
            </button>
          )}
        </div>
      )}
      <p>
        <a
          className="button primary"
          href={`${appPath()}${week ? `?week=${week}&schedule=${Date.now()}` : ""}`}
        >
          {report
            ? `Öppna vecka ${weekNumber(week)} i kalendern`
            : "Öppna veckoplanen"}
        </a>
      </p>
      <WeekTemplateOverview />
    </main>
  );
}
