"use client";
import { useCallback, useState } from "react";
import { Account } from "./account";
import { LoadingScreen } from "./loading-screen";
import { ScheduleImport } from "./schedule-import";
import { StorageStatus } from "./storage-status";
import { appPath } from "@/lib/app-path";
import { monday, today } from "@/lib/date";
import { createData } from "@/lib/defaults";
import { loadLocal } from "@/lib/storage";
import { cloudTransport } from "@/lib/supabase";
import { useWorkspaceStorage } from "@/lib/use-workspace-storage";
import {
  verifyScheduleImport,
  type ScheduleImportPreview,
  type ScheduleImportProof,
} from "@/lib/schedule-import";

// Keep recovery independent of calendar rendering and automatic migrations.
export function ScheduleImportPage() {
  const store = useWorkspaceStorage(createData);
  const { data, configured, user, cloud, authReady, authError } = store;
  const [week, setWeek] = useState(() => monday(today()));
  const [accountOpen, setAccountOpen] = useState(false);
  const verify = useCallback(
    async (proof: ScheduleImportProof) => {
      await Promise.resolve();
      const saved =
        configured && user
          ? (await cloudTransport(user.id).load())?.data
          : loadLocal(localStorage);
      if (!saved)
        throw new Error(
          "Den sparade planen kunde inte läsas tillbaka efter importen.",
        );
      verifyScheduleImport(saved, proof);
    },
    [configured, user?.id],
  );
  const close = () => {
    window.location.assign(`${appPath()}?week=${week}`);
  };
  if (configured && authReady && !user)
    return (
      <main className="cloud-gate">
        {authError && <p role="alert">{authError}</p>}
        <Account
          data={null}
          user={null}
          state={cloud}
          onSync={store.retry}
          onLogout={store.logout}
          onClose={close}
          embedded
        />
      </main>
    );
  if (!data || (configured && (!authReady || cloud.phase === "loading")))
    return (
      <LoadingScreen
        message={
          cloud.error ? "Planen kunde inte hämtas." : "Öppnar schemaimporten…"
        }
        failed={Boolean(cloud.error)}
      >
        {cloud.error && (
          <>
            <p role="alert">{cloud.error}</p>
            <button
              className="button primary"
              onClick={() => {
                void store.retry();
              }}
            >
              Försök igen
            </button>
          </>
        )}
      </LoadingScreen>
    );
  if (configured && cloud.phase === "migration")
    return (
      <main className="cloud-gate">
        <section className="cloud-auth stack">
          <h1>Välj plan för schemaimporten</h1>
          <p>
            På enheten finns en lokal plan. Välj om den ska användas i ditt
            konto innan du importerar ett schema.
          </p>
          <button
            className="button primary"
            onClick={() => {
              void store.chooseInitial(true);
            }}
          >
            Använd min lokala plan
          </button>
          <button
            className="button secondary"
            onClick={() => {
              void store.chooseInitial(false);
            }}
          >
            Skapa en ny molnplan
          </button>
        </section>
      </main>
    );
  const apply = (preview: ScheduleImportPreview) => {
    if (
      store.blockedSave ||
      (configured && ["loading", "migration", "conflict"].includes(cloud.phase))
    )
      return "Lös lagringen eller synkroniseringen innan du importerar schemat.";
    let changed = false;
    store.setData(
      (current) => {
        if (
          !current ||
          JSON.stringify(current) !== JSON.stringify(preview.base)
        ) {
          changed = true;
          return current;
        }
        return preview.data;
      },
      { undoLabel: "schemaimport" },
    );
    if (changed)
      return "Planen har uppdaterats. Granska importen igen innan du ersätter något.";
    setWeek(preview.changes[0].week);
    return undefined;
  };
  return (
    <main className="cloud-gate">
      <section className="cloud-auth stack">
        <h1>Importera veckoschema</h1>
        <p>Klistra in, granska och välj vilka veckor som ska ersättas.</p>
        <StorageStatus
          configured={configured}
          state={cloud}
          onAccount={() => setAccountOpen(true)}
          onRetry={() => {
            void store.retry();
          }}
          onResolve={(choice) => {
            void store.resolveConflict(choice);
          }}
        />
        <a href={appPath()}>Till veckovyn</a>
      </section>
      <ScheduleImport
        key={user?.id ?? "local"}
        data={data}
        week={week}
        cloudEnabled={configured}
        cloudPhase={cloud.phase}
        saveError={
          store.blockedSave
            ? store.storageError ||
              "Den sparade originalplanen är skyddad. Läs in en giltig plan före importen."
            : store.storageError || cloud.error
        }
        onApply={apply}
        onVerify={verify}
        onRetry={() => {
          void store.syncNow();
        }}
        onClose={close}
        onView={close}
      />
      {accountOpen && (
        <Account
          data={data}
          user={user}
          state={cloud}
          onSync={store.retry}
          onLogout={store.logout}
          onClose={() => setAccountOpen(false)}
        />
      )}
    </main>
  );
}
