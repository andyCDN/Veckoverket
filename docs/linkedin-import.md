# LinkedIn-import med annonsläsning

Den manuella länkeimporten är publicerad. Automatisk annonsläsning är en granskningsversion som behöver serverfunktionen `linkedin-job` innan den aktiveras på webbplatsen.

1. Öppna Jobb → Importera från LinkedIn och klistra in en jobblänk per rad, högst 100.
2. Välj Granska jobben. Två annonser åt gången läses från sina publika LinkedIn-sidor. Dubbletter hämtas inte.
3. Titel, arbetsgivare, ort, anställningsform, publiceringsdatum, eventuell lön och annonstext fylls i när uppgifterna finns. En uttrycklig sista ansökningsdag kan fyllas i; annonsens giltighetstid visas separat och antas inte vara sista ansökningsdag.
4. Granska och rätta uppgifterna. Egna ändringar bevaras även om ett svar kommer senare. Hämtningen går att avbryta.
5. Importera valda jobb som utkast. Annonslänk och beskrivning sparas i Dokumentunderlag. Övriga annonsuppgifter sparas i anteckningarna. Valda nästa steg använder samma befintliga flöde till veckovyn; ingen tid bokas automatiskt.

LinkedIn kan blockera anrop eller kräva inloggning. Då visas ett tydligt fel per annons. Öppna annonsen, fäll ut Annonsens text och reservimport och klistra in texten. Märkta rubriker som Tjänst:, Arbetsgivare: och Ort: kan läsas. Annan text sparas som annonsunderlag och okända fält kompletteras vid granskningen. Inga fält gissas från URL-sluggen.

Detta läser enskilda annonser; det ansluter inte till kontots lista över sparade jobb och använder inte LinkedIn-kakor eller lösenord. Serverhämtningen kräver ett inloggat Veckoverket-konto.

## Installation direkt i Supabases webbgränssnitt

Ingen access token, Codespaces eller lokal installation behövs för detta alternativ.

1. Öppna projektet i Supabase och gå till Edge Functions.
2. Skapa en ny funktion i webbeditorn med namnet `linkedin-job`.
3. Kopiera hela `docs/linkedin-job-dashboard.txt` till editorns `index.ts`, inklusive importen överst. Ersätt all exempelkod.
4. Publicera funktionen.
5. Stäng av `Verify JWT` / `Verify JWT with legacy secret` för just `linkedin-job`. Funktionen verifierar själv användarens session med Supabase Auth, precis som versionen för CLI gör.

Standardvärdena för Supabase-projektets URL och service-nyckel finns i Edge Functions-miljön. Appens origin är `https://andycdn.github.io` om inte `APP_ORIGIN` är angiven. Ingen LinkedIn-token eller OpenAI-nyckel behövs.

`docs/linkedin-job-dashboard.txt` genereras från de ordinarie fyra källfilerna med `node scripts/build-linkedin-dashboard.mjs`. Kör om generatorn efter ändringar i dessa källfiler. Filens syntax, startpunkt, autentisering, CORS och jobbläsning har kontrollerats med styrda svar.

## Installation via terminal, som alternativ

Lägg `SUPABASE_ACCESS_TOKEN` som hemlighet i den miljö där terminalkommandot körs. Använd samma Supabase-projekt som appen. Kör:

```bash
npm run deploy:linkedin-job
```

`SUPABASE_PROJECT_REF` kan ange annat projekt; standard är appens nuvarande projekt. Funktionen använder Supabases befintliga `SUPABASE_URL` och `SUPABASE_SERVICE_ROLE_KEY`. `APP_ORIGIN` är webbplatsens origin (standard `https://andycdn.github.io`). Inga databasändringar behövs.

Appen använder ordinarie `NEXT_PUBLIC_SUPABASE_URL` och publik Supabase-nyckel. Den valfria `NEXT_PUBLIC_LINKEDIN_JOB_ENDPOINT` tillåter en endpoint på samma origin som appen eller det konfigurerade Supabase-projektet; den används för isolerade webbläsartester. Sessionstoken skickas bara till appens metadatafunktion, aldrig till LinkedIn. Granskningen skriver inga jobb eller kalenderpass innan användaren väljer att importera.

Servern tillåter bara validerade LinkedIn-jobblänkar och omdirigeringar till samma jobb. Den begränsar svarsstorlek, tid, samtidighet i klienten och anrop per användare i den aktuella funktionsinstansen. Fel och annonstext returneras som data, inte aktiv HTML.

## Kontroll

`npm test -- --maxWorkers=1 --no-file-parallelism` testar parser, dubbletter, formulärdata och serverhanterare. `npm run test:linkedin` bygger en separat testkonfiguration och testar automatisk ifyllning, bevarad egen titel och blockerad annons med inklistrad reservtext på desktop/mobil. LinkedIn-svar är styrda testdata; de garanterar inte att LinkedIn släpper igenom ett verkligt anrop. Vanliga import- och bokningstester finns i `e2e/linkedin-import.spec.ts`.
