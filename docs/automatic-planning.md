# Automatic weekly planning

## Enable or pause

1. Open **Verktyg → Planera veckan** on a phone, or **Planera veckan** above the desktop calendar.
2. Leave **Automatisk planering** selected and review the proposed category totals and any capacity warnings.
3. Select **Aktivera och använd planen**. The plan and mode are saved locally or in the signed-in account.
4. To pause without changing the saved schedule, open the same dialog and select **Pausa automatisk planering**.

The mode is also available in **Inställningar**, next to the available days. Saving settings rebuilds the selected week. Existing accounts keep their previous planning behavior until automatic planning is enabled.

## Planning order

The engine uses saved working hours, enabled days, category targets and priorities, minimum block lengths, splitting rules, lunch, family time, buffers, recurring bookings and imported Google events. Each saved week retains its own availability and time targets. New weeks use the current settings.

Fixed reservations and immovable music mornings are placed first. Weekly planning/review exercises and whole training sessions use their configured weekday/time preferences. Within the remaining time, both career work and learning receive a morning block when their budgets and available intervals permit it. The engine then fills the remaining focus budgets, preferring morning time across the week. Other flexible categories prefer the afternoon; priorities still determine order within the focus group and within other categories. Valid spare time continues to go to career work.

Morning placement is a preference. It does not move an appointment, split a protected music morning, bypass a buffer or create overlapping activities. When all morning time is booked, focus work uses later free intervals. Capacity or minimum-block constraints appear in the existing planning warnings; targets are not silently lowered.

## Booking changes

While the mode is enabled:

- Creating, editing or moving a booking replans the affected saved weeks. A booking can take the time of an untouched generated suggestion, which is then rescheduled. Existing manual/recurring/imported bookings still block that interval.
- New recurring rules also update already saved future weeks. Series edits remain atomic: an invalid affected week blocks the edit.
- Removing a manual booking frees its time for a new plan. Removing a generated suggestion does not immediately recreate it; a later booking change can regenerate suggestions from the saved targets.
- Google import/update replans around the imported busy time. Cancellation/removal can free time in affected weeks. Google events are fetched when the user requests import/update; this mode does not add background access to Google.

Automatic changes preserve earlier dates and activities that have already started, using the current time in Europe/Stockholm rounded forward to a five-minute boundary. Manual edits, logged outcomes and immovable protected blocks are retained. A candidate with hard conflicts does not replace the saved plan. Real conflicting Google bookings remain visible for explicit resolution.

There is no periodic write loop. Replanning runs as part of a booking or settings action, then uses the existing local/account persistence and revision checks. Notes, goals, task state and weekly exercise outcomes remain part of the same workspace. Paused or explicitly empty/reset weeks are not filled in the background.

## Data and verification

`Settings.autoPlanning` is optional for backward-compatible backups. The engine accepts an explicit date/minute boundary; scheduling has no implicit clock dependency. No database migration is needed.

`src/test/auto-planning.test.ts` covers focus placement, bookings, recurrence, historical/started work, buffers, capacity, pause, empty weeks, backup validation and Swedish time boundaries. Browser tests cover activation, booking creation, pause, persistence, narrow-screen accessibility and account sync.
