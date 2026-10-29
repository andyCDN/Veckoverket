# Weekly planning and review

Monday has a **Veckostart** (15 minutes). Friday has a **Veckoavstämning** (30 minutes). Open the calendar card to use the exercise; the independent calendar checkbox still records completion. Saving notes does not mark the session done automatically.

The Monday exercise records the week's priorities, tasks, timing and obstacles. It also shows the week's goals and their tasks. The Friday exercise records a summary, unfinished work, a goal assessment and the plan for the following week. Task completion is shown as a count and percentage for each weekly goal. Goals without tasks do not receive a percentage. The next-week section shows saved plan information and provides a button to open that week.

Notes use the existing weekly reflection document and automatic local/account storage. They are also available in **Reflektion**. Monday notes use the optional `startPlan` field; goal assessments use `goalReview`. Existing summary, unfinished-work and next-week fields are shared between the Friday exercise and the reflection view. JSON backups include these fields, the routine activity type and completion state. No Supabase schema migration is needed.

## Scheduling and existing plans

- The weekday must be enabled in the planning settings. Monday uses the first available interval; Friday uses the last available interval within the day's configured hours.
- Free intervals are preferred. If needed, only untouched, generated, planned, flexible suggestions in a movable, splittable category can be shortened. Their minimum block length and the configured buffer remain enforced.
- Manual activities, recurring bookings, imported events, protected/locked sessions and logged outcomes are preserved. Missing routine slots and category time deficits appear in the existing planning warnings. The engine does not change the user's time targets to hide a deficit.
- Existing saved plans are upgraded once, starting from today's date in Europe/Stockholm. Earlier dates remain unchanged. `weeklyRoutinesFrom` records the upgrade boundary and prevents duplicate insertion on reload. A full regeneration can recreate a deleted routine, as it can recreate other generated suggestions.
- Explicitly empty weeks, including a reset workspace, stay empty. New weeks receive the routines when generated. A cloud upgrade uses the same account cache, autosave and revision checks as other edits.

The default productive-time targets already use all 25 available hours. Adding the routines costs 45 minutes. The initial default plan reports 15 missing minutes for career work and 30 for learning; the user can reduce a target, free time or increase availability.

## Verification

`npm test` covers scheduling, buffers, protected data, duplicate prevention, historical boundaries, reset workspaces and backup validation. After `npm run build:pages`, `npm run test:pages` exercises the Monday and Friday dialogs at 320 px, note persistence, task completion, accessibility and next-week navigation. `npm run test:cloud` verifies account save and reload using the simulated Supabase service.
