# Connect Google Calendar to Veckoverket

Veckoverket can import events from Google Calendar for your Gmail or Google Workspace account. The connection uses Google's browser sign-in and read-only calendar permissions. It works on GitHub Pages without a backend or a client secret.

## 1. Enable the Google Calendar API

1. Open [Google Cloud Console](https://console.cloud.google.com/).
2. Use the project selector at the top to create a project or select an existing one.
3. Open **APIs & Services → Library**.
4. Search for **Google Calendar API**, open it and click **Enable**.

## 2. Configure the consent screen

1. Open **Google Auth Platform**. Click **Get started** if prompted.
2. Under **Branding**, enter an app name such as `Veckoverket`, a support email and your contact email.
3. Under **Audience**, choose **External** for a personal Gmail account. Keep the app in **Testing** while setting it up.
4. Under **Test users**, click **Add users** and add the Google email address you will connect in Veckoverket.
5. Under **Data Access**, click **Add or remove scopes** and add these two Google Calendar API scopes:

   ```text
   https://www.googleapis.com/auth/calendar.events.readonly
   https://www.googleapis.com/auth/calendar.calendarlist.readonly
   ```

6. Save the configuration. These permissions let Veckoverket list your calendars and read their events. The app does not request Gmail access or permission to edit calendars.

If the project still shows the older menu, use **APIs & Services → OAuth consent screen** for these settings. For use beyond your test users, follow Google's publishing and verification requirements shown under **Audience** and **Verification Center**.

## 3. Create a web client

1. Open **Google Auth Platform → Clients → Create client**.
2. For **Application type**, choose **Web application**.
3. Enter a name, for example `Veckoverket GitHub Pages`.
4. Under **Authorized JavaScript origins**, add:

   ```text
   https://andycdn.github.io
   ```

   Enter the origin exactly, without `/Veckoverket/` or a trailing path. For another domain, use the origin of that domain instead.

5. For local development, optionally add `http://localhost:3000`. The automated browser tests use a simulated client on port 3001 and do not need a real Google client.
6. Leave **Authorized redirect URIs** empty. This integration uses Google's token popup rather than a redirect callback.
7. Click **Create** and copy the **Client ID**, ending in `.apps.googleusercontent.com`.

Use the public **Client ID**, never the **Client secret**. The browser app does not need a secret.

## 4. Add the client ID to GitHub and deploy

1. Open [andyCDN/Veckoverket](https://github.com/andyCDN/Veckoverket).
2. Open **Settings → Secrets and variables → Actions → Variables**.
3. Click **New repository variable**.
4. Set **Name** to `NEXT_PUBLIC_GOOGLE_CLIENT_ID`.
5. Paste the public **Client ID** into **Value** and click **Add variable**.
6. Open **Actions → Deploy Veckoverket to GitHub Pages → Run workflow**.
7. Select `main`, click **Run workflow** and wait for **build** and **deploy** to succeed.
8. Reload [Veckoverket](https://andycdn.github.io/Veckoverket/).

The value is embedded when the site is built, so changing the variable requires a new deployment. Supabase configuration is separate; Google Calendar works with both local storage and an authenticated cloud workspace. No additional database migration is needed.

For local development, put the same variable in `.env.local` and restart `npm run dev`.

## 5. Import a week

1. Open the week you want to import in Veckoverket.
2. Click **Google Kalender** in the toolbar, or open it through **Inställningar**.
3. Click **Anslut Google-konto**, choose your account and approve both read-only calendar permissions.
4. Select the calendars to include.
5. Click **Förhandsgranska import**.
6. Review the events, choose **Kategori** for each booking and check any planning conflicts. The list includes your existing and custom categories. **Anpassa oredigerade planeringsförslag efter bokningarna** can regenerate suggestions around busy events. Your own activities, completed activities and protected music blocks remain in place. If those activities conflict with the bookings, the import keeps the current plan and reports the overlaps.
7. Click **Importera kalenderhändelser** to save the import.

Events marked **Upptagen** reserve time. **Ledig** events appear without blocking planning. All-day and free events are excluded from hour totals. Weekend and evening events remain visible even outside your planning hours. Times are displayed in **Europe/Stockholm**.

You can mark imported events as completed in Veckoverket. Change their titles, dates and times in Google Calendar, then preview and import the week again. Reimporting updates the saved events without creating duplicates; removed events disappear from that week's import. A moved event also updates its previously imported segments in other saved weeks when that event is received again.

## Categorize saved bookings

Open an imported booking, choose **Kategori**, then click **Spara kategori**. The category controls its color, filters and time reporting in Veckoverket. Choose **Ej kategoriserad (Google Kalender)** to clear the classification. The Google event's title, dates, times and read-only source link stay attached.

The choice is saved per Google calendar and event ID, so it survives renaming, rescheduling, reimport and events split across several dates or saved weeks. A recurring Google occurrence has its own event ID and can be categorized separately. Selections and completion marks are included in account storage and JSON backups; no database migration is needed. Removing all imported events or resetting planning clears the saved Google category choices.

Busy timed bookings count toward the selected category's time budget and completion totals. Free and all-day entries stay excluded from hour totals and do not satisfy training-session or full-morning music requirements. If automatic weekly planning is enabled, changing a booking's category recalculates affected future suggestions using the updated totals.

## Connection and storage

- Google access tokens stay in memory in the open page. They are not saved in local storage, Supabase or JSON exports.
- Reconnect after reloading the page or when Google authorization expires. Updates require another preview and import; there is no unattended background synchronization or writeback to Google.
- Imported event details and completion marks are saved with your existing local or cloud workspace, and included in its JSON backup.
- **Koppla från Google** clears the connection and requests Google token revocation. Imported events remain in the plan.
- **Ta bort importerade Google-händelser** removes the saved Google events from Veckoverket. It does not delete your Google Calendar events.

## Check the connection

Create a test event in Google Calendar, import its week, and confirm its Stockholm time in Veckoverket. Change the event's time and import again: there should still be one event, now at the new time. Delete the test event in Google Calendar and import again to confirm removal.

If **Google-anslutning saknas** appears, check the GitHub variable name and run the deployment again. For an origin error, confirm the exact origin in **Clients → Authorized JavaScript origins**. If access is denied while the app is in **Testing**, confirm that your Google email is listed under **Audience → Test users** and that both permissions were approved. Allow the Google popup if the browser blocks it.

Automated tests simulate the Google sign-in and Calendar API. A real account connection must be verified after configuring your own Google project.
