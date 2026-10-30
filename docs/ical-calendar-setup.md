# Install the private iCal connection using GitHub Codespaces

Do this setup **entirely in your browser**. Node.js and the commands run in GitHub Codespaces. Nothing needs to be installed on your computer.

Use the **same Supabase project as Veckoverket**, with the existing [cloud storage setup](cloud-setup.md) working and access to its dashboard.

| Where | What you do there |
| --- | --- |
| GitHub Codespaces | Run the commands below in the browser's terminal. |
| Supabase dashboard | Run the SQL file and check the installed function. |
| Veckoverket | Paste your private calendar link and import bookings. |

This installation is needed once. Afterwards, the calendar function runs in Supabase.

## 1. Open the cloud terminal

1. Open [Codespaces for Veckoverket](https://codespaces.new/andyCDN/Veckoverket).
2. Check that the repository is **andyCDN/Veckoverket** and the branch is **main**, then select **Create codespace**.
3. Wait for the editor to open in your browser.
4. Select **Terminal → New Terminal**, via the **☰** menu if needed. Use the terminal panel at the bottom for all commands below.

The project is already in the Codespace. The terminal should be in the folder containing `scripts`, `supabase`, and `.nvmrc`.

Run **one line at a time**, waiting for each to finish:

```sh
nvm install
nvm use
node --version
```

These commands select Node.js in the cloud. The final output should begin with **v24.**

## 2. Get your Supabase project ID

Open your project in [Supabase](https://supabase.com/dashboard), in another tab.

Its address will look like:

```text
https://supabase.com/dashboard/project/abcdefghijklmnopqrst
```

Your project ID is the part after `/project/`, here `abcdefghijklmnopqrst`.

Replace **YOUR_PROJECT_REF** in steps 5 and 6 with your ID. This method does not require a database password.

## 3. Run the SQL file in Supabase

1. Open [202610300001_calendar_ical.sql on GitHub](https://github.com/andyCDN/Veckoverket/blob/main/supabase/migrations/202610300001_calendar_ical.sql).
2. Copy the **entire file contents**, using GitHub's **Copy raw file** button.
3. In the Supabase dashboard, select **SQL Editor → New query**.
4. Paste the SQL and select **Run**.
5. Check that the query succeeds. Skip this step if you already ran this file successfully.

## 4. Sign in from Codespaces

Return to the **Codespaces terminal** and run:

```sh
npx --yes supabase login --no-browser
```

Follow the prompts and open the displayed sign-in link in another tab. Sign in with the Supabase account that manages your project. Enter any verification code back in the Codespaces terminal, then wait for successful login.

Do not paste login codes or access tokens into GitHub files or this chat.

## 5. Set up the encryption key once

First, in the **Supabase dashboard → Edge Functions → Secrets**, look for **ICAL_ENCRYPTION_KEY**.

- **Already exists:** keep it unchanged and go to step 6, even if this Codespace is new.
- **Missing:** run these commands in Codespaces, replacing **YOUR_PROJECT_REF** with your ID:

  ```sh
  node scripts/create-ical-secret.mjs
  npx --yes supabase secrets set --env-file .env.ical-server --project-ref YOUR_PROJECT_REF
  ```

The commands create `.env.ical-server` and upload its key. Check that **ICAL_ENCRYPTION_KEY** now appears in Supabase → **Edge Functions → Secrets**.

If the file already exists but the Supabase secret is missing, run just the upload command. The file is ignored by Git. Keep an existing server key: replacing it makes saved calendar links unreadable.

## 6. Deploy the calendar function

In the **Codespaces terminal**, replace **YOUR_PROJECT_REF** with the same ID and run:

```sh
npx --yes supabase functions deploy calendar-ical --project-ref YOUR_PROJECT_REF --use-api
```

Wait for a successful deployment, then check that **calendar-ical** appears under **Supabase → Edge Functions**.

The `--use-api` option builds on Supabase without Docker. The repository supplies the function configuration.

## 7. Connect your calendar in Veckoverket

1. Open **Google Calendar on a computer → Settings → Settings for my calendars → select a calendar → Integrate calendar**.
2. Copy **Secret address in iCal format**. A public calendar URL, sharing URL, or browser address is not the correct link. Your Google Workspace administrator may disable secret addresses.
3. Sign in to Veckoverket and open **Inställningar → Hantera Google Kalender** (or **Verktyg → Google Kalender**).
4. Paste the URL under **Hemlig iCal-adress** and choose **Anslut och förhandsgranska**. The field clears after a successful connection.
5. Choose categories for the bookings and select **Importera kalenderhändelser**. Automatic refresh starts after this first import.

Keep the private link secret. **Koppla från iCal-länken** deletes the saved link and stops automatic refresh; imported bookings remain.

## After setup

After a successful import in [Veckoverket](https://andycdn.github.io/Veckoverket/), open [your Codespaces](https://github.com/codespaces) and choose **… → Stop codespace**. The app and Supabase function keep working. Calendar refresh runs while Veckoverket is open.

For later deployments, reopen the Codespace, sign in if needed, and repeat step 6. Keep the existing **ICAL_ENCRYPTION_KEY** in Supabase, even if a new Codespace has no `.env.ical-server` file.

<details>
<summary>Behavior, technical details, and troubleshooting</summary>

## Behavior and limits

- Refresh runs for the **displayed week** when the app opens or the week changes, and approximately every 15 minutes while the app is visible and online. Edits, open dialogs, cloud conflicts, and unsaved cloud changes pause it. Nothing runs while the app is closed. Google can delay feed changes; this is not a real-time connection.
- Manual refresh is available through **Förhandsgranska via iCal**. The server allows one feed fetch per account per 15 seconds.
- Turn off **Uppdatera automatiskt när appen är öppen** to pause refresh while keeping the saved link. Importing a new iCal preview enables refresh again.
- Timed, all-day, and multi-day bookings, daily/weekly/monthly/yearly recurrence, exclusions, moved instances, and cancellations are supported. Everything is displayed in Europe/Stockholm time. Unsupported or incomplete feeds fail as a whole, preserving the saved plan. A valid empty feed removes that calendar's imported entries in the displayed week.
- Categories and completion status follow stable source IDs. Standard Google event IDs are preserved when switching from the OAuth import. Externally created events with different OAuth IDs may need to be categorized again on the first iCal import. Other calendars and local activities are retained.
- [Automatic category rules](planning-tools.md) also apply to iCal previews and automatic refresh. Manual category choices take precedence; select **Automatisk: …** to return a booking to the rules.
- The selected category controls colors, filters, and time accounting just as for OAuth imports. Only busy, timed bookings count toward category time budgets.
- The first preview offers the usual optional replanning. Later automatic refresh adjusts planning suggestions only when **automatic weekly planning** is enabled; otherwise it preserves local activities and updates the imported bookings. Manual, protected, and completed activities remain protected. Conflicts are shown under the calendar.
- One private feed per account is supported. Replacing the link to a different calendar leaves earlier imports in the plan and pauses the old automatic connection until the replacement is imported.
- **Ta bort importerade Google-händelser** and planning reset stop automatic import. They preserve the encrypted server connection, which can be reused with a new preview or deleted using **Koppla från iCal-länken**.
- Backups and account-scoped browser caches contain bookings and a non-secret calendar identifier/refresh preference. The private URL is excluded. Restoring a backup into another account does not transfer access to the feed.

## Server storage and troubleshooting

The default allowed browser origin is `https://andycdn.github.io`. For another deployment, set `APP_ORIGIN` as a Supabase function secret to the exact origin, without a trailing slash or path. Supabase supplies `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` automatically. Keep these server credentials out of the website.

The checked-in configuration disables gateway JWT verification for this function because the function verifies every caller with **Supabase Auth.getUser** itself. This supports legacy and asymmetric signing keys. All operations require a verified, non-anonymous user.

The Edge Function stores the URL using AES-256-GCM with a random IV and account-bound authentication data. The encryption key is a Supabase function secret. The `calendar_ical_feeds` table has RLS enabled and no grants for browser roles (`anon` and `authenticated`); only the service role can access it. URLs are not included in responses or application error logs. Fetching is restricted to HTTPS private iCal URLs on `calendar.google.com`, with redirects disabled, a 15-second timeout, a 5 MiB response limit, and bounded recurrence expansion. The function never writes to Google Calendar.

- **`nvm: command not found`**: check that you opened the repository in a GitHub Codespace and are using **Terminal → New Terminal** inside its browser editor, rather than a terminal on your own computer.
- **Project not found or access denied in the CLI**: check the project ID, make sure **YOUR_PROJECT_REF** was replaced, and sign in with an account that can manage that project. Do not add a database password; this setup uses the Supabase API.
- **Secret file already exists**: keep the file; the script did not overwrite it. If the server key already exists too, skip step 5. If only the file exists, upload it with the second command in step 5.
- **iCal-tjänsten kunde inte nås**: check that the function is deployed in the app's Supabase project, the SQL migration ran, `ICAL_ENCRYPTION_KEY` exists, and `APP_ORIGIN` matches the site.
- **Kalendern kunde inte hämtas eller läsas fullständigt**: check that you copied the secret iCal address, have not revoked it, and the feed does not exceed the size/recurrence limits. The existing plan is retained.
- **Vänta 15 sekunder**: wait briefly before requesting another preview.
- **Ingen iCal-länk är ansluten** after a backup restore: connect the link in this account or disable automatic refresh.

Verification: `npm test` covers parsing, encryption, authentication, account isolation, SQL grants/throttling, and merge behavior. `npm run test:cloud -- --grep 'privat länk'` exercises the real handler/parser with a fake feed and cloud account in the browser. No real calendar URLs or Google accounts are used in tests.

</details>
