"use client";
import { useState } from "react";
import { Plus, ArrowUpRight, Trash2, Check, Target } from "lucide-react";
import { Modal } from "./modal";
import { hours, uid } from "@/lib/date";
import { categoryMinutes } from "@/lib/planner";
import { GOOGLE_CATEGORY_ID } from "@/lib/external-calendar";
import { categoryStyle } from "@/lib/presentation";
import type { AppData, Goal, Task } from "@/lib/types";
export function GoalForm({
  data,
  week,
  onSave,
  onClose,
}: {
  data: AppData;
  week: string;
  onSave: (g: Goal, tasks: Task[]) => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(""),
    [description, setDescription] = useState(""),
    [category, setCategory] = useState("career"),
    [horizon, setHorizon] = useState<"week" | "long">("week"),
    [taskText, setTaskText] = useState("");
  return (
    <Modal
      title="Nytt mål"
      description="Ange mål, livsområde och tillhörande uppgifter."
      onClose={onClose}
    >
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          const id = uid();
          onSave(
            {
              id,
              title: title.trim(),
              description,
              categoryId: category,
              horizon,
              week,
            },
            taskText
              .split("\n")
              .filter((t) => t.trim())
              .map((t) => ({
                id: uid(),
                title: t.trim(),
                goalId: id,
                done: false,
              })),
          );
        }}
      >
        <label>
          Mål
          <input
            required
            autoFocus
            maxLength={120}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Till exempel: färdigställa en låt"
          />
        </label>
        <div className="form-row">
          <label>
            Livsområde
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              {data.categories
                .filter((c) => c.id !== GOOGLE_CATEGORY_ID)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Perspektiv
            <select
              value={horizon}
              onChange={(e) => setHorizon(e.target.value as "week" | "long")}
            >
              <option value="week">Den här veckan</option>
              <option value="long">Långsiktigt</option>
            </select>
          </label>
        </div>
        <label>
          Beskrivning
          <textarea
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
        <label>
          Konkreta uppgifter
          <textarea
            rows={3}
            value={taskText}
            onChange={(e) => setTaskText(e.target.value)}
            placeholder="En uppgift per rad"
          />
        </label>
        <button className="button primary" type="submit">
          <Plus size={17} />
          Skapa mål
        </button>
      </form>
    </Modal>
  );
}
export function GoalsView({
  data,
  week,
  onToggle,
  onAddTask,
  onDelete,
  onNew,
}: {
  data: AppData;
  week: string;
  onToggle: (id: string) => void;
  onAddTask: (goalId: string, title: string) => void;
  onDelete: (id: string) => void;
  onNew: () => void;
}) {
  const goals = data.goals.filter(
    (g) => g.week === week || g.horizon === "long",
  );
  return (
    <section className="page-section">
      <div className="section-heading">
        <div>
          <h2>Veckomål och långsiktiga mål</h2>
          <p>Hantera mål och tillhörande uppgifter.</p>
        </div>
        <button className="button primary" onClick={onNew}>
          <Plus size={17} />
          Nytt mål
        </button>
      </div>
      {(["week", "long"] as const).map((horizon) => (
        <div key={horizon} className="goal-section">
          <h3>
            {horizon === "week" ? "Veckans mål" : "På längre sikt"}
            <span>{goals.filter((g) => g.horizon === horizon).length}</span>
          </h3>
          <div className="goal-grid">
            {goals
              .filter((g) => g.horizon === horizon)
              .map((g) => {
                const c = data.categories.find((c) => c.id === g.categoryId);
                const tasks = data.tasks.filter((t) => t.goalId === g.id),
                  done = tasks.filter((t) => t.done).length;
                const related = (data.weeks[week]?.activities ?? []).filter(
                  (a) => a.goalId === g.id,
                );
                const planned = categoryMinutes(related)[g.categoryId] ?? 0;
                const completed =
                  categoryMinutes(related, "done")[g.categoryId] ?? 0;
                return (
                  <article
                    className="goal-card"
                    key={g.id}
                    style={categoryStyle(c)}
                  >
                    <div className="goal-card-top">
                      <span className="category-label">
                        <i />
                        {c?.name}
                      </span>
                      <button
                        className="icon-button muted"
                        title="Ta bort mål"
                        aria-label={`Ta bort målet ${g.title}`}
                        onClick={() => onDelete(g.id)}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                    <h3>
                      {g.title}
                      <ArrowUpRight size={18} />
                    </h3>
                    <p>{g.description}</p>
                    <div className="task-list">
                      {tasks.map((t) => (
                        <label
                          className={`task ${t.done ? "complete" : ""}`}
                          key={t.id}
                        >
                          <input
                            type="checkbox"
                            checked={t.done}
                            onChange={() => onToggle(t.id)}
                          />
                          <span className="custom-check">
                            {t.done && <Check size={12} />}
                          </span>
                          <span>{t.title}</span>
                        </label>
                      ))}
                    </div>
                    <form
                      className="add-task"
                      onSubmit={(e) => {
                        e.preventDefault();
                        const input = e.currentTarget.elements.namedItem(
                          "task",
                        ) as HTMLInputElement;
                        if (input.value.trim()) {
                          onAddTask(g.id, input.value.trim());
                          input.value = "";
                        }
                      }}
                    >
                      <Plus size={15} />
                      <input
                        name="task"
                        aria-label={`Ny uppgift för ${g.title}`}
                        maxLength={150}
                        placeholder="Lägg till en uppgift"
                      />
                      <button type="submit" className="text-button">
                        Lägg till
                      </button>
                    </form>
                    <div className="goal-meta">
                      <span>
                        {done} av {tasks.length} uppgifter
                      </span>
                      <span>
                        {hours(completed)} genomförd · {hours(planned)} planerad
                      </span>
                    </div>
                  </article>
                );
              })}
          </div>
          {!goals.some((g) => g.horizon === horizon) && (
            <div className="empty-state">
              <Target size={28} />
              <p>
                {horizon === "week"
                  ? "Inga veckomål."
                  : "Inga långsiktiga mål."}
              </p>
              <button className="text-button" onClick={onNew}>
                Skapa ett mål <Plus size={14} />
              </button>
            </div>
          )}
        </div>
      ))}
    </section>
  );
}
