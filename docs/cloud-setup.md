# Activate cloud storage for Veckoverket

After cloud storage is working, the optional [private iCal connection](ical-calendar-setup.md) can read Google Calendar bookings without Google OAuth setup. Its migration and Edge Function can be installed entirely in your browser using GitHub Codespaces and the Supabase dashboard, with no software installation on your computer.

The app is prepared for Supabase cloud storage. Your existing GitHub Pages address stays the same:

**https://andycdn.github.io/Veckoverket/**

You need to create the Supabase project in your own account. Until its public connection settings are added to GitHub and the site is rebuilt, the app keeps using the existing local plan and says that the cloud is not connected.

## 1. Create your Supabase project

1. Open **https://supabase.com/dashboard** and sign in or create an account.
2. Select **New project** and choose your organization. Create a personal organization if you do not have one.
3. Enter **Veckoverket** as the project name.
4. Choose a database password and keep it in your password manager. You will not enter that password into Veckoverket or GitHub.
5. Select a region near you, such as a European region, and select **Create new project**.
6. Wait until the project is ready.

## 2. Install the cloud database

1. Open this file in the GitHub repository:
   **[202610290002_workspace_sync.sql](https://github.com/andyCDN/Veckoverket/blob/main/supabase/migrations/202610290002_workspace_sync.sql)**.
2. Copy the **entire SQL file**. Use the copy button in GitHub’s file viewer, or open **Raw** and copy the text.
3. In your Supabase project, open **SQL Editor** in the left menu.
4. Select **New query**, paste the SQL and select **Run**.
5. The query should finish successfully. It does not need to display data rows.

This file is sufficient for a new cloud-storage installation. You do not need to run the older `202610290001_initial.sql` file first. If you have already installed that older file, run the new file as an update; it retains existing workspace data. The new file is also safe to run again.

It creates the workspace table, access rules and the version-checked save function. Each signed-in account can access only its own plan.

## 3. Configure email sign-in

1. Open **Authentication** in Supabase.
2. Open **Sign In / Providers** (called **Providers** in some dashboard versions).
3. Make sure **Email** sign-in is enabled. You can keep email confirmation enabled.
4. Open **URL Configuration**.
5. Set **Site URL** to:

   ```text
   https://andycdn.github.io/Veckoverket/
   ```

6. Add the same address to **Redirect URLs** and save the changes.

The app uses email and password sign-in. Account confirmation returns to the existing app address; a separate callback page is not required.

## 4. Copy the two public connection values

1. In the Supabase project, open **Connect**, or **Project Settings → Data API**, and copy the **Project URL**. It looks like:

   ```text
   https://your-project-ref.supabase.co
   ```

2. Open **Project Settings → API Keys** and copy the **Publishable key**. It begins with `sb_publishable_`.

Use the publishable key, not a secret key or database password. Older projects may instead have a public `anon` key; the app supports that as `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

## 5. Add the connection values in GitHub

1. Open **https://github.com/andyCDN/Veckoverket**.
2. Select **Settings** in the repository’s top navigation.
3. In the left menu, select **Secrets and variables → Actions**.
4. Select the **Variables** tab.
5. Select **New repository variable** and create this variable:

   | Field     | Value                         |
   | --------- | ----------------------------- |
   | **Name**  | `NEXT_PUBLIC_SUPABASE_URL`    |
   | **Value** | Your Supabase **Project URL** |

6. Select **Add variable**.
7. Select **New repository variable** again and create:

   | Field     | Value                                  |
   | --------- | -------------------------------------- |
   | **Name**  | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` |
   | **Value** | Your Supabase **Publishable key**      |

8. Select **Add variable**. Paste the values without quotes or extra line breaks.

These two values are public browser configuration. The database access rules protect your account’s data. No server secret or database password belongs in these variables.

If you use an older public anon key, use `NEXT_PUBLIC_SUPABASE_ANON_KEY` instead of `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. You do not need both keys.

## 6. Rebuild and publish

1. Select **Actions** in the GitHub repository.
2. Select **Deploy Veckoverket to GitHub Pages** in the left menu.
3. Select **Run workflow**.
4. Select the **main** branch, then select **Run workflow** again.
5. Open the new run and wait until both **build** and **deploy** are green.
6. Open **https://andycdn.github.io/Veckoverket/**. Reload the page if you still see the previous interface.

The rebuild is required: GitHub Pages serves static files, and Next.js includes the public connection values when building the site.

## 7. Sign in and transfer the existing plan

Your app account is separate from the account used to administer the Supabase dashboard.

1. The connected app displays a sign-in page. Select **Skapa ett konto**.
2. Enter your email address and a password of at least eight characters.
3. If email confirmation is enabled, open the confirmation message. Return to the app and sign in if prompted.
4. If the account has no cloud plan and this browser has an existing local plan, select **Flytta min lokala plan till molnet**.
5. Wait until the status says **Sparat i molnet**.
6. Open the app in another browser or on another device and sign in to the **same account**. Your plan should load there.

The transfer keeps the original local plan. It does not automatically replace an existing cloud plan with this browser’s old local data. If you want to move a different local backup into an account, first export the current cloud plan, then use **Inställningar → Importera**; the app asks before replacing the account’s document.

## What cloud storage does

- Loads the account’s plan before writing any data.
- Automatically saves activity changes, checkboxes, goals, tasks, settings, missed-pass follow-ups and reflections.
- Checks for changes from other devices every 30 seconds while the page is visible, and when you return to the page or reconnect.
- Pauses incoming background updates while an activity or settings form is being edited. A newer remote save still triggers a version conflict when saving.
- Keeps a separate account-specific device cache and sends pending changes after connection interruptions.
- Shows a conflict if another device saved a newer version. You can export the device copy and choose **Använd molnversionen** or **Spara enhetens version**.
- Does not automatically merge simultaneous edits or provide shared multi-user plans.

This is not an offline-installed app. The page itself must be available to open; the cache protects plan edits during connection interruptions.

## Troubleshooting

| Symptom                                        | Check                                                                                                                              |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| The page still says the cloud is not connected | Check both GitHub repository variables, then run the workflow again.                                                               |
| The build stops with a configuration error     | Check that the URL and public key are both present and that the key is publishable or public anon.                                 |
| Sign-up or sign-in fails                       | Check Email sign-in, account confirmation, the project URL/key and the account password.                                           |
| Confirmation opens the wrong website           | Check Supabase **Authentication → URL Configuration**.                                                                             |
| The cloud plan cannot be loaded or saved       | Run the full SQL file from step 2 and check that the Supabase project is running.                                                  |
| A different device shows a different plan      | Confirm that both use the same account and that the saving device says **Sparat i molnet**. Return to the other page or reload it. |
| The status shows a version conflict            | Export the device copy if needed, then explicitly choose a version. The app does not overwrite the newer document automatically.   |

## Local development and verification

Copy `.env.example` to `.env.local`, set the public project URL and publishable key, and restart `npm run dev`. Do not commit `.env.local`.

- `npm test`: planner/storage tests, sync-engine tests and PostgreSQL tests of the migration, row access rules and revision checks. The PostgreSQL tests run locally with PGlite and a test implementation of Supabase’s `auth.uid()`.
- `npm run test:cloud`: browser tests with a local mocked Supabase API, including sign-in, account isolation, migration, autosaving, interruptions and conflicts. It never contacts a real Supabase project.
- `npm run build:pages` then `npm run test:pages`: regression tests of the static local-mode build when no Supabase values are set.

The actual Supabase project, confirmation email delivery and production permissions still need the live verification in step 7 after you create the project.
