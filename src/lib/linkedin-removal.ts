import type { CloudTransport } from "./workspace-sync";
import {
  linkedInSeriesCounts,
  removeLinkedInSeries,
} from "./activity-exclusions";

export type LinkedInRemovalReport = {
  removedBookings: number;
  removedRules: number;
  remainingBookings: number;
  remainingRules: number;
};

/** Read the authenticated user's real document, save with its revision, then
 * read it back. Concurrent changes are reloaded rather than overwritten. */
export async function removeLinkedInFromCloud(
  transport: CloudTransport,
): Promise<LinkedInRemovalReport> {
  let removedBookings = 0,
    removedRules = 0;
  for (let attempt = 0; attempt < 3; attempt++) {
    const current = await transport.load();
    if (!current)
      throw new Error("Ingen sparad molnplan hittades för det här kontot.");
    const result = removeLinkedInSeries(current.data, [], true);
    if (result.data !== current.data) {
      try {
        await transport.save(result.data, current.revision);
        removedBookings += result.removedBookings;
        removedRules += result.removedRules;
      } catch (error) {
        if (error instanceof Error && error.name === "CloudConflict") continue;
        throw error;
      }
    }
    const verified = await transport.load();
    if (!verified)
      throw new Error(
        "Den sparade planen kunde inte kontrolleras efter rensningen.",
      );
    const remaining = linkedInSeriesCounts(verified.data);
    if (!remaining.bookings && !remaining.rules)
      return {
        removedBookings,
        removedRules,
        remainingBookings: 0,
        remainingRules: 0,
      };
  }
  throw new Error(
    "Planen ändrades under rensningen. Försök igen för att ta bort de återstående bokningarna.",
  );
}
