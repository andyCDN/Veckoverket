import { createData } from "../../lib/defaults";
import { generateWeek } from "../../lib/planner";
import { templateSettings } from "../../lib/week-template";
import { GOOGLE_CATEGORY } from "../../lib/external-calendar";
import type { Activity } from "../../lib/types";

export const overfilledWeek = "2026-11-23";
export function learningActivity(patch: Partial<Activity> = {}): Activity {
  return {
    id: "old-learning",
    title: "Kompetensutveckling",
    description: "Äldre planering",
    categoryId: "learning",
    date: overfilledWeek,
    start: 600,
    end: 720,
    estimatedMinutes: 120,
    blockType: "flexible",
    source: "manual",
    status: "planned",
    priority: 3,
    ...patch,
  };
}
export function overfilledWorkspace() {
  const data = createData();
  data.settings = {
    ...templateSettings(data.settings),
    keepTemplateSlots: true,
  };
  data.personalScheduleVersion = 1;
  data.categories.push({ ...GOOGLE_CATEGORY });
  data.weeks[overfilledWeek] = generateWeek(overfilledWeek, data).plan;
  const recurring = learningActivity({
    id: "old-learning-series",
    start: 540,
    end: 660,
    source: "recurring",
    recurrenceId: "learning-series",
  });
  data.recurring = [
    {
      ...recurring,
      id: "learning-series",
      startsOn: "2026-01-05",
      weekdays: [0, 1, 2, 3, 4],
    },
  ];
  const imported = learningActivity({
    id: "google-learning",
    categoryId: GOOGLE_CATEGORY.id,
    source: "external",
    blockType: "locked",
    start: 840,
    end: 960,
    external: {
      provider: "google-calendar",
      calendarId: "test-calendar",
      eventId: "old-course",
      allDay: false,
      busy: true,
      originalStart: "2026-11-23T14:00:00+01:00",
      originalEnd: "2026-11-23T16:00:00+01:00",
    },
  });
  data.weeks[overfilledWeek].activities.push(
    recurring,
    learningActivity({ id: "manual-extra", start: 840, end: 960 }),
    imported,
    learningActivity({
      id: "linked-course",
      title: "Färdigställ kursmoment",
      start: 960,
      end: 1020,
      taskId: "course-task",
    }),
  );
  data.goals.push({
    id: "course-goal",
    title: "Lärande",
    description: "Eget mål",
    categoryId: "learning",
    week: overfilledWeek,
    horizon: "week",
  });
  data.tasks.push({
    id: "course-task",
    title: "Färdigställ kursmoment",
    goalId: "course-goal",
    done: false,
    needsPlanning: false,
    estimatedMinutes: 60,
  });
  return data;
}
