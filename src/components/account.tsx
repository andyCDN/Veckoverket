"use client";
import { useState } from "react";
import { Cloud, Download, LogOut, RefreshCw } from "lucide-react";
import { Modal } from "./modal";
import { supabase } from "@/lib/supabase";
import { downloadData } from "@/lib/storage";
import type { AppData } from "@/lib/types";
import type { SyncSnapshot } from "@/lib/workspace-sync";
import type { User } from "@supabase/supabase-js";
import { syncLabel } from "./storage-status";
export function Account({
  data,
  user,
  state,
  onSync,
  onLogout,
  onClose,
  embedded = false,
}: {
  data: AppData | null;
  user: User | null;
  state: SyncSnapshot;
  onSync: () => Promise<void> | undefined;
  onLogout: () => Promise<void>;
  onClose: () => void;
  embedded?: boolean;
}) {
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [signup, setSignup] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setMessage("");
    try {
      await fn();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Försöket misslyckades. Försök igen.",
      );
    } finally {
      setBusy(false);
    }
  }
  const contents = (
    <>
      {!supabase ? (
        <div className="account-empty">
          <Cloud size={32} />
          <h3>Molnlagring väntar på anslutning</h3>
          <p>
            Planen sparas fortfarande på den här enheten. Molnlagringen
            aktiveras när installationen har anslutits till ett projekt.
          </p>
          <a
            href="https://github.com/andyCDN/Veckoverket/blob/main/docs/cloud-setup.md"
            target="_blank"
            rel="noreferrer"
          >
            Installationsguide för molnlagring
          </a>
          {data && (
            <button
              className="button secondary"
              onClick={() => downloadData(data)}
            >
              <Download size={16} />
              Exportera nuvarande plan
            </button>
          )}
        </div>
      ) : user ? (
        <div className="stack">
          <p>
            Inloggad som <strong>{user.email}</strong>
          </p>
          <p role="status">{syncLabel(state)}</p>
          <p>
            Ändringar sparas automatiskt i ditt konto. Enhetens kopia används
            vid avbrott och skickas när anslutningen återkommer.
          </p>
          <button
            className="button primary"
            disabled={
              busy || state.phase === "conflict" || state.phase === "migration"
            }
            onClick={() =>
              run(async () => {
                await onSync();
              })
            }
          >
            <RefreshCw size={16} />
            Synkronisera nu
          </button>
          {data && (
            <button
              className="button secondary"
              onClick={() => downloadData(data)}
            >
              <Download size={16} />
              Exportera säkerhetskopia
            </button>
          )}
          <button
            className="text-button"
            disabled={
              busy ||
              state.phase === "saving" ||
              Boolean(state.pending && state.storageError)
            }
            onClick={() => run(onLogout)}
          >
            <LogOut size={16} />
            Logga ut
          </button>
          {state.pending && state.storageError && (
            <p role="alert">
              Exportera dina ändringar eller vänta på molnsparning innan du
              loggar ut.
            </p>
          )}
        </div>
      ) : (
        <form
          className="stack"
          onSubmit={(event) => {
            event.preventDefault();
            void run(async () => {
              const result = signup
                ? await supabase!.auth.signUp({
                    email,
                    password,
                    options: {
                      emailRedirectTo: `${window.location.origin}${window.location.pathname}`,
                    },
                  })
                : await supabase!.auth.signInWithPassword({ email, password });
              if (result.error)
                throw new Error(
                  signup
                    ? "Kontot kunde inte skapas. Kontrollera uppgifterna och försök igen."
                    : "Inloggningen misslyckades. Kontrollera e-post, lösenord och anslutning.",
                );
              if (!result.data.session)
                setMessage(
                  "Kontrollera din e-post för att bekräfta kontot och logga sedan in.",
                );
            });
          }}
        >
          <label>
            E-post
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label>
            Lösenord
            <input
              type="password"
              autoComplete={signup ? "new-password" : "current-password"}
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <button className="button primary" disabled={busy} type="submit">
            {busy ? "Vänta…" : signup ? "Skapa konto" : "Logga in"}
          </button>
          <button
            className="text-button"
            type="button"
            onClick={() => {
              setSignup(!signup);
              setMessage("");
            }}
          >
            {signup ? "Har du redan ett konto? Logga in" : "Skapa ett konto"}
          </button>
        </form>
      )}
      {message && (
        <p className="account-message" role="status">
          {message}
        </p>
      )}
    </>
  );
  return embedded ? (
    <section className="cloud-auth" aria-labelledby="cloud-auth-title">
      <h1 id="cloud-auth-title">Veckoverket</h1>
      <p>Logga in för att öppna din molnplan.</p>
      {contents}
    </section>
  ) : (
    <Modal
      title="Konto och molnlagring"
      description={
        supabase
          ? "Dina planer sparas i ditt konto."
          : "Molnanslutning saknas för den här installationen."
      }
      onClose={onClose}
    >
      {contents}
    </Modal>
  );
}
