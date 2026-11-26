"use client";
import { useEffect, useRef, useState } from "react";
import type { JobApplication } from "@/lib/types";
import { applicationStage } from "@/lib/application-flow";
import { documentUrl } from "@/lib/application-materials";
import { CV_AGENT_URL, cvAgentPrompt } from "@/lib/cv-agent";
import { applicationAdvertisementUrls } from "@/lib/job-identity";
import { today } from "@/lib/date";

export function ApplicationWork({
  application,
  onUpdate,
  onSent,
  onMaterials,
  onSession,
  onFollowUp,
  onNextStep,
  nextStep,
}: {
  application: JobApplication;
  onUpdate: (
    action: "cv-ready" | "application-opened",
    cvUrl?: string,
  ) => string | undefined;
  onSent: () => void;
  onMaterials: () => void;
  onSession: () => void;
  onFollowUp: () => void;
  onNextStep: () => void;
  nextStep?: {
    title: string;
    date: string;
    owner: string;
    kind?: "task" | "waiting";
  };
}) {
  const stage = applicationStage(application);
  const task =
    stage === "waiting" && nextStep && nextStep.kind !== "waiting"
      ? nextStep
      : undefined;
  const root = useRef<HTMLElement>(null),
    external = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const restore = () =>
      requestAnimationFrame(() => {
        const target = external.current;
        if (!target) return;
        if (
          document.activeElement === document.body ||
          document.activeElement?.matches('a[href="#main-content"]')
        ) {
          const next = target.isConnected
            ? target
            : root.current?.querySelector<HTMLElement>(
                ".application-work-focus .button.primary",
              );
          next?.focus({ preventScroll: true });
        }
        external.current = null;
      });
    window.addEventListener("focus", restore);
    return () => window.removeEventListener("focus", restore);
  }, []);
  const [cvUrl, setCvUrl] = useState(
    application.materials?.find((material) => material.kind === "cv")?.url ??
      "",
  );
  const [message, setMessage] = useState(""),
    [error, setError] = useState("");
  useEffect(() => {
    setMessage("");
    setError("");
  }, [stage]);
  const prompt = cvAgentPrompt(
    application,
    application.advertisement?.text ?? "",
  );
  const applicationUrl = documentUrl(
    application.advertisement?.applicationUrl ||
      application.advertisement?.url ||
      "",
  );
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(prompt);
      setMessage(
        "Underlaget är kopierat. Klistra in det i CV-agenten. Jobbet ligger kvar här när du återvänder.",
      );
    } catch {
      setMessage(
        "Kopiera texten under Visa CV-underlag och klistra in den i CV-agenten. Jobbet ligger kvar här.",
      );
    }
  };
  const index =
    stage === "advertisement"
      ? 0
      : stage === "cv"
        ? 1
        : stage === "apply" || stage === "send"
          ? 2
          : 3;
  return (
    <section
      ref={root}
      className="application-work stack"
      aria-label="Ansökans arbetsläge"
    >
      <ol className="application-progress" aria-label="Steg i ansökan">
        {["Annons", "CV", "Ansökan", "Uppföljning"].map((title, i) => (
          <li
            key={title}
            aria-current={index === i ? "step" : undefined}
            className={i < index ? "is-complete" : ""}
          >
            {i + 1}. {title}
          </li>
        ))}
      </ol>
      <div className="application-work-focus stack">
        <h3>
          {stage === "advertisement"
            ? "Börja med annonsunderlaget"
            : stage === "cv"
              ? "Anpassa ditt CV till jobbet"
              : stage === "apply"
                ? "Dags att skicka ansökan"
                : stage === "waiting"
                  ? task
                    ? "Nästa steg för ansökan"
                    : "Ansökan är skickad"
                  : "Bekräfta när ansökan är skickad"}
        </h3>
        {stage === "waiting" ? (
          <>
            <p>
              {task
                ? task.title
                : application.followUpDate
                  ? `Väntar på svar från ${application.organization}. Följ upp ${application.followUpDate}.`
                  : `Väntar på svar från ${application.organization}. Inget bevakningsdatum är valt.`}
            </p>
            {task && (
              <p>
                {task.owner || "Jag"} · {task.date || "Utan datum"}
              </p>
            )}
            {(task ||
              (application.followUpDate &&
                application.followUpDate <= today())) && (
              <button className="button primary" onClick={onNextStep}>
                {task ? "Öppna nästa steg" : "Öppna uppföljningen"}
              </button>
            )}
            <button className="button secondary" onClick={onFollowUp}>
              Ändra uppföljning
            </button>
          </>
        ) : stage === "advertisement" ? (
          <>
            <p>
              Lägg till hela annonstexten så att krav och CV-underlag finns
              samlade här.
            </p>
            <button className="button primary" onClick={onMaterials}>
              Komplettera annonsen
            </button>
          </>
        ) : stage === "cv" ? (
          <>
            <p>
              Underlaget kopieras när du öppnar CV-agenten. Klistra in det där.
              När CV:t är klart fortsätter du här.
            </p>
            <a
              className="button primary"
              href={CV_AGENT_URL}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(event) => {
                external.current = event.currentTarget;
                void copy();
              }}
            >
              Anpassa CV ↗
            </a>
            <details>
              <summary>Visa CV-underlag</summary>
              <label>
                Underlag till CV-agenten
                <textarea
                  rows={7}
                  readOnly
                  value={prompt}
                  onFocus={(event) => event.target.select()}
                />
              </label>
              <button className="text-button" onClick={() => void copy()}>
                Kopiera CV-underlag
              </button>
            </details>
            <label>
              CV-länk (valfritt)
              <input
                type="url"
                maxLength={2048}
                value={cvUrl}
                onChange={(event) => setCvUrl(event.target.value)}
                placeholder="Länk till ditt färdiga CV"
              />
            </label>
            <button
              className="button secondary"
              onClick={() => setError(onUpdate("cv-ready", cvUrl.trim()) ?? "")}
            >
              CV klart – gå vidare
            </button>
          </>
        ) : (
          <>
            <p>
              {stage === "apply"
                ? "Öppna arbetsgivarens sida och använd ditt anpassade CV. Fortsätt här när du har skickat ansökan."
                : "Ansökningssidan har öppnats. Bekräfta nedan när du faktiskt har skickat ansökan."}
            </p>
            {stage === "send" && (
              <button className="button primary" onClick={onSent}>
                Markera skickad
              </button>
            )}
            {applicationUrl ? (
              <a
                className={
                  stage === "apply" ? "button primary" : "button secondary"
                }
                href={applicationUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(event) => {
                  external.current = event.currentTarget;
                  const issue = onUpdate("application-opened");
                  if (issue) {
                    event.preventDefault();
                    setError(issue);
                  }
                }}
              >
                {stage === "apply"
                  ? "Öppna ansökningssidan ↗"
                  : "Öppna ansökningssidan igen ↗"}
              </a>
            ) : (
              <button className="button primary" onClick={onMaterials}>
                Lägg till ansökningslänk
              </button>
            )}
            <a
              className="text-button"
              href={CV_AGENT_URL}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => void copy()}
            >
              Öppna CV-agenten igen ↗
            </a>
          </>
        )}
        {message && <p role="status">{message}</p>}
        {error && <p role="alert">{error}</p>}
      </div>
      <div className="career-actions">
        {stage !== "waiting" && (
          <button className="button secondary" onClick={onSession}>
            Välj befintligt jobbsökarpass
          </button>
        )}
        <button className="text-button" onClick={onMaterials}>
          Dokumentunderlag
        </button>
        {stage !== "send" && stage !== "waiting" && (
          <button className="text-button" onClick={onSent}>
            Markera skickad
          </button>
        )}
      </div>
      <section
        className="job-material-summary stack"
        aria-label="Annons och dokument"
      >
        <h3>Underlag för den här ansökan</h3>
        {applicationAdvertisementUrls(application).map((url, i) => (
          <a key={url} href={url} target="_blank" rel="noopener noreferrer">
            {i === 0 ? "Öppna annons" : `Ytterligare annonskälla ${i + 1}`}
          </a>
        ))}
        {application.advertisement?.text && (
          <details>
            <summary>Läs annonsen</summary>
            <p className="career-notes">{application.advertisement.text}</p>
          </details>
        )}
        {application.materials?.map((material) => (
          <a
            key={material.id}
            href={documentUrl(material.url)}
            target="_blank"
            rel="noopener noreferrer"
          >
            {material.title} · {material.version || "Ingen version"}
          </a>
        ))}
      </section>
    </section>
  );
}
