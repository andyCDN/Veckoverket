import { overfilledWorkspace } from "./overfilled-week";

// Older documents can pass storage validation with a week key that is not
// Monday. The automatic schedule installer rejects it. Loading must retain
// the original document and let the user open the manual import instead.
export function startupFailureWorkspace() {
  const data = overfilledWorkspace();
  data.weeks["2026-11-24"] = {
    ...structuredClone(data.weeks["2026-11-23"]),
    week: "2026-11-24",
  };
  return data;
}
