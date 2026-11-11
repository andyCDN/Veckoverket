"use client";
import { useState } from "react";
import type { AppData, DailyCheckIn, DailyFocus } from "@/lib/types";
import { dailyChoices } from "@/lib/daily-start";
import {
  dailyPriorityOptions,
  dailyFocusStep,
  NO_DAILY_FOCUS,
} from "@/lib/daily-check-in";
import { planningBoundary } from "@/lib/date";
import { Modal } from "./modal";

type Priority = { id: string; label: string; hint: string };
function PriorityPicker({
  label,
  options,
  selected,
  onChange,
  empty,
}: {
  label: string;
  options: Priority[];
  selected: Priority[];
  onChange: (ids: string[]) => void;
  empty: string;
}) {
  return (
    <fieldset className="daily-priority-picker">
      <legend>{label}</legend>
      <select
        aria-label={label}
        value=""
        disabled={!options.length}
        onChange={(event) => {
          if (event.target.value)
            onChange([...selected.map((item) => item.id), event.target.value]);
        }}
      >
        <option value="">
          {selected.length
            ? "Lägg till fler om det behövs"
            : "Välj från registret – eller avstå idag"}
        </option>
        {options
          .filter((option) => !selected.some((item) => item.id === option.id))
          .map((option) => (
            <option key={option.id} value={option.id}>
              {option.label} · {option.hint}
            </option>
          ))}
      </select>
      {!!selected.length && (
        <ul className="daily-priority-picks">
          {selected.map((item) => (
            <li key={item.id}>
              <span>
                {item.label}
                <small>{item.hint}</small>
              </span>
              <button
                type="button"
                className="text-button"
                aria-label={`Ta bort ${item.label} från dagens val`}
                onClick={() =>
                  onChange(
                    selected.filter((v) => v.id !== item.id).map((v) => v.id),
                  )
                }
              >
                Ta bort
              </button>
            </li>
          ))}
        </ul>
      )}
      {!options.length && <p className="help">{empty}</p>}
    </fieldset>
  );
}

