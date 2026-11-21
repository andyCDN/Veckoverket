"use client";
import { useState } from "react";
import { appPath } from "@/lib/app-path";
import styles from "./app-recovery.module.css";

export function AppRecovery({ error }: { error: unknown }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const detail =
    error instanceof Error ? error.message : "Ett okänt startfel inträffade.";
  async function refresh() {
    if (busy) return;
    if (!navigator.onLine) {
      setMessage("Anslut till internet för att hämta appen på nytt.");
      return;
    }
    setBusy(true);
    try {
      const scope = new URL(appPath(), location.origin).href;
      if ("serviceWorker" in navigator)
        for (const registration of await navigator.serviceWorker.getRegistrations())
          if (registration.scope === scope) await registration.unregister();
      if ("caches" in window)
        for (const key of await caches.keys())
          if (
            key.startsWith(`veckoverket-pwa-${encodeURIComponent(appPath())}-`)
          )
            await caches.delete(key);
      location.replace(`${appPath()}?reload=${Date.now()}`);
    } catch {
      setBusy(false);
      setMessage(
        "Appen kunde inte hämtas på nytt. Prova att ladda om sidan när anslutningen fungerar.",
      );
    }
  }
  return (
    <main className={styles.screen}>
      <section className={styles.card} aria-labelledby="recovery-title">
        <p className={styles.brand}>Veckoverket</p>
        <h1 id="recovery-title">Veckoverket kunde inte öppnas</h1>
        <p>
          Ett startfel stoppade sidan. Hämta den senaste appversionen eller
          öppna schemaimporten separat.
        </p>
        <p>Din inloggning och sparade plan behålls när appen hämtas på nytt.</p>
        <div className={styles.actions}>
          <button
            onClick={() => {
              void refresh();
            }}
            disabled={busy}
          >
            {busy ? "Hämtar appen…" : "Hämta appen på nytt"}
          </button>
          <a href={appPath("/importera-schema/")}>Öppna schemaimporten</a>
        </div>
        {message && <p role="alert">{message}</p>}
        <details>
          <summary>Visa felorsak</summary>
          <p className={styles.detail}>{detail.slice(0, 2000)}</p>
        </details>
      </section>
    </main>
  );
}
