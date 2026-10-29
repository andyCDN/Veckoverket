# Install Veckoverket

Open [Veckoverket](https://andycdn.github.io/Veckoverket/) in your phone's browser. On mobile, **Verktyg → Installera appen** opens the browser's installation dialog when available, or shows instructions for your device. The same option is available in **Inställningar**.

Use a regular browser tab. Chrome does not allow app installation in Incognito mode.

If you are signed out, **Installera appen** is also available on the sign-in screen.

## iPhone and iPad

1. Open the site in **Safari**.
2. Tap **Share**.
3. Select **Add to Home Screen**. You may need to scroll down in the share sheet.
4. Keep **Open as Web App** enabled if this option appears, then tap **Add**.
5. Open Veckoverket using the new V icon on your Home Screen.

## Android

1. Open the site in **Chrome**.
2. In Veckoverket, choose **Verktyg → Installera appen** and confirm **Install**.
3. If no dialog appears, open Chrome's **⋮** menu and choose **Install app** or **Add to Home screen**.

## Computer

In Chrome or Edge, use the install icon in the address bar or the browser menu's **Install Veckoverket** option. In Safari on macOS, use **File → Add to Dock**.

The installed app opens in its own window. Installation does not create a new account or move data between browsers. Use the same browser and your existing Veckoverket account to access your cloud plan. A plan stored only on one device remains on that device; use cloud storage or JSON export/import when moving it.

## Offline use and updates

Open the app online once so it can save its public interface, icons and assets. It can then reopen that saved interface offline. Local plans keep working, and the existing cloud cache can show a previously loaded account plan when its session is available. Signing in, importing from Google Calendar and syncing to Supabase require a connection.

The service worker caches only the public app shell and an explicit list of static files. It does not cache Google responses, account API responses, access tokens or authentication callback URLs. Workspace data continues to use the existing account-specific storage and sync logic.

New app versions download in the background. An updated service worker waits for existing app windows to close, so it does not reload a form while you are editing. It removes only older Veckoverket caches for the same installation path.

## Build and verify

`npm run build:pages` exports the Next.js site and generates a versioned `out/sw.js`. Both the manifest and service worker use the deployment's `PAGES_BASE_PATH`, including an empty prefix for a custom domain. Development mode does not register the worker, so it does not cache development assets.

Run `npm run test:pages` after building. The browser tests check the manifest, actual PNG dimensions, Chromium installation eligibility, offline startup and persistence, API cache exclusions, installation handling, and preservation of an open form during a worker update.

The icons were generated for Veckoverket's RISO palette and exported as 32, 180, 192 and 512 pixel PNGs. A separate 512 pixel maskable icon adds padding so Android's circular and rounded masks preserve the V and check mark.
