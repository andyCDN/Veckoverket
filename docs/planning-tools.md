# Category rules, undo, and multi-week reporting

These features work with the existing local storage or Supabase workspace document. They need no new database migration or Edge Function deployment. The separate private iCal connection still requires its [one-time server installation](ical-calendar-setup.md).

## Automatic calendar categories

Open **Inställningar → Automatisk kategorisering**. Enter text under **Rubriken innehåller**, choose **Regelns kategori**, optionally restrict **Gäller kalender**, then select **Lägg till kategoriregel**. Rules save immediately, separately from the planning-settings form.

- Rules match part of a booking's title, ignoring case and normalizing Unicode. They do not use regular expressions or inspect descriptions.
- The first enabled matching rule wins. Use the arrows to change priority, the checkbox to pause a rule, and the edit/delete controls to change it. Up to 100 rules are supported.
- Rules apply to both Google OAuth and private iCal imports, including automatic iCal updates. Classification controls the existing category colors, filters, time accounting, and planning budgets.
- A manual category always wins, including an explicit **Ej kategoriserad (Google Kalender)** choice. Older classified bookings and backups are treated as manual choices.
- Choose **Automatisk: …** in the import preview or a saved booking's category selector to return it to the rules. The option shows the current rule result; a saved booking requires **Spara kategori**.
- Rule results follow the source calendar/event identity across segments and saved weeks. They are recomputed when a title changes or rules change; they are never silently converted into manual choices. Completion state is preserved.
- New or edited rules take effect at the next import. **Tillämpa regler på sparade bokningar** applies them now, including historical bookings, while preserving manual overrides. The count refers to distinct bookings, not day segments. Applying rules can update historical category totals.
- Changing categories respects automatic planning: future planning suggestions are adjusted when that mode is enabled, with the usual protection for manual, completed, and past activities.
- Rules and manual overrides are included in workspace synchronization and backups. Planning/statistics reset preserves the rules as settings and clears imported bookings and per-event overrides.

## Undo saved changes

Choose **Ångra** in the calendar's **Verktyg** menu, the desktop navigation tools, or a confirmation message. **Ctrl+Z / Cmd+Z** also undoes the last saved change when focus is outside a text field and no dialog is open. Native text-field undo keeps working normally.

Undo restores the previous workspace state, including changes produced by automatic replanning as part of that user action. Supported examples include activity editing/deletion, completion marks, category rules and category application, planning settings, generation, goals, reflections, backup import, and planning/statistics reset. The restored data is saved through the same local/cloud path, including offline queues and normal revision-conflict checks.

The history is **session-only**, with up to 20 changes and an 8 MiB memory budget. It is not included in backups or synchronization. Reloading, signing out/changing account, receiving different cloud data, an automatic calendar refresh, or creating another week's plan establishes a new history boundary. Identical save confirmations do not clear it. Undo is unavailable during a version conflict or while protected corrupt storage has not been replaced. It cannot restore an unreadable original backup or a private link deleted from the server. Disconnecting the server-side iCal link clears undo history.

## Multi-week reporting

Open **Veckoreflektion → Visa uppföljning över flera veckor**. Choose **4 veckor** or **12 veckor** and optionally filter by **Livsområde i statistiken**.

- The period ends with the selected reflection week, capped at the current Stockholm week. Future weeks are excluded. The current week is marked **Pågående vecka** and can include activities that have not happened yet.
- Summary cards show planned time, completed time, and completed/planned percentage. A zero planned total displays a dash for the percentage.
- Each chart row shows planned/completed hours for that week. Select a saved week to inspect it. **Ingen sparad plan** is different from a saved **Tom plan**; missing weeks are not generated and contribute no time or targets. Coverage states how many weeks actually have saved plans.
- The category table compares saved time targets, planned time, and completed time. Historical target snapshots are used even if today's settings differ. A category absent from a target snapshot has a zero target for that week. Older plans without a snapshot use their saved planning rules, falling back to current settings only where no historical rules exist.
- Completed time is the full duration of checked activities; this is not a timer. Skipped activities remain part of planned time. Free Google bookings and imported all-day bookings do not count as category time. Busy timed bookings count in their assigned category.
- Reporting reads the saved workspace only and never writes new plans. Reset clears its underlying activity history; undoing the reset during the same session restores it.

Verification includes unit tests for rule/manual precedence and import updates, history boundaries and snapshot limits, and report calculations, plus browser tests for mobile controls, undo persistence/account separation, and four/twelve-week filtering without creating missing weeks.
