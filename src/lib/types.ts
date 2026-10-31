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
export type CalendarCategoryRule = {
  id: string;
  contains: string;
  categoryId: string;
  enabled: boolean;
  calendarId?: string;
};
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
  applicationId?: string;
  contactId?: string;
  careerActionId?: string;
  deadlineId?: string;
  deadlineStepId?: string;
  recurrenceId?: string;
  followUpOf?: { week: string; activityId: string };
  source: "generated" | "manual" | "recurring" | "external";
  external?: GoogleEventSource;
  routine?: "week-start" | "week-review";
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
  | "routine"
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
  startPlan?: string;
  goalReview?: string;
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
  autoPlanning?: boolean;
};
export type WeekPlan = {
  rules?: Settings;
  targets?: Record<string, number>;
  week: string;
  activities: Activity[];
  generatedAt: string;
  weeklyRoutinesFrom?: string;
};
export type ApplicationStatus =
  "draft" | "sent" | "interview" | "offer" | "rejected" | "closed";
export type ApplicationHistoryEntry = {
  id: string;
  date: string;
  recordedAt: string;
  kind:
    | "created"
    | "status"
    | "action"
    | "contact"
    | "interview"
    | "feedback"
    | "note";
  notes: string;
  status?: ApplicationStatus;
  contactId?: string;
};
export type ApplicationMaterial = {
  id: string;
  title: string;
  kind: "cv" | "letter" | "other";
  url: string;
  version: string;
  sentOn: string;
};
export type ApplicationInterview = {
  id: string;
  title: string;
  date: string;
  start: number;
  end: number;
  location: string;
  contactId?: string;
  meetingActivityId: string;
  preparationActivityId?: string;
  preparationNotes: string;
  outcomeNotes: string;
  feedbackNotes?: string;
  preparationChecklist?: { id: string; title: string; done: boolean }[];
  completedAt?: string;
};
export type JobApplication = {
  id: string;
  organization: string;
  contactIds?: string[];
  history?: ApplicationHistoryEntry[];
  advertisement?: { url: string; text: string };
  materials?: ApplicationMaterial[];
  interviews?: ApplicationInterview[];
  role: string;
  status: ApplicationStatus;
  deadline: string;
  nextAction: string;
  nextActionReason?: string;
  nextActionOwner?: string;
  nextActionId?: string;
  nextActionKind?: "task" | "waiting";
  followUpDate: string;
  notes: string;
};
export type NetworkContact = {
  id: string;
  name: string;
  organization: string;
  nextAction: string;
  nextActionReason?: string;
  nextActionOwner?: string;
  nextActionId?: string;
  nextActionKind?: "task" | "waiting";
  followUpDate: string;
  entries: { id: string; date: string; channel: string; notes: string }[];
};
export type CareerAction = {
  id: string;
  title: string;
  date: string;
  owner: string;
  reason: string;
  status: "open" | "done";
  kind?: "task" | "waiting";
  updates?: {
    id: string;
    date: string;
    kind: "fulfilled" | "changed" | "open";
    note: string;
    recordingId?: string;
    previous?: { title: string; date: string; owner: string; reason: string };
  }[];
  applicationId?: string;
  contactId?: string;
  interviewId?: string;
  source?: {
    recordingId: string;
    segmentIndexes: number[];
    evidence: string;
  };
};
export type Deadline = {
  id: string;
  title: string;
  date: string;
  minute: number;
  categoryId: string;
  applicationId?: string;
  steps: { id: string; title: string; minutes: number }[];
};
export type AppData = {
  version: 1;
  applications?: JobApplication[];
  contacts?: NetworkContact[];
  careerActions?: CareerAction[];
  deadlines?: Deadline[];
  profile: { name: string };
  categories: Category[];
  settings: Settings;
  weeks: Record<string, WeekPlan>;
  goals: Goal[];
  tasks: Task[];
  recurring: RecurringActivity[];
  reflections: Record<string, Reflection>;
  calendarCategoryRules?: CalendarCategoryRule[];
  // No private URL is stored in the workspace, browser cache, or backups.
  icalCalendar?: { calendarId: string; autoRefresh: boolean };
  googleCalendar?: {
    calendarIds: string[];
    lastImportedWeek: string;
    lastImportedAt: string;
    eventCategories?: Record<string, string>;
    eventCategorySources?: Record<string, "manual" | "rule">;
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
