import { createData } from "../../lib/defaults";
import type { JobApplication } from "../../lib/types";
export const jobDate = "2026-11-23";
export function jobWorkspaceFixture() {
  const data = createData();
  data.personalScheduleVersion = 2;
  data.settings = {
    ...data.settings,
    weekTemplate: "off",
    autoPlanning: false,
  };
  data.tasks = [];
  data.goals = [];
  data.habits = [];
  data.contacts = [];
  data.deadlines = [];
  data.careerActions = [];
  const job = (id: string, patch: Partial<JobApplication>): JobApplication => ({
    id,
    role: "Utredare",
    organization: "Kommunen",
    status: "draft",
    deadline: "2026-11-27",
    nextAction: "Förbered ansökan",
    nextActionId: `step-${id}`,
    nextActionKind: "task",
    followUpDate: "",
    notes: "Bevara anteckningen",
    ...patch,
  });
  data.applications = [
    job("draft", {
      advertisement: {
        url: "https://example.org/jobs/utredare",
        text: "Tjänst: Utredare\nArbetsgivare: Kommunen\nErfarenhet av analys behövs.",
      },
      history: [
        {
          id: "old-note",
          kind: "note",
          notes: "Tidigare notering",
          date: "2026-11-20",
          recordedAt: "2026-11-20T10:00:00Z",
        },
      ],
      materials: [
        {
          id: "letter",
          title: "Personligt brev",
          kind: "letter",
          url: "https://example.org/brev",
          version: "Version 1",
          sentOn: "",
        },
      ],
    }),
    job("waiting", {
      role: "Projektledare",
      organization: "Bolaget",
      status: "sent",
      nextAction: "Invänta återkoppling",
      nextActionKind: "waiting",
      followUpDate: "2026-11-26",
    }),
    job("due", {
      role: "Analytiker",
      organization: "Stadshuset",
      status: "sent",
      nextAction: "Följ upp besked",
      nextActionKind: "waiting",
      followUpDate: jobDate,
    }),
    job("closed", {
      role: "Strateg",
      organization: "Arkivbolaget",
      status: "rejected",
      nextAction: "",
      followUpDate: "",
    }),
  ];
  data.weeks = {
    [jobDate]: {
      week: jobDate,
      generatedAt: "",
      rules: structuredClone(data.settings),
      weeklyRoutinesFrom: jobDate,
      activities: [],
    },
  };
  return data;
}
