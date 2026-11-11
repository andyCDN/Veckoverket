"use client";
import { useEffect, useRef, useState } from "react";
import type { JobApplication } from "@/lib/types";
import { CV_AGENT_URL, cvAgentPrompt } from "@/lib/cv-agent";
import { loadJobDetails } from "@/lib/linkedin-details-client";
import { linkedInJobUrl } from "@/lib/linkedin-import";
import { Modal } from "./modal";

export function CvAgent({
  application,
  onClose,
}: {
  application: JobApplication;
  onClose: () => void;
}) {
  const [text, setText] = useState(application.advertisement?.text ?? "");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const request = useRef<AbortController | null>(null);
  const source = linkedInJobUrl(application.advertisement?.url ?? "");
  const prompt = cvAgentPrompt(application, text);
  useEffect(() => () => request.current?.abort(), []);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(prompt);
      setMessage(
        "Underlaget är kopierat. Klistra in det i CV-processen och skicka för att skapa ditt nya CV.",
      );
    } catch {
      setMessage(
        "Kopieringen blockerades. Markera och kopiera underlaget nedan manuellt och klistra in det i CV-processen.",
      );
    }
  };
  return (
    <Modal
      title="Skapa CV för jobbet"
      description={`${application.role} · ${application.organization}`}
      onClose={onClose}
    >
      <div className="stack">
        <p>
          Granska annonsen, öppna sedan din CV-process i ett nytt fönster och
          klistra in underlaget. Där skapar du ett nytt CV med agentens hjälp.
        </p>
        <p className="help">
          Länken går till den befintliga konversationen i ditt CV-projekt.
          Veckoverket kan inte skicka meddelanden eller hämta det färdiga CV:t
          automatiskt.
        </p>
        <label>
          Annonstext för CV
          <textarea
            rows={7}
            maxLength={60000}
            value={text}
            onChange={(event) => {
              request.current?.abort();
              setLoading(false);
              setText(event.target.value);
              setMessage("");
            }}
          />
        </label>
        {!text.trim() && (
          <p>
            Annonsen saknar sparad text. Klistra in den här
            {source ? " eller läs den från LinkedIn-länken" : ""} innan du
            fortsätter.
          </p>
        )}
        {source && (
          <button
            type="button"
            className="button secondary"
            disabled={loading}
            onClick={async () => {
              if (
                text.trim() &&
                !window.confirm(
                  "Ersätta annonstexten här med text från länken?",
                )
              )
                return;
              request.current?.abort();
              const controller = new AbortController();
              request.current = controller;
              setLoading(true);
              setMessage("");
              try {
                const details = await loadJobDetails(source, controller.signal);
                if (controller.signal.aborted) return;
                if (!details.description?.trim())
                  throw new Error(
                    "Ingen annonstext kunde läsas. Klistra in annonsen manuellt.",
                  );
                setText(details.description.slice(0, 60000));
                setMessage(
                  "Annonsen är läst. Kontrollera att den gäller rätt tjänst innan du fortsätter.",
                );
              } catch (error) {
                if (!controller.signal.aborted)
                  setMessage(
                    error instanceof Error
                      ? error.message
                      : "Annonsen kunde inte läsas. Klistra in den manuellt.",
                  );
              } finally {
                if (!controller.signal.aborted) setLoading(false);
              }
            }}
          >
            {loading ? "Läser annonsen…" : "Läs annons från LinkedIn"}
          </button>
        )}
        {prompt && (
          <>
            <label>
              Underlag till CV-agenten
              <textarea
                rows={9}
                readOnly
                value={prompt}
                onFocus={(event) => event.target.select()}
              />
            </label>
            <div className="career-actions">
              <button
                type="button"
                className="button secondary"
                onClick={() => void copy()}
              >
                Kopiera CV-underlag
              </button>
              <a
                className="button primary"
                href={CV_AGENT_URL}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => void copy()}
              >
                Kopiera och öppna CV-processen ↗
              </a>
            </div>
            <p className="help">
              När CV:t är klart: spara dokumentlänken under Dokumentunderlag på
              ansökan. Annonsändringar här används bara för detta CV-underlag.
            </p>
          </>
        )}
        {message && <p role="status">{message}</p>}
      </div>
    </Modal>
  );
}
