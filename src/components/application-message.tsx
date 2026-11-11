"use client";
import { useState } from "react";
import type { JobApplication } from "@/lib/types";
import { APPLICATION_STATUSES } from "@/lib/applications";
import {
  classifyApplicationMessage,
  hasApplicationMessage,
  type ApplicationMessageUpdate,
} from "@/lib/application-message";
import { Modal } from "./modal";

export function ApplicationMessage({
  applications,
  onClose,
  onSave,
}: {
  applications: JobApplication[];
  onClose: () => void;
  onSave: (
    id: string,
    text: string,
    update: ApplicationMessageUpdate,
  ) => string | undefined;
}) {
  const [text, setText] = useState("");
  const [proposal, setProposal] = useState<ReturnType<
    typeof classifyApplicationMessage
  > | null>(null);
  const [id, setId] = useState("");
  const [status, setStatus] = useState<JobApplication["status"] | "">("");
  const [action, setAction] = useState("");
  const [date, setDate] = useState("");
  const [kind, setKind] = useState<"task" | "waiting">("task");
  const [error, setError] = useState("");
  const selected = applications.find((a) => a.id === id);
  const duplicate = selected && hasApplicationMessage(selected, text);
  const closed = status === "rejected" || status === "closed";
  return (
    <Modal title="Klistra in rekryteringsbesked" onClose={onClose}>
      <form
        className="stack"
        onSubmit={(event) => {
          event.preventDefault();
          if (!proposal) {
            const result = classifyApplicationMessage(text, applications);
            setProposal(result);
            setId(result.applicationId);
            setStatus(result.status ?? "");
            setAction(result.nextAction);
            setDate(result.followUpDate);
            setKind(result.nextActionKind);
            setError("");
          } else if (selected && status && !duplicate) {
            setError(
              onSave(id, text, {
                status,
                nextAction: closed ? "" : action,
                followUpDate: closed ? "" : date,
                nextActionKind: kind,
              }) ?? "",
            );
          }
        }}
      >
        <p>
          Klistra in ett mejl eller meddelande från rekryteraren. Texten tolkas
          lokalt med regler. Inget sparas förrän du godkänner förslaget.
        </p>
        <label>
          Besked från arbetsgivaren
          <textarea
            rows={7}
            maxLength={12000}
            required
            value={text}
            onChange={(event) => {
              setText(event.target.value);
              setProposal(null);
              setError("");
            }}
          />
        </label>
        {!proposal ? (
          <button
            className="button primary"
            disabled={!text.trim() || !applications.length}
          >
            Tolka besked
          </button>
        ) : (
          <>
            <h3>Granska och spara</h3>
            <p role="status">
              {proposal.reason} {proposal.matchReason}
            </p>
            <label>
              Ansökan
              <select
                required
                value={id}
                onChange={(event) => {
                  setId(event.target.value);
                  setError("");
                }}
              >
                <option value="">Välj ansökan</option>
                {applications.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.organization} · {a.role} ·{" "}
                    {APPLICATION_STATUSES[a.status]}
                  </option>
                ))}
              </select>
            </label>
            {selected && (
              <p>
                Nuvarande status:{" "}
                <strong>{APPLICATION_STATUSES[selected.status]}</strong>. Nästa
                steg: {selected.nextAction || "Saknas"}
                {selected.followUpDate ? ` · ${selected.followUpDate}` : ""}.
              </p>
            )}
            {selected &&
              ["rejected", "closed"].includes(selected.status) &&
              !closed && (
                <p>
                  Du håller på att återöppna en avslutad ansökan. Kontrollera
                  att beskedet är aktuellt.
                </p>
              )}
            <label>
              Ny status
              <select
                required
                value={status}
                onChange={(event) =>
                  setStatus(event.target.value as JobApplication["status"] | "")
                }
              >
                <option value="">Välj status</option>
                {Object.entries(APPLICATION_STATUSES).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            {closed ? (
              <p>
                Ansökan avslutas och det nuvarande nästa steget tas bort.
                Tidigare historik och kalenderbokningar bevaras.
              </p>
            ) : (
              <>
                <p className="help">
                  Nästa steg ersätter det nuvarande. Datumet är ett förslag för
                  uppföljning, inte en tolkad intervjutid. En intervju bokas
                  separat från ansökans kort.
                </p>
                <label>
                  Nästa steg
                  <input
                    maxLength={4000}
                    value={action}
                    onChange={(event) => setAction(event.target.value)}
                  />
                </label>
                <label>
                  Typ av nästa steg
                  <select
                    value={kind}
                    onChange={(event) =>
                      setKind(event.target.value as "task" | "waiting")
                    }
                  >
                    <option value="task">Att göra</option>
                    <option value="waiting">Väntar på arbetsgivaren</option>
                  </select>
                </label>
                <label>
                  Uppföljningsdatum
                  <input
                    type="date"
                    value={date}
                    onChange={(event) => setDate(event.target.value)}
                  />
                </label>
              </>
            )}
            {duplicate && (
              <p role="alert">Det här beskedet är redan sparat på ansökan.</p>
            )}
            {error && <p role="alert">{error}</p>}
            <button
              className="button primary"
              disabled={!selected || !status || !!duplicate}
            >
              Godkänn och uppdatera ansökan
            </button>
          </>
        )}
        {!applications.length && <p>Skapa eller importera en ansökan först.</p>}
      </form>
    </Modal>
  );
}
