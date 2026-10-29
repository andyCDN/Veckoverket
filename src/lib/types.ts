export type Category = {
  id: string;
  name: string;
  color: string;
  targetMinutes: number;
  priority: number;
  minBlock: number;
  allowSplit: boolean;
  movable: boolean;
};
export type BlockType = "locked" | "protected" | "flexible";
export type GoogleEventSource = {
  provider: "google-calendar";
  calendarId: string;
  eventId: string;
  allDay: boolean;
  busy: boolean;
  originalStart: string;
  originalEnd: string;
  url?: string;
};
export type Activity = {
  id: string;
  title: string;
  description: string;
  categoryId: string;
  date: string;
  start: number;
  end: number;
  estimatedMinutes: number;
  blockType: BlockType;
  priority: number;
  status: "planned" | "done" | "skipped";
  goalId?: string;
  recurrenceId?: string;
  followUpOf?: { week: string; activityId: string };
  source: "generated" | "manual" | "recurring" | "external";
  external?: GoogleEventSource;
};
export type RecurringActivity = Omit<
  Activity,
  | "id"
  | "date"
  | "status"
  | "source"
  | "recurrenceId"
  | "followUpOf"
  | "external"
> & {
  id: string;
  weekdays: number[];
  startsOn: string;
};
export type Goal = {
  id: string;
  title: string;
  categoryId: string;
  horizon: "week" | "long";
  week: string;
  description: string;
};
export type Task = { id: string; title: string; goalId: string; done: boolean };
export type Reflection = {
  week: string;
  good: string;
  unfinished: string;
  balance: string;
  next: string;
  updatedAt: string;
};
export type Settings = {
  days: number[];
  start: number;
  end: number;
  lunchStart: number;
  lunchEnd: number;
  familyStart: number;
  familyEnd: number;
  musicMornings: number;
  trainingSessions: number;
  trainingMinutes: number;
  buffer: number;
  weekends: boolean;
  musicMovable: boolean;
  timezone: "Europe/Stockholm";
};
export type WeekPlan = {
  rules?: Settings;
  targets?: Record<string, number>;
  week: string;
  activities: Activity[];
  generatedAt: string;
};
export type AppData = {
  version: 1;
  profile: { name: string };
  categories: Category[];
  settings: Settings;
  weeks: Record<string, WeekPlan>;
  goals: Goal[];
  tasks: Task[];
  recurring: RecurringActivity[];
  reflections: Record<string, Reflection>;
  googleCalendar?: {
    calendarIds: string[];
    lastImportedWeek: string;
    lastImportedAt: string;
  };
};
export type Conflict = {
  id: string;
  message: string;
  suggestion: string;
  severity: "error" | "warning";
};
export type PlanResult = { plan: WeekPlan; conflicts: Conflict[] };
// Integrations submit proposals; only the deterministic engine can validate them.
export interface PlanningProposal {
  activities: Activity[];
  explanation: string;
}
export interface CalendarConnector {
  importEvents(from: string, to: string): Promise<Activity[]>;
}
export interface PlanningAssistant {
  propose(request: string, context: AppData): Promise<PlanningProposal>;
}
