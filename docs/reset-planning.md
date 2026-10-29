# Reset planning and statistics

Open **Inställningar → Lagring och säkerhetskopiering → Nollställ planering och statistik**.

The confirmation lists what will be removed. You can use **Exportera säkerhetskopia** to save a JSON backup before continuing. Select **Jag vill ta bort sparad planering och statistik** and click **Nollställ nu** to apply the reset, or choose **Avbryt** to keep the current data.

The reset removes all saved weeks' activities and completion/missed marks, goals, tasks, recurring rules and weekly reflections. Statistics and missed-activity follow-ups are calculated from that data, so they return to zero. Imported Google events are removed from Veckoverket; the original Google Calendar events are unchanged.

Your account, profile, saved planning settings and categories are preserved. The current week is saved as an explicitly empty plan, so reloading does not restore the example plan. You can add activities or choose **Planera veckan** to create a new proposal. The app's usual automatic generation still applies when you open a new week.

With cloud storage enabled, the reset is saved to the signed-in account using the existing revision checks. Other accounts are unaffected. Offline resets stay in that account's pending cache and sync when the connection returns. An existing version conflict must be resolved before resetting.

The reset is an app function; installing an update never resets a user's plan automatically.
