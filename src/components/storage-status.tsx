"use client";
import { Cloud, CloudOff, Download } from "lucide-react";
import type { SyncSnapshot } from "@/lib/workspace-sync";
import { downloadData } from "@/lib/storage";
export function syncLabel(state: SyncSnapshot) {
  return {
    loading: "Hämtar molnplanen…",
    migration: "Välj startplan",
    pending: "Ändringar väntar på molnsparning",
    saving: "Sparar i molnet…",
    synced: "Sparat i molnet",
    error: "Molnet har inte bekräftat ändringarna",
    conflict: "Olika versioner på enheterna",
  }[state.phase];
}
export function StorageStatus({
  configured,
  state,
  onAccount,
  onRetry,
  onResolve,
}: {
  configured: boolean;
  state: SyncSnapshot;
  onAccount: () => void;
  onRetry: () => void;
  onResolve: (choice: "cloud" | "device") => void;
}) {
  return (
    <div
      className={`storage-status ${state.phase === "error" || state.phase === "conflict" ? "needs-attention" : ""}`}
    >
      <div className="storage-status-line">
        <span role="status">
          {configured ? <Cloud size={14} /> : <CloudOff size={14} />}
          {configured
            ? syncLabel(state)
            : "Lokal lagring · molnet är inte anslutet"}
        </span>
        <button className="text-button" onClick={onAccount}>
          Konto & molnlagring
        </button>
      </div>
      {configured &&
        (state.phase === "error" || state.phase === "conflict") && (
          <div className="storage-status-detail">
            <p role="alert">{state.error}</p>
            <div className="storage-resolution">
              {state.phase === "conflict" ? (
                <>
                  <button
                    className="button secondary"
                    onClick={() => onResolve("cloud")}
                  >
                    Använd molnversionen
                  </button>
                  <button
                    className="button secondary"
                    onClick={() => onResolve("device")}
                  >
                    Spara enhetens version
                  </button>
                </>
              ) : (
                <button className="button secondary" onClick={onRetry}>
                  Försök igen
                </button>
              )}
              {state.data && (
                <button
                  className="text-button"
                  onClick={() => downloadData(state.data!)}
                >
                  <Download size={13} />
                  Exportera enhetens kopia
                </button>
              )}
            </div>
          </div>
        )}
    </div>
  );
}