export function DailyCheckInModal({
  data,
  date,
  onSave,
  onRemove,
  onClose,
}: {
  data: AppData;
  date: string;
  onSave: (value: DailyCheckIn, start: boolean) => string | undefined;
  onRemove: () => void;
  onClose: () => void;
}) {
  const [boundary] = useState(planningBoundary);
  const saved = data.dailyCheckIns?.[date];
  const [applicationIds, setApplications] = useState(
    saved?.applicationIds ?? [],
  );
  const [contactIds, setContacts] = useState(saved?.contactIds ?? []);
  const [focusKey, setFocusKey] = useState(
    saved ? `${saved.focus.kind}:${saved.focus.id}` : "",
  );
  const [error, setError] = useState("");
  const options = dailyPriorityOptions(data, date);
  const jobs: Priority[] = options.applications.map((a) => ({
    id: a.id,
    label: `${a.role} · ${a.organization}`,
    hint:
      a.deadline === date
        ? "Sista dag idag"
        : a.deadline
          ? `Sista dag ${a.deadline}`
          : "Utan sista ansökningsdag",
  }));
  const people: Priority[] = options.contacts.map(({ contact: c, step }) => ({
    id: c.id,
    label: c.name + (c.organization ? ` · ${c.organization}` : ""),
    hint:
      step?.kind === "waiting" && step.date > date
        ? `Väntar på svar till ${step.date}`
        : step?.date && step.date <= date
          ? `Följ upp ${step.date}`
          : step?.title || "Ingen uppföljning planerad",
  }));
  const selectedJobs = applicationIds.map(
    (id) =>
      jobs.find((a) => a.id === id) ?? {
        id,
        label:
          data.applications?.find((a) => a.id === id)?.role ?? "Borttaget jobb",
        hint: "Inte längre sökbart – ta bort från dagens val",
      },
  );
  const selectedPeople = contactIds.map(
    (id) =>
      people.find((c) => c.id === id) ?? {
        id,
        label: "Borttagen kontakt",
        hint: "Ta bort från dagens val",
      },
  );
  const focuses = new Map<string, DailyFocus>();
  for (const a of options.applications.filter((a) =>
    applicationIds.includes(a.id),
  ))
    focuses.set(`application:${a.id}`, {
      kind: "application",
      id: a.id,
      title: `${a.role} · ${a.organization}`,
    });
  for (const { contact: c } of options.contacts.filter(({ contact }) =>
    contactIds.includes(contact.id),
  ))
    focuses.set(`contact:${c.id}`, {
      kind: "contact",
      id: c.id,
      title: c.name + (c.organization ? ` · ${c.organization}` : ""),
      ...(c.entries.at(-1)?.id ? { contactEntryId: c.entries.at(-1)!.id } : {}),
    });
  const selectedFocuses = [...focuses.entries()];
  for (const choice of dailyChoices(data, boundary)) {
    const taskId = choice.task?.id ?? choice.activity?.taskId;
    const focus: DailyFocus = taskId
      ? { kind: "task", id: taskId, title: choice.title }
      : { kind: "activity", id: choice.activity!.id, title: choice.title };
    focuses.set(`${focus.kind}:${focus.id}`, focus);
  }
  focuses.set("none:none", NO_DAILY_FOCUS);
  const effectiveKey = focusKey
    ? focuses.has(focusKey)
      ? focusKey
      : ""
    : (selectedFocuses[0]?.[0] ?? "none:none");
  const focus = focuses.get(effectiveKey);
  const draft = focus
    ? { applicationIds, contactIds, focus, updatedAt: new Date().toISOString() }
    : undefined;
  return (
    <Modal
      title="Dagens riktning"
      description="Välj det som är viktigt idag. Börja med en sak."
      onClose={onClose}
    >
      <form
        className="stack daily-check-in"
        onSubmit={(event) => {
          event.preventDefault();
          const start =
            (event.nativeEvent as SubmitEvent).submitter?.getAttribute(
              "value",
            ) === "start";
          if (draft) setError(onSave(draft, start) ?? "");
        }}
      >
        <PriorityPicker
          label="1. Vilka jobb vill du söka idag?"
          options={jobs}
          selected={selectedJobs}
          onChange={setApplications}
          empty="Inga aktuella utkast. Lägg till jobb under Jobb, eller välj kontakter och andra uppgifter idag."
        />
        <PriorityPicker
          label="2. Vilka personer vill du kontakta?"
          options={people}
          selected={selectedPeople}
          onChange={setContacts}
          empty="Inga kontakter i registret ännu. Lägg till dem under Nätverk när det passar."
        />
        <label>
          3. Vad börjar du med?
          <select
            required
            value={effectiveKey}
            onChange={(event) => setFocusKey(event.target.value)}
          >
            <option value="">Välj ditt första steg</option>
            {selectedFocuses.length > 0 && (
              <optgroup label="Dagens jobb och kontakter">
                {selectedFocuses.map(([key, value]) => (
                  <option key={key} value={key}>
                    {value.title}
                  </option>
                ))}
              </optgroup>
            )}
            <optgroup label="Annan uppgift eller befintligt pass">
              {[...focuses.entries()]
                .filter(
                  ([, value]) =>
                    !["application", "contact"].includes(value.kind),
                )
                .map(([key, value]) => (
                  <option key={key} value={key}>
                    {value.title}
                  </option>
                ))}
            </optgroup>
          </select>
        </label>
        {focus && focus.kind !== "none" && (
          <div className="check-in-plan">
            <strong>En liten start</strong>
            <p>{dailyFocusStep(focus, data)}</p>
            <small>
              Gör bara första delen. Du behöver inte slutföra allt nu.
            </small>
          </div>
        )}
        <div className="career-actions">
          {focus && focus.kind !== "none" && (
            <button type="submit" value="start" className="button primary">
              Spara och börja här
            </button>
          )}
          <button
            type="submit"
            value="save"
            className={
              focus?.kind === "none" ? "button primary" : "button secondary"
            }
            disabled={!draft}
          >
            Spara dagens val
          </button>
        </div>
        {error && <p role="alert">{error}</p>}
        <p className="help">
          Ingen fritext. Välj få saker som betyder något. Planen skickar inget
          och bokar ingen tid automatiskt.
        </p>
        {saved && (
          <button type="button" className="text-button" onClick={onRemove}>
            Radera dagens val
          </button>
        )}
        <details className="check-in-evidence">
          <summary>Forskningsgrunden</summary>
          <p>
            Ett tydligt delmål och en konkret startsignal kan hjälpa oss att gå
            från avsikt till handling. Här är signalen att öppna det valda
            underlaget och göra ett litet, relevant steg.
          </p>
          <ul>
            <li>
              <a
                href="https://doi.org/10.1146/annurev-psych-021524-110536"
                target="_blank"
                rel="noopener noreferrer"
              >
                Handlingsplaner: forskningsöversikt, 2025
              </a>
            </li>
            <li>
              <a
                href="https://doi.org/10.1037/apl0001040"
                target="_blank"
                rel="noopener noreferrer"
              >
                Konkreta delmål: fältexperiment, 2023
              </a>
            </li>
            <li>
              <a
                href="https://doi.org/10.1037/a0035923"
                target="_blank"
                rel="noopener noreferrer"
              >
                Målsättning och jobbsökande: metaanalys, 2014
              </a>
            </li>
          </ul>
          <p>
            Detta är en praktisk tillämpning. Just de här frågorna har inte
            utvärderats vetenskapligt.
          </p>
        </details>
      </form>
    </Modal>
  );
}
