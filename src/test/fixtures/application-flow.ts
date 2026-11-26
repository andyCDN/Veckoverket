import { jobWorkspaceFixture, jobDate } from "./job-workspace";
export function applicationFlowFixture() {
  const data = jobWorkspaceFixture();
  data.applications!.push({
    ...structuredClone(data.applications![0]),
    id: "second",
    role: "Kommunikatör",
    organization: "Museet",
    deadline: "2026-12-02",
    nextActionId: "step-second",
    advertisement: {
      url: "https://example.org/jobs/kommunikator",
      text: "Tjänst: Kommunikatör\nArbetsgivare: Museet\nUtveckla museets kommunikation.",
    },
    history: [],
  });
  data.weeks[jobDate].activities = [
    {
      id: "search-pass",
      title: "Arbetspass söka jobb",
      description: "Mitt fasta veckoschema",
      categoryId: "career",
      date: jobDate,
      start: 540,
      end: 630,
      estimatedMinutes: 90,
      blockType: "protected",
      priority: 3,
      status: "planned",
      source: "manual",
    },
  ];
  return data;
}
