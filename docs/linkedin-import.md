# Import av jobb med annonsläsning

## Lägg till ett jobb från en länk

Öppna Jobb → Lägg till jobb. Klistra in länken till en annons i Platsbanken eller på LinkedIn och välj Läs uppgifter. Titel, arbetsgivare, annonslänk och annonstext fylls i när de finns tillgängliga. En uttrycklig sista ansökningsdag fylls också i. Granska uppgifterna, öppna Annons och anteckningar för att kontrollera underlaget och välj Spara jobb. Inget sparas före detta steg.

Platsbanken läses från Arbetsförmedlingens publika JobTech-API direkt i webbläsaren. Det kräver ingen extra serverinstallation, token eller AI-tjänst. Bara annonsens id skickas; inga uppgifter från användarkontot följer med. Annonslänken sparas utan spårningsparametrar, och olika länkar till samma Platsbanken-annons hanteras som dubbletter.

Om annonsen har tagits bort eller källan inte kan nås finns länken kvar i granskningen. Klistra in annonstexten eller komplettera uppgifterna manuellt. Länkar till andra webbplatser kan sparas med manuellt ifyllda uppgifter eller inklistrad annonstext. Automatisk läsning stöder Platsbanken och LinkedIn.

## Importera flera LinkedIn-jobb

Den manuella länkeimporten är publicerad. Automatisk annonsläsning använder den installerade serverfunktionen `quick-responder`.

1. Öppna Jobb → Fler verktyg → Importera flera LinkedIn-jobb och klistra in en jobblänk per rad, högst 100.
2. Välj Granska jobben. Två annonser åt gången läses från sina publika LinkedIn-sidor. Dubbletter hämtas inte.
3. Titel, arbetsgivare, ort, anställningsform, publiceringsdatum, eventuell lön och annonstext fylls i när uppgifterna finns. En uttrycklig sista ansökningsdag kan fyllas i; annonsens giltighetstid visas separat och antas inte vara sista ansökningsdag.
4. Granska och rätta uppgifterna. Egna ändringar bevaras även om ett svar kommer senare. Hämtningen går att avbryta.
5. Importera valda jobb som utkast. Annonslänk och beskrivning sparas i Dokumentunderlag. Övriga annonsuppgifter sparas i anteckningarna. Valda nästa steg använder samma befintliga flöde till veckovyn; ingen tid bokas automatiskt.

LinkedIn kan blockera anrop eller kräva inloggning. Då visas ett tydligt fel per annons. Öppna annonsen, fäll ut Annonsens text och reservimport och klistra in texten. Märkta rubriker som Tjänst:, Arbetsgivare: och Ort: kan läsas. Annan text sparas som annonsunderlag och okända fält kompletteras vid granskningen. Inga fält gissas från URL-sluggen.

Detta läser enskilda annonser; det ansluter inte till kontots lista över sparade jobb och använder inte LinkedIn-kakor eller lösenord. Serverhämtningen kräver ett inloggat Veckoverket-konto.

## Installation direkt i Supabases webbgränssnitt

Ingen access token, Codespaces eller lokal installation behövs för detta alternativ.

1. Öppna projektet i Supabase och gå till Edge Functions.
2. Skapa en ny funktion i webbeditorn med namnet `quick-responder`.
3. Kopiera hela `docs/linkedin-job-dashboard.txt` till editorns `index.ts`, inklusive importen överst. Ersätt all exempelkod.
4. Publicera funktionen.
5. Stäng av `Verify JWT` / `Verify JWT with legacy secret` för just `quick-responder`. Funktionen verifierar själv användarens session med Supabase Auth, precis som versionen för CLI gör.

Standardvärdena för Supabase-projektets URL och service-nyckel finns i Edge Functions-miljön. Appens origin är `https://andycdn.github.io` om inte `APP_ORIGIN` är angiven. Ingen LinkedIn-token eller OpenAI-nyckel behövs.

`docs/linkedin-job-dashboard.txt` genereras från de ordinarie fyra källfilerna med `node scripts/build-linkedin-dashboard.mjs`. Kör om generatorn efter ändringar i dessa källfiler. Filens syntax, startpunkt, autentisering, CORS och jobbläsning har kontrollerats med styrda svar.

## Installation via terminal, som alternativ

Lägg `SUPABASE_ACCESS_TOKEN` som hemlighet i den miljö där terminalkommandot körs. Använd samma Supabase-projekt som appen. Kör:

```bash
npm run deploy:linkedin-job
```

Skriptet uppdaterar `quick-responder`, samma funktion som webbplatsen använder. `LINKEDIN_JOB_FUNCTION=linkedin-job` kan användas för det ursprungliga funktionsnamnet.

`SUPABASE_PROJECT_REF` kan ange annat projekt; standard är appens nuvarande projekt. Funktionen använder Supabases befintliga `SUPABASE_URL` och `SUPABASE_SERVICE_ROLE_KEY`. `APP_ORIGIN` är webbplatsens origin (standard `https://andycdn.github.io`). Inga databasändringar behövs.

Appen använder ordinarie `NEXT_PUBLIC_SUPABASE_URL` och publik Supabase-nyckel. GitHub Pages-bygget kopplar till `quick-responder` i samma projekt om ingen annan `NEXT_PUBLIC_LINKEDIN_JOB_ENDPOINT` har angetts. Den valfria `NEXT_PUBLIC_LINKEDIN_JOB_ENDPOINT` tillåter en endpoint på samma origin som appen eller det konfigurerade Supabase-projektet; den används för isolerade webbläsartester. Sessionstoken skickas bara till appens metadatafunktion, aldrig till LinkedIn. Granskningen skriver inga jobb eller kalenderpass innan användaren väljer att importera.

Servern tillåter bara validerade LinkedIn-jobblänkar och omdirigeringar till samma jobb. Den begränsar svarsstorlek, tid, samtidighet i klienten och anrop per användare i den aktuella funktionsinstansen. Fel och annonstext returneras som data, inte aktiv HTML.

## Kontroll

`npm test -- --maxWorkers=1 --no-file-parallelism` testar parser, dubbletter, formulärdata och serverhanterare. `npm run test:linkedin` bygger en separat testkonfiguration och testar automatisk ifyllning, bevarad egen titel och blockerad annons med inklistrad reservtext på desktop/mobil. LinkedIn-svar är styrda testdata; de garanterar inte att LinkedIn släpper igenom ett verkligt anrop. Vanliga import- och bokningstester finns i `e2e/linkedin-import.spec.ts`.

`e2e-cloud/job-link-import.spec.ts` kontrollerar Platsbanken-import på desktop och mobil: granskning av alla fyra uppgifter, egen redigering, sparning och omladdning, dubbletter och manuell komplettering av en borttagen annons. API-svaren och kontot är styrda testdata.
