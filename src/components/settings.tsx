"use client";
import { useRef, useState } from "react";
import {
  ArrowRight,
  Download,
  Upload,
  Plus,
  Check,
  SlidersHorizontal,
  LockKeyhole,
  Trash2,
} from "lucide-react";
import type { AppData, Category, Settings } from "@/lib/types";
import { DAY_NAMES, hours, parseTime, time, uid } from "@/lib/date";
import {
  capacity,
  categoryMinutes,
  generateWeek,
  targetMinutes,
} from "@/lib/planner";
import { decodeData, downloadData } from "@/lib/storage";
import { categoryInk, categoryStyle } from "@/lib/presentation";
import { Modal } from "./modal";
function CategoryForm({
  onSave,
  onClose,
}: {
  onSave: (c: Category) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(""),
    [color, setColor] = useState("#54796d");
  return (
    <Modal
      title="Nytt livsområde"
      description="Ange namn och färg för livsområdet."
      onClose={onClose}
    >
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          onSave({
            id: uid(),
            name: name.trim(),
            color,
            targetMinutes: 60,
            priority: 3,
            minBlock: 30,
            allowSplit: true,
            movable: true,
          });
        }}
      >
        <label>
          Namn
          <input
            required
            autoFocus
            value={name}
            maxLength={50}
            onChange={(e) => setName(e.target.value)}
            placeholder="Till exempel: språk eller ideellt arbete"
          />
        </label>
        <label>
          Färg
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
          />
        </label>
        <button className="button primary" type="submit">
          <Plus size={16} />
          Lägg till livsområde
        </button>
      </form>
    </Modal>
  );
}
export function SettingsView({
  data,
  week,
  onApply,
  onImport,
  onRemoveRecurring,
  onAccount,
  onReset,
}: {
  data: AppData;
  week: string;
  onApply: (settings: Settings, categories: Category[], name: string) => void;
  onImport: (data: AppData) => void;
  onRemoveRecurring: (id: string) => void;
  onAccount: () => void;
  onReset: () => void;
}) {
  const [s, setS] = useState(data.settings),
    [cats, setCats] = useState(data.categories),
    [name, setName] = useState(data.profile.name),
    [newCategory, setNewCategory] = useState(false),
    [error, setError] = useState("");
  const file = useRef<HTMLInputElement>(null);
  const patch = (v: Partial<Settings>) => setS((s) => ({ ...s, ...v }));
  const valid =
    s.start < s.end &&
    s.lunchStart < s.lunchEnd &&
    s.familyStart < s.familyEnd &&
    s.lunchEnd <= s.familyStart;
  const preview = valid
    ? generateWeek(
        week,
        { ...data, settings: s, categories: cats },
        data.weeks[week],
      )
    : null;
  const totals = categoryMinutes(preview?.plan.activities ?? []);
  function apply(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) {
      setError(
        "Kontrollera start- och sluttider. Lunch och familjetid får inte överlappa.",
      );
      return;
    }
    setError("");
    onApply(s, cats, name.trim() || "Du");
  }
  return (
    <section className="page-section">
      <div className="section-heading">
        <div>
          <span className="eyebrow">Planeringsregler</span>
          <h2>Tillgänglighet och tidsmål</h2>
          <p>Ange dagar, tider och regler för schemagenerering.</p>
        </div>
      </div>
      <form onSubmit={apply} className="settings-layout">
        <div className="settings-main">
          <section className="settings-section">
            <div className="settings-section-title">
              <span>01</span>
              <div>
                <h3>Tillgänglighet och fasta tider</h3>
                <p>Ange tillgängliga dagar och återkommande avbrott.</p>
              </div>
            </div>
            <label className="name-input">
              Ditt förnamn
              <input
                required
                maxLength={40}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <fieldset>
              <legend>Dagar att planera</legend>
              <div className="day-toggles">
                {DAY_NAMES.slice(0, 5).map((day, i) => (
                  <button
                    className={s.days.includes(i) ? "selected" : ""}
                    key={day}
                    type="button"
                    aria-pressed={s.days.includes(i)}
                    onClick={() =>
                      patch({
                        days: s.days.includes(i)
                          ? s.days.filter((d) => d !== i)
                          : [...s.days, i],
                      })
                    }
                  >
                    {day.slice(0, 3)}
                    {s.days.includes(i) && <Check size={12} />}
                  </button>
                ))}
              </div>
            </fieldset>
            <div className="form-row">
              <label>
                Dagen börjar
                <input
                  type="time"
                  required
                  value={time(s.start)}
                  onChange={(e) => patch({ start: parseTime(e.target.value) })}
                />
              </label>
              <label>
                Dagen slutar
                <input
                  type="time"
                  required
                  value={time(s.end)}
                  onChange={(e) => patch({ end: parseTime(e.target.value) })}
                />
              </label>
            </div>
            <div className="fixed-time-row">
              <span>
                <LockKeyhole size={16} />
                Lunch & paus
              </span>
              <label>
                <span className="sr-only">Lunch börjar</span>
                <input
                  type="time"
                  required
                  value={time(s.lunchStart)}
                  onChange={(e) =>
                    patch({ lunchStart: parseTime(e.target.value) })
                  }
                />
              </label>
              <span>–</span>
              <label>
                <span className="sr-only">Lunch slutar</span>
                <input
                  type="time"
                  required
                  value={time(s.lunchEnd)}
                  onChange={(e) =>
                    patch({ lunchEnd: parseTime(e.target.value) })
                  }
                />
              </label>
            </div>
            <div className="fixed-time-row">
              <span>
                <LockKeyhole size={16} />
                Familj & hushåll
              </span>
              <label>
                <span className="sr-only">Familjetid börjar</span>
                <input
                  type="time"
                  required
                  value={time(s.familyStart)}
                  onChange={(e) =>
                    patch({ familyStart: parseTime(e.target.value) })
                  }
                />
              </label>
              <span>–</span>
              <label>
                <span className="sr-only">Familjetid slutar</span>
                <input
                  type="time"
                  required
                  value={time(s.familyEnd)}
                  onChange={(e) =>
                    patch({ familyEnd: parseTime(e.target.value) })
                  }
                />
              </label>
            </div>
            <label className="switch-row">
              <span>
                Gör även helgen tillgänglig
                <small>Lördag och söndag använder samma tidsramar.</small>
              </span>
              <input
                type="checkbox"
                checked={s.weekends}
                onChange={(e) => patch({ weekends: e.target.checked })}
              />
            </label>
          </section>
          <section className="settings-section">
            <div className="settings-section-title">
              <span>02</span>
              <div>
                <h3>Musik och träning</h3>
                <p>Ange antal pass, passlängd och regler för flytt.</p>
              </div>
            </div>
            <div className="choice-row">
              <div>
                <strong>Musikförmiddagar</strong>
                <p>
                  Hela pass {time(s.start)}–{time(s.lunchStart)}. Delas aldrig
                  upp.
                </p>
              </div>
              <div
                className="segmented"
                role="group"
                aria-label="Antal musikförmiddagar"
              >
                {[1, 2].map((n) => (
                  <button
                    type="button"
                    aria-pressed={s.musicMornings === n}
                    className={s.musicMornings === n ? "active" : ""}
                    key={n}
                    onClick={() => patch({ musicMornings: n })}
                  >
                    {n} {n === 1 ? "förmiddag" : "förmiddagar"}
                  </button>
                ))}
              </div>
            </div>
            <div className="choice-row">
              <div>
                <strong>Träningspass</strong>
                <p>Placeras i första hand efter lunch.</p>
              </div>
              <div
                className="segmented"
                role="group"
                aria-label="Antal träningspass"
              >
                {[2, 3].map((n) => (
                  <button
                    type="button"
                    aria-pressed={s.trainingSessions === n}
                    className={s.trainingSessions === n ? "active" : ""}
                    key={n}
                    onClick={() => patch({ trainingSessions: n })}
                  >
                    {n} pass
                  </button>
                ))}
              </div>
            </div>
            <div className="form-row">
              <label>
                Träningspassets längd
                <select
                  value={s.trainingMinutes}
                  onChange={(e) =>
                    patch({ trainingMinutes: Number(e.target.value) })
                  }
                >
                  <option value={60}>60 minuter</option>
                  <option value={75}>75 minuter</option>
                  <option value={90}>90 minuter</option>
                </select>
              </label>
              <label>
                Buffert mellan aktiviteter
                <select
                  value={s.buffer}
                  onChange={(e) => patch({ buffer: Number(e.target.value) })}
                >
                  <option value={0}>Ingen extra buffert</option>
                  <option value={5}>5 minuter</option>
                  <option value={10}>10 minuter</option>
                  <option value={15}>15 minuter</option>
                </select>
              </label>
            </div>
            <label className="switch-row">
              <span>
                Tillåt flytt av musikförmiddagar
                <small>Flyttas alltid som ett helt förmiddagsblock.</small>
              </span>
              <input
                type="checkbox"
                checked={s.musicMovable}
                onChange={(e) => {
                  patch({ musicMovable: e.target.checked });
                  setCats((cs) =>
                    cs.map((c) =>
                      c.id === "music"
                        ? { ...c, movable: e.target.checked }
                        : c,
                    ),
                  );
                }}
              />
            </label>
          </section>
          <section className="settings-section">
            <div className="settings-section-title">
              <span>03</span>
              <div>
                <h3>Dina livsområden</h3>
                <p>
                  Prioritet 5 kommer först. Jobbtid är en miniminivå; ledig tid
                  tilldelas också jobbet.
                </p>
              </div>
            </div>
            <div className="category-settings">
              {cats
                .filter((c) => !["music", "family", "health"].includes(c.id))
                .map((c) => (
                  <div className="category-setting" key={c.id}>
                    <span className="category-label" style={categoryStyle(c)}>
                      <i />
                      {c.name}
                    </span>
                    <div className="category-fields">
                      <label>
                        Timmar / vecka
                        <input
                          type="number"
                          min={0}
                          max={100}
                          step={0.5}
                          value={c.targetMinutes / 60}
                          onChange={(e) =>
                            setCats((cs) =>
                              cs.map((x) =>
                                x.id === c.id
                                  ? {
                                      ...x,
                                      targetMinutes:
                                        Number(e.target.value) * 60,
                                    }
                                  : x,
                              ),
                            )
                          }
                        />
                      </label>
                      <label>
                        Prioritet
                        <select
                          value={c.priority}
                          onChange={(e) =>
                            setCats((cs) =>
                              cs.map((x) =>
                                x.id === c.id
                                  ? { ...x, priority: Number(e.target.value) }
                                  : x,
                              ),
                            )
                          }
                        >
                          {[5, 4, 3, 2, 1].map((n) => (
                            <option key={n}>{n}</option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Minsta pass
                        <select
                          value={c.minBlock}
                          onChange={(e) =>
                            setCats((cs) =>
                              cs.map((x) =>
                                x.id === c.id
                                  ? { ...x, minBlock: Number(e.target.value) }
                                  : x,
                              ),
                            )
                          }
                        >
                          {[15, 30, 45, 60, 90, 120, 210].map((n) => (
                            <option key={n} value={n}>
                              {n} min
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <div className="category-checks">
                      <label>
                        <input
                          type="checkbox"
                          checked={c.allowSplit}
                          onChange={(e) =>
                            setCats((cs) =>
                              cs.map((x) =>
                                x.id === c.id
                                  ? { ...x, allowSplit: e.target.checked }
                                  : x,
                              ),
                            )
                          }
                        />
                        Får delas upp
                      </label>
                      <label>
                        <input
                          type="checkbox"
                          checked={c.movable}
                          onChange={(e) =>
                            setCats((cs) =>
                              cs.map((x) =>
                                x.id === c.id
                                  ? { ...x, movable: e.target.checked }
                                  : x,
                              ),
                            )
                          }
                        />
                        Får flyttas
                      </label>
                    </div>
                  </div>
                ))}
            </div>
            <button
              className="text-button"
              type="button"
              onClick={() => setNewCategory(true)}
            >
              <Plus size={16} />
              Lägg till eget livsområde
            </button>
          </section>
          {data.recurring.length > 0 && (
            <section className="settings-section">
              <h3>Återkommande aktiviteter</h3>
              <p>
                Ändra tid i kalendern och spara serien. Borttagning av en regel
                lämnar redan planerade tillfällen kvar.
              </p>
              {data.recurring.map((r) => (
                <div className="recurrence-row" key={r.id}>
                  <span>
                    <strong>{r.title}</strong>
                    <small>
                      {r.weekdays
                        .map((d) => DAY_NAMES[d].slice(0, 3))
                        .join(", ")}{" "}
                      · {time(r.start)}–{time(r.end)}
                    </small>
                  </span>
                  <button
                    type="button"
                    className="icon-button danger"
                    aria-label={`Ta bort regeln ${r.title}`}
                    onClick={() => onRemoveRecurring(r.id)}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </section>
          )}
          {error && (
            <p role="alert" className="inline-error">
              {error}
            </p>
          )}
          <button className="button primary" type="submit">
            <Check size={17} />
            Spara och planera veckan
            <ArrowRight size={16} />
          </button>
          <p className="help">
            Dina egna aktiviteter och tidigare veckor bevaras. Alla ändrade
            ramar kontrolleras igen.
          </p>
        </div>
        <aside className="settings-preview">
          <SlidersHorizontal size={22} />
          <h3>Kapacitetsberäkning</h3>
          <p>Förhandsvisningen uppdateras när du ändrar dina val.</p>
          <div className="capacity-number">
            {hours(capacity(s))}
            <small>för dina valda aktiviteter</small>
          </div>
          {cats
            .filter((c) => !["family", "rest"].includes(c.id))
            .map((c) => (
              <div className="preview-row" key={c.id}>
                <span>
                  <i style={{ background: categoryInk(c) }} />
                  {c.name}
                </span>
                <strong>
                  {hours(totals[c.id] ?? 0)}
                  <small>av {hours(targetMinutes(c, s))}</small>
                </strong>
              </div>
            ))}
          {!valid ? (
            <p className="inline-error">Kontrollera dina tider.</p>
          ) : preview?.conflicts.length ? (
            <div className="preview-warning">
              <strong>Otillräcklig kapacitet</strong>
              {preview.conflicts.slice(0, 4).map((c) => (
                <p key={c.id}>{c.message}</p>
              ))}
              <small>Frigör tid, justera ett mål eller tillåt helger.</small>
            </div>
          ) : (
            <div className="preview-success">
              <Check size={16} />
              Inga konflikter i förslaget.
            </div>
          )}
          <div className="preview-note">
            Lunch och familjetid är reserverade enligt inställningarna.
          </div>
        </aside>
      </form>
      <section className="data-section" id="storage-settings" tabIndex={-1}>
        <div>
          <h3>Lagring och säkerhetskopiering</h3>
          <p>
            Demoläget sparar på den här enheten. Exportera en säkerhetskopia
            eller använd ett konto för molnlagring.
          </p>
        </div>
        <div className="data-actions">
          <button
            className="button secondary"
            onClick={() => downloadData(data)}
          >
            <Download size={16} />
            Exportera
          </button>
          <button
            className="button secondary"
            onClick={() => file.current?.click()}
          >
            <Upload size={16} />
            Importera
          </button>
          <button className="button secondary" onClick={onAccount}>
            Konto & molnlagring
          </button>
          <button className="text-button danger" onClick={onReset}>
            Återställ demo
          </button>
        </div>
        <input
          type="file"
          accept="application/json,.json"
          ref={file}
          hidden
          aria-label="Importera säkerhetskopia"
          onChange={async (e) => {
            const selected = e.target.files?.[0];
            if (!selected) return;
            try {
              const imported = decodeData(await selected.text());
              if (
                window.confirm(
                  "Ersätt den lokala planen med säkerhetskopian? Exportera din nuvarande plan först om du vill behålla den.",
                )
              )
                onImport(imported);
            } catch (err) {
              setError(
                err instanceof Error ? err.message : "Filen kunde inte läsas.",
              );
            }
            e.target.value = "";
          }}
        />
      </section>
      {newCategory && (
        <CategoryForm
          onClose={() => setNewCategory(false)}
          onSave={(c) => {
            setCats((cs) => [...cs, c]);
            setNewCategory(false);
          }}
        />
      )}
    </section>
  );
}
