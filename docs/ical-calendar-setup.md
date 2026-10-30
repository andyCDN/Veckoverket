# Private Google Calendar iCal connection

This is an alternative to Google OAuth. Each signed-in Veckoverket account can connect one private Google Calendar iCal URL. No Google Cloud project, OAuth consent screen, or Google client ID is required. The existing Google sign-in import remains available for multiple calendars.

GitHub Pages serves the app. A Supabase Edge Function fetches the private feed because Google does not allow the browser to read it directly. This function and the database migration must be installed once in the **same Supabase project as the app**. Publishing the website alone does not install them.

## One-time server installation

Requirements: the existing [Supabase account and workspace setup](cloud-setup.md), Node.js 22 or newer, and administrator access to that Supabase project. Run these commands in a terminal on your computer. Never paste a private calendar URL or administrator credentials into GitHub variables, issues, or chat.

1. Get the latest repository and install dependencies:

   ```sh
   git clone https://github.com/andyCDN/Veckoverket.git
   cd Veckoverket
   npm ci
   ```

   If you already have the repository, run `git pull` inside it instead of cloning again.

2. Sign in to Supabase:

   ```sh
   npx supabase login
   ```

3. In the Supabase dashboard, open **Project Settings → General** and copy the **Reference ID**. Replace `YOUR_PROJECT_REF` below with that ID:

   ```sh
   npx supabase link --project-ref YOUR_PROJECT_REF
   ```

4. In **Supabase → SQL Editor → New query**, paste and run the entire contents of [202610300001_calendar_ical.sql](../supabase/migrations/202610300001_calendar_ical.sql). It is safe to run this migration again. Existing workspace migrations must already be installed.

5. Create the encryption secret without printing it. Run the command below **once**:

   ```sh
   node scripts/create-ical-secret.mjs
   npx supabase secrets set --env-file .env.ical-server
   ```

   `.env.ical-server` is ignored by Git. Keep it in a secure location. It contains a server-only encryption key, **not** an app environment variable. Never put the key in a `NEXT_PUBLIC_` variable. Reuse the existing key when redeploying; changing it makes saved links unreadable, requiring users to reconnect. The script refuses to overwrite an existing file.

6. Deploy the server function:

   ```sh
   npx supabase functions deploy calendar-ical --use-api
   ```

   `--use-api` bundles the function on Supabase, so Docker is not required. The checked-in `supabase/config.toml` disables gateway JWT verification for this function because the function verifies every caller with **Supabase Auth.getUser** itself. This supports both legacy and asymmetric JWT signing keys. No operation is allowed without a verified, non-anonymous user.

The default allowed browser origin is `https://andycdn.github.io`. For another deployment, set `APP_ORIGIN` as a Supabase function secret to the exact origin, without a trailing slash or path. For local testing use `http://localhost:3000`. Supabase injects `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` into the function; never put the service-role key in the website.

## Connect a calendar

1. Open **Google Calendar on a computer → Settings → Settings for my calendars → select a calendar → Integrate calendar**.
2. Copy **Secret address in iCal format**. A public calendar URL, sharing URL, or browser address is not the correct link. Your Google Workspace administrator may disable secret addresses.
3. Sign in to Veckoverket and open **Inställningar → Hantera Google Kalender** (or **Verktyg → Google Kalender**).
4. Paste the URL under **Hemlig iCal-adress** and choose **Anslut och förhandsgranska**. The field clears after a successful connection.
5. Choose categories for the bookings and select **Importera kalenderhändelser**. Automatic refresh starts after this first import.

The link grants read access to the calendar, so treat it as a password. Use **Koppla från iCal-länken** to delete the encrypted server copy and stop automatic refresh. Existing imported bookings remain in the plan. You can revoke a leaked link in Google Calendar by resetting the secret address, then connect the replacement in Veckoverket.

## Behavior and limits

- Refresh runs for the **displayed week** when the app opens or the week changes, and approximately every 15 minutes while the app is visible and online. Edits, open dialogs, cloud conflicts, and unsaved cloud changes pause it. Nothing runs while the app is closed. Google can delay feed changes; this is not a real-time connection.
- Manual refresh is available through **Förhandsgranska via iCal**. The server allows one feed fetch per account per 15 seconds.
- Turn off **Uppdatera automatiskt när appen är öppen** to pause refresh while keeping the saved link. Importing a new iCal preview enables refresh again.
- Timed, all-day, and multi-day bookings, daily/weekly/monthly/yearly recurrence, exclusions, moved instances, and cancellations are supported. Everything is displayed in Europe/Stockholm time. Unsupported or incomplete feeds fail as a whole, preserving the saved plan. A valid empty feed removes that calendar's imported entries in the displayed week.
- Categories and completion status follow stable source IDs. Standard Google event IDs are preserved when switching from the OAuth import. Externally created events with different OAuth IDs may need to be categorized again on the first iCal import. Other calendars and local activities are retained.
- The selected category controls colors, filters, and time accounting just as for OAuth imports. Only busy, timed bookings count toward category time budgets.
- The first preview offers the usual optional replanning. Later automatic refresh adjusts planning suggestions only when **automatic weekly planning** is enabled; otherwise it preserves local activities and updates the imported bookings. Manual, protected, and completed activities remain protected. Conflicts are shown under the calendar.
- One private feed per account is supported. Replacing the link to a different calendar leaves earlier imports in the plan and pauses the old automatic connection until the replacement is imported.
- **Ta bort importerade Google-händelser** and planning reset stop automatic import. They preserve the encrypted server connection, which can be reused with a new preview or deleted using **Koppla från iCal-länken**.
- Backups and account-scoped browser caches contain bookings and a non-secret calendar identifier/refresh preference. The private URL is excluded. Restoring a backup into another account does not transfer access to the feed.

## Server storage and troubleshooting

The Edge Function stores the URL using AES-256-GCM with a random IV and account-bound authentication data. The encryption key is a Supabase function secret. The `calendar_ical_feeds` table has RLS enabled and no grants for browser roles (`anon` and `authenticated`); only the service role can access it. URLs are not included in responses or application error logs. Fetching is restricted to HTTPS private iCal URLs on `calendar.google.com`, with redirects disabled, a 15-second timeout, a 5 MiB response limit, and bounded recurrence expansion. The function never writes to Google Calendar.

- **iCal-tjänsten kunde inte nås**: check that the function is deployed in the app's Supabase project, the SQL migration ran, `ICAL_ENCRYPTION_KEY` exists, and `APP_ORIGIN` matches the site.
- **Kalendern kunde inte hämtas eller läsas fullständigt**: check that you copied the secret iCal address, have not revoked it, and the feed does not exceed the size/recurrence limits. The existing plan is retained.
- **Vänta 15 sekunder**: wait briefly before requesting another preview.
- **Ingen iCal-länk är ansluten** after a backup restore: connect the link in this account or disable automatic refresh.

Verification: `npm test` covers parsing, encryption, authentication, account isolation, SQL grants/throttling, and merge behavior. `npm run test:cloud -- --grep 'privat länk'` exercises the real handler/parser with a fake feed and cloud account in the browser. No real calendar URLs or Google accounts are used in tests.
