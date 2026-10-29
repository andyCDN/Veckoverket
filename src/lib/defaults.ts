import type { AppData, Settings, Category } from "./types";
import { monday, today } from "./date";
export const DEFAULT_SETTINGS: Settings = {
  days: [0, 1, 2, 3, 4],
  start: 510,
  end: 930,
  lunchStart: 720,
  lunchEnd: 780,
  familyStart: 870,
  familyEnd: 930,
  musicMornings: 2,
  trainingSessions: 2,
  trainingMinutes: 90,
  buffer: 0,
  weekends: false,
  musicMovable: false,
  timezone: "Europe/Stockholm",
};
export const DEFAULT_CATEGORIES: Category[] = [
  {
    id: "career",
    name: "Jobb & nätverk",
    color: "#496a8c",
    targetMinutes: 300,
    priority: 4,
    minBlock: 30,
    allowSplit: true,
    movable: true,
  },
  {
    id: "learning",
    name: "Kompetensutveckling",
    color: "#81709b",
    targetMinutes: 600,
    priority: 5,
    minBlock: 60,
    allowSplit: true,
    movable: true,
  },
  {
    id: "music",
    name: "Musik & kreativitet",
    color: "#b78035",
    targetMinutes: 420,
    priority: 5,
    minBlock: 210,
    allowSplit: false,
    movable: false,
  },
  {
    id: "health",
    name: "Träning & hälsa",
    color: "#56806c",
    targetMinutes: 180,
    priority: 3,
    minBlock: 90,
    allowSplit: false,
    movable: true,
  },
  {
    id: "family",
    name: "Familj & hushåll",
    color: "#aa7262",
    targetMinutes: 300,
    priority: 5,
    minBlock: 60,
    allowSplit: false,
    movable: false,
  },
  {
    id: "rest",
    name: "Återhämtning",
    color: "#83847e",
    targetMinutes: 0,
    priority: 2,
    minBlock: 30,
    allowSplit: true,
    movable: true,
  },
];
export function createData(): AppData {
  const week = monday(today());
  return {
    version: 1,
    profile: { name: "Alex" },
    settings: structuredClone(DEFAULT_SETTINGS),
    categories: structuredClone(DEFAULT_CATEGORIES),
    weeks: {},
    recurring: [],
    reflections: {},
    goals: [
      {
        id: "g-career",
        title: "Jobbsökande och nätverkande",
        categoryId: "career",
        horizon: "week",
        week,
        description: "Två ansökningar, tre kontakter och fem arbetsgivare.",
      },
      {
        id: "g-learning",
        title: "Kompetensutveckling",
        categoryId: "learning",
        horizon: "week",
        week,
        description: "Två utbildningsmoduler och fyra timmar projektarbete.",
      },
      {
        id: "g-music",
        title: "Musikproduktion",
        categoryId: "music",
        horizon: "week",
        week,
        description: "Spela in en gitarrdel och färdigställ ett arrangemang.",
      },
      {
        id: "g-long",
        title: "Hitta en anställning",
        categoryId: "career",
        horizon: "long",
        week,
        description: "Långsiktigt mål för jobbsökandet.",
      },
    ],
    tasks: [
      {
        id: "t1",
        goalId: "g-career",
        title: "Skicka två genomarbetade ansökningar",
        done: false,
      },
      {
        id: "t2",
        goalId: "g-career",
        title: "Kontakta tre personer i ditt nätverk",
        done: false,
      },
      {
        id: "t3",
        goalId: "g-career",
        title: "Undersök fem intressanta arbetsgivare",
        done: false,
      },
      {
        id: "t4",
        goalId: "g-learning",
        title: "Genomför två utbildningsmoduler",
        done: false,
      },
      {
        id: "t5",
        goalId: "g-learning",
        title: "Lägg fyra timmar på utvecklingsprojektet",
        done: false,
      },
      {
        id: "t6",
        goalId: "g-music",
        title: "Spela in en gitarrdel",
        done: false,
      },
      {
        id: "t7",
        goalId: "g-music",
        title: "Färdigställ ett arrangemang",
        done: false,
      },
    ],
  };
}

// Refresh only known, unchanged demo copy in existing local/cloud documents.
// User-written goals, notes, times and activity outcomes are preserved.
export function refreshDemoCopy(data: AppData): AppData {
  const legacy: Record<string, { title: string; description: string }> = {
    "g-career": {
      title: "Ta nästa steg i arbetslivet",
      description: "Meningsfulla kontakter och genomarbetade ansökningar.",
    },
    "g-learning": {
      title: "Bygg vidare på din kompetens",
      description: "Lärande som får ta tid och bli konkret.",
    },
    "g-music": {
      title: "Ge musiken utrymme",
      description: "Skapa för skapandets skull.",
    },
    "g-long": {
      title: "Hitta en hållbar riktning i arbetslivet",
      description: "Ett arbete som passar både din kompetens och ditt liv.",
    },
  };
  const defaults = createData().goals;
  return {
    ...data,
    goals: data.goals.map((goal) => {
      const old = legacy[goal.id];
      const current = defaults.find((g) => g.id === goal.id);
      if (!old || !current) return goal;
      return {
        ...goal,
        title: goal.title === old.title ? current.title : goal.title,
        description:
          goal.description === old.description
            ? current.description
            : goal.description,
      };
    }),
    weeks: Object.fromEntries(
      Object.entries(data.weeks).map(([week, plan]) => [
        week,
        {
          ...plan,
          activities: plan.activities.map((a) =>
            a.source === "generated" &&
            a.categoryId === "health" &&
            a.title === "Träning & ny energi"
              ? { ...a, title: "Träning" }
              : a,
          ),
        },
      ]),
    ),
  };
}
