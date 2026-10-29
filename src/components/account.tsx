"use client";
import { useState } from "react";
import { Cloud, Download, Upload, LogOut } from "lucide-react";
import { Modal } from "./modal";
import { supabase, loadCloud, saveCloud } from "@/lib/supabase";
import type { AppData } from "@/lib/types";
import type { User } from "@supabase/supabase-js";
export function Account({
  data,
  user,
  onUser,
  onLoad,
  onClose,
}: {
  data: AppData;
  user: User | null;
  onUser: (u: User | null) => void;
  onLoad: (d: AppData) => void;
  onClose: () => void;
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
    } catch (e) {
      setMessage(
        e instanceof Error ? e.message : "Något gick fel. Försök igen.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title="Din plan, även i molnet"
      description="Det lokala demoläget fungerar alltid utan konto."
      onClose={onClose}
    >
      {!supabase ? (
        <div className="account-empty">
          <Cloud size={32} />
          <h3>Du är i lokalt demoläge</h3>
          <p>
            Din plan sparas i den här webbläsaren. Du kan exportera en
            säkerhetskopia under inställningar.
          </p>
          <p>
            För konton behöver miljön en Supabase-anslutning.
            Installationsanvisningarna i README beskriver hur den aktiveras.
          </p>
          <button className="button primary" onClick={onClose}>
            Fortsätt planera
          </button>
        </div>
      ) : user ? (
        <div className="stack">
          <p>
            Inloggad som <strong>{user.email}</strong>
          </p>
          <p>
            Molnlagring sker när du väljer att spara. Den senaste sparade
            versionen ersätter föregående; samredigering stöds inte ännu.
          </p>
          <button
            disabled={busy}
            className="button primary"
            onClick={() =>
              run(async () => {
                await saveCloud(user.id, data);
                setMessage("Din plan är sparad i molnet.");
              })
            }
          >
            <Upload size={17} />
            Spara aktuell plan i molnet
          </button>
          <button
            disabled={busy}
            className="button secondary"
            onClick={() =>
              run(async () => {
                const remote = await loadCloud(user.id);
                if (!remote) {
                  setMessage(
                    "Ingen molnplan ännu. Spara din aktuella plan först.",
                  );
                  return;
                }
                if (
                  window.confirm(
                    "Ersätt din lokala plan med den sparade molnplanen?",
                  )
                ) {
                  onLoad(remote);
                  setMessage("Molnplanen är inläst och sparad lokalt.");
                }
              })
            }
          >
            <Download size={17} />
            Hämta sparad molnplan
          </button>
          <button
            disabled={busy}
            className="text-button"
            onClick={() =>
              run(async () => {
                const { error } = await supabase!.auth.signOut();
                if (error) throw error;
                onUser(null);
              })
            }
          >
            <LogOut size={16} />
            Logga ut
          </button>
        </div>
      ) : (
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            run(async () => {
              const result = signup
                ? await supabase!.auth.signUp({ email, password })
                : await supabase!.auth.signInWithPassword({ email, password });
              if (result.error) throw result.error;
              if (result.data.session) onUser(result.data.user);
              else
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
            onClick={() => setSignup(!signup)}
          >
            {signup
              ? "Har du redan ett konto? Logga in"
              : "Ny här? Skapa ett konto"}
          </button>
        </form>
      )}
      {message && (
        <p className="account-message" role="status">
          {message}
        </p>
      )}
    </Modal>
  );
}
