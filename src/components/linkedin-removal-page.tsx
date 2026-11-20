"use client";
import { useEffect, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { Account } from "./account";
import { appPath } from "@/lib/app-path";
import { cloudTransport, supabase } from "@/lib/supabase";
import { loadLocal, saveLocal } from "@/lib/storage";
import {
  linkedInSeriesCounts,
  removeLinkedInSeries,
} from "@/lib/activity-exclusions";
import {
  removeLinkedInFromCloud,
  type LinkedInRemovalReport,
} from "@/lib/linkedin-removal";
import type { SyncSnapshot } from "@/lib/workspace-sync";

const empty: SyncSnapshot = {
  data: null,
  phase: "loading",
  pending: false,
  error: "",
  storageError: "",
  updatedAt: "",
};

export function LinkedInRemovalPage() {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(!supabase);
  const [authError, setAuthError] = useState("");
  const [report, setReport] = useState<LinkedInRemovalReport | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const runs = useRef(new Map<string, Promise<LinkedInRemovalReport>>());

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
    if (!authReady || (supabase && !user)) return;
    let active = true;
    const key = `${user?.id ?? "local"}:${retry}`;
    setError("");
    setReport(null);
    if (!runs.current.has(key))
      runs.current.set(
        key,
        user
          ? removeLinkedInFromCloud(cloudTransport(user.id))
          : Promise.resolve().then(() => {
              const data = loadLocal(localStorage);
              if (!data)
                throw new Error(
                  "Ingen sparad plan hittades på den här enheten.",
                );
              const result = removeLinkedInSeries(data, [], true);
              saveLocal(localStorage, result.data);
              const verified = loadLocal(localStorage);
              if (!verified)
                throw new Error("Den sparade planen kunde inte kontrolleras.");
              const remaining = linkedInSeriesCounts(verified);
              if (remaining.bookings || remaining.rules)
                throw new Error(
                  "Alla LinkedIn-bokningar kunde inte tas bort. Försök igen.",
                );
              return {
                removedBookings: result.removedBookings,
                removedRules: result.removedRules,
                remainingBookings: 0,
                remainingRules: 0,
              };
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
              : "Rensningen misslyckades. Försök igen.",
          );
      });
    return () => {
      active = false;
    };
  }, [authReady, user?.id, retry]);

  if (authReady && supabase && !user)
    return (
      <main className="cloud-gate">
        <p>
          Logga in på kontot där LinkedIn-bokningen ska raderas från alla dagar.
        </p>
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
      style={{ maxWidth: 720, margin: "40px auto", padding: 24 }}
    >
      <h1>Radera LinkedIn-bokningen alla dagar</h1>
      {user && (
        <p>
          Konto: <strong>{user.email}</strong>
        </p>
      )}
      <p>
        Hela serien och alla dess tillfällen raderas, oavsett datum och status.
        Andra bokningar behålls.
      </p>
      {!report && !error && (
        <p role="status">
          {authReady
            ? "Raderar och kontrollerar den sparade planen…"
            : "Kontrollerar inloggningen…"}
        </p>
      )}
      {report && (
        <section aria-label="Rensningsresultat" className="stack">
          <h2>
            {report.removedBookings || report.removedRules
              ? "LinkedIn-serien är raderad"
              : "Ingen LinkedIn-serie finns kvar"}
          </h2>
          <p>
            {report.removedBookings}{" "}
            {report.removedBookings === 1 ? "bokning" : "bokningar"} och{" "}
            {report.removedRules} återkommande{" "}
            {report.removedRules === 1 ? "regel" : "regler"} borttagna.
          </p>
          <p role="status">
            Kontrollerat i {user ? "molnplanen" : "den sparade planen"}: 0
            LinkedIn-bokningar och 0 återkommande regler kvar.
          </p>
          <a
            className="button primary"
            href={`${appPath()}?linkedin_removed=${Date.now()}`}
          >
            Öppna veckoplanen
          </a>
        </section>
      )}
      {error && (
        <div className="stack">
          <p role="alert">{error}</p>
          <button
            className="button primary"
            onClick={() => setRetry((value) => value + 1)}
          >
            Försök igen
          </button>
        </div>
      )}
    </main>
  );
}
