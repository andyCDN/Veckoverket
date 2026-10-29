# Veckoverket

En svensk webbapp för veckoplanering, målhantering och uppföljning.

Appen kan installeras på hemskärmen med en egen RISO-ikon. På mobilen finns **Installera appen** under **Verktyg**, och på datorn finns alternativet i **Inställningar**. Följ [installationsguiden på engelska](docs/install-app.md). Den sparade appvyn kan öppnas utan nät; inloggning, molnsynk och Google-import kräver anslutning.

## Starta lokalt

Kräver Node.js 22 eller 24 och npm. Node 24 har använts vid verifiering.

```sh
npm ci
npm run dev
```

Öppna `http://localhost:3000` i din egen lokala miljö. Inga API-nycklar, databaser eller konton behövs. För produktion: `npm run build` följt av `npm start`.

## Publicera med GitHub Pages

Projektet innehåller `.github/workflows/pages.yml`. Flödet testar, bygger och publicerar den statiska appen vid push till `main`. Det kan också startas manuellt via **Actions → Deploy Veckoverket to GitHub Pages → Run workflow**.

Första gången:

1. Öppna **Settings → Pages** i GitHub-arkivet.
2. Under **Build and deployment → Source**, välj **GitHub Actions**.
3. Öppna **Actions → Deploy Veckoverket to GitHub Pages → Run workflow**, välj `main` och starta flödet om det första försöket hann köras innan Pages aktiverades.
4. När jobbet **deploy** är grönt öppnar du länken i körningens **github-pages**-miljö. Standardadressen är `https://andycdn.github.io/Veckoverket/`.

Om publicering är begränsad av arkivets synlighet eller organisationens inställningar behöver Pages tillåtas av en administratör. GitHub Actions-tokenet används automatiskt; inga egna åtkomsttoken behövs i flödet.

### Testa samma statiska version lokalt

```sh
npm run build:pages
npm run preview:pages
```

Förhandsvisningen serverar `out/` på `http://localhost:4173/Veckoverket/`. Kör `npm run test:pages` efter bygget för att testa hela webbläsarsviten mot de exporterade filerna; testverktyget startar förhandsvisningen automatiskt.

`build:pages` aktiverar `output: "export"` och `trailingSlash` utan att ändra den vanliga utvecklingsservern. Standardprefixet är `/Veckoverket`. GitHubs `configure-pages` levererar rätt prefix i Actions, även för en egen domän där prefixet är tomt. För en lokal export under ett annat prefix sätter du samma `PAGES_BASE_PATH` vid både bygge och förhandsvisning. `npm start` används för det vanliga serverbygget, inte för `out/`.

Utan ett konfigurerat molnprojekt sparas planen på den här enheten. Med Supabase anslutet krävs inloggning och planen läses och sparas automatiskt i kontot. GitHub Actions läser projektets publika anslutningsuppgifter från repository variables. Följ [den stegvisa installationsguiden på engelska](docs/cloud-setup.md) för att skapa projektet, installera databasen och aktivera molnlagring på den befintliga Pages-adressen.

## Det som fungerar

- Svensk kalender med måndag som veckostart. Telefonen visar dagens aktiviteter i en dagsagenda med stora tryckytor och dagbyte; surfplattan och datorn visar veckoschema. Separata vyer för översikt, planerare, mål, inställningar och reflektion.
- Varje kalenderhändelse har en kryssruta för Genomförd. Markeringen kan återställas och sparas med planen; genomförd tid visas i veckoreflektionen.
- Skapa, redigera och ta bort aktiviteter. Dra till en annan dag med samma starttid; ändra datum och klockslag i formuläret. Alla redigeringar kan göras utan mus.
- Låst tid kan bara ändras uttryckligen i formuläret eller genom inställningarna; den kan inte dras. Skyddad tid flyttas som ett helt block om dess regel tillåter det.
- Regelbaserad planering med redigerbara dagar, tider, lunch, familjetid, tidsbudgetar, prioriteringar, passlängd, buffert och helger. Egna livsområden stöds.
- En eller två hela musikförmiddagar, två eller tre träningspass. Omedelbar förhandsvisning av utrymmet i inställningarna, med förklaringar vid kapacitetsbrist.
- Långsiktiga mål, veckomål, uppgifter, aktiviteters målkoppling, genomförd tid och veckoreflektion. Tid och resultat visas separat.
- Återkommande aktiviteter varje vecka eller varje vardag. Befintliga och tidigare veckor bevaras. Nya veckor genereras vid navigering. Regeln läggs även in när en befintlig vecka genereras om.
- Automatisk lokal lagring, JSON-export och validerad import. Korrupt lagring skrivs inte över. Vid lagringsfel visas ett meddelande; exportera då en säkerhetskopia.
- Google Kalender för Gmail- och Google-konton: välj kalendrar, förhandsgranska och importera bokningar. Upptagen tid ingår i planeringen; importerade händelser kan bockas av. [Installationsguide på engelska](docs/google-calendar-setup.md).
- Supabase-inloggning med automatisk hämtning och sparning av hela kontots arbetsyta, en separat enhetscache, återhämtning efter avbrott och revisionskontroll vid samtidiga ändringar. Befintlig lokal plan flyttas efter ett uttryckligt val vid första inloggningen.

## Planeringsregler och antaganden

`src/lib/planner.ts` är en fristående, deterministisk modul. Den tar in regler och data och returnerar ett veckoförslag samt konflikter. Den använder inte AI eller externa API:er.

1. Hårda begränsningar: tillgänglighet, låsta åtaganden, inga överlappningar, buffert och sammanhängande skyddade pass. Egna och flyttade aktiviteter samt registrerade utfall bevaras vid generering. Ändrade inställningar ersätter systemets oredigerade tidsreservationer. Förslag med hårda konflikter kan inte appliceras.
2. Mjuka preferenser: musik tisdag/fredag, träning efter lunch, studier onsdag/torsdag. En annan giltig placering är tillåten när det behövs.
3. Optimeringsmål: skapa skyddade pass först, tillgodose kategorier i prioritetsordning (5 först), fyll sedan återstående giltiga luckor med jobbsökande. Detta är en enkel heuristik, inte en globalt optimal sökalgoritm. Den kan därför föreslå omprioritering även när en annan manuell placering skulle kunna passa.

Standardveckan ger 25 timmar utöver lunch och familjetid: 10 h kompetens, 7 h musik, 3 h träning och 5 h jobbsökande. Med en musikförmiddag blir jobbtiden 8,5 h. Jobbsökandets 5 h är en **redigerbar miniminivå**, så ett tredje 90-minuterspass vid två musikförmiddagar ger en synlig brist på 90 minuter i stället för att tyst ta jobbtid. Med en musikförmiddag finns faktisk kapacitet för tre träningspass.

Buffert gäller mellan aktiviteter, även intill lunch och familjetid, men inte mellan två låsta åtaganden. En hel musikförmiddag fram till lunch och en positiv buffert före lunch går därför inte ihop; detta rapporteras. Tidigare veckor påverkas inte när inställningarna ändras. Varje genererad vecka sparar en kopia av sina regler och tidsmål för historisk jämförelse. Skyddade musikpass behåller sin plats vid omgenerering om automatisk flytt inte är tillåten; ett uttryckligen minskat antal frigör överflödiga genererade förmiddagar. Genomförd tid baseras på hela aktivitetslängden för statusen Genomförd, inte på en inbyggd tidtagare. Överhoppade aktiviteter redovisas som planerade men inte genomförda.

Återkommande regler startar på det valda datumet. Ändring av en series tider uppdaterar framtida, planerade tillfällen atomiskt om inga hårda konflikter uppstår. Ändring av veckodagar används vid kommande generering; befintliga tillfällens datum flyttas inte automatiskt. Borttagning av regeln i inställningarna lämnar befintliga tillfällen kvar. Kalenderns ”Ta bort serien” tar också bort framtida planerade tillfällen. Om ett enskilt tillfälle tas bort kan regeln återskapa det vid en ny generering; undantag för enstaka datum är ännu inte implementerade.

Datum lagras som lokala `YYYY-MM-DD`, tider som minuter från midnatt i Europe/Stockholm. Ren datumaritmetik använder UTC mitt på dagen för att undvika fel vid sommar-/vintertid. Google-importen konverterar externa tidsstämplar vid integrationsgränsen, inklusive tidsomställningar och händelser över midnatt.

## Struktur

```text
src/app/                  Next.js App Router och global stil
src/components/           Presentation och användarflöden
src/lib/types.ts          Domänmodell och gränssnitt för framtida integrationer
src/lib/planner.ts        Planering, kapacitet och hård validering
src/lib/date.ts           Datum och svensk presentation
src/lib/defaults.ts       Exempelprofil och startvärden
src/lib/storage.ts        Lokal lagring, import/export och validering
src/lib/supabase.ts       Supabase Auth och versionskontrollerad molnadapter
src/lib/workspace-sync.ts Automatisk sparning, kontoavgränsad cache och konflikter
src/lib/google-calendar.ts Google Calendar API, import och uppdatering av källhändelser
src/lib/google-time.ts    Tidszoner och uppdelning av externa händelser
src/test/                 Automatiska tester av regler och lagring
e2e/                      Webbläsartester för dator och mobil
supabase/migrations/      PostgreSQL-schema och RLS
```

React, TypeScript, Next.js, dnd-kit och Lucide. CSS använder designvariabler och responsiva layouter utan ett ytterligare komponentramverk. PUNK × RISO v2.5 använder kittets displaystack, Arial för brödtext och Courier New för metadata, utan externa typsnittsanrop. Kalendern visar en aktiv dag och passkort i tidsordning. Missade jobb- och nätverkspass kan följas upp och bokas om med koppling till ursprungspasset. Se [designbeskrivningen](docs/riso-design.md).

## Test och kontroll

```sh
npm test
npm run typecheck
npm run build
npm run test:e2e
```

Webbläsartesterna använder Chromium på `/usr/bin/chromium`. Ange `CHROMIUM_PATH=/annan/sökväg` om det finns någon annanstans. För Playwrights nedladdade Chromium, byt `executablePath` i `playwright.config.ts` till `undefined` och kör `npx playwright install chromium`. Testkonfigurationen startar utvecklingsservern automatiskt om den inte redan körs.

Tester täcker musikalternativen, korrekta kategoritimmar, tredje träningspasset, helgkapacitet, överlappning, skyddade och låsta block, buffert/minimipass, återkommande aktiviteter, årsskifte, tidsomställning och lagring/återläsning. Webbläsartester täcker verkliga formulärflöden, persistens, mobilnavigation och kalender.

## Molnlagring med Supabase

Följ [Activate cloud storage for Veckoverket](docs/cloud-setup.md). Guiden använder de engelska etiketterna i Supabase och GitHub. Koden fungerar med GitHub Pages; den behöver ingen separat webbserver.

För nya projekt räcker `supabase/migrations/202610290002_workspace_sync.sql`. Det är ett fristående, återkörbart SQL-skript som också uppdaterar befintliga installationer. Det tidigare initialschemat förbereder normaliserade domäntabeller; den nuvarande molnadaptern använder i stället ett atomiskt JSON-dokument per konto i `workspaces`.

RLS begränsar alla dokument till det inloggade kontot. `save_workspace` kontrollerar både kontots identitet och förväntad revision, och servern ökar revisionen vid varje uppdatering. En föråldrad enhet kan därför inte tyst skriva över en nyare version. Appen visar konfliktval och export av enhetens kopia.

Automatisk sparning sker efter kort debounce. Uppdateringar hämtas vid inloggning, när sidan åter får fokus, när nätverket återkommer och var 30:e sekund i en synlig flik. Bakgrundshämtning pausas under redigeringsformulär. Väntande ändringar har en separat cache per konto; den gamla lokala lagringsnyckeln laddas aldrig automatiskt upp till ett annat konto. Utloggning tar bort kontots data från gränssnittet.

`npm test` verifierar även synkmotorn och kör SQL-skriptet i lokal PostgreSQL via PGlite, inklusive RLS, ägarkontroll och samtidiga revisionskonflikter. `npm run test:cloud` använder en simulerad Supabase-tjänst för webbläsarflödena. Google-flödena testas med simulerad Google-inloggning och Calendar API. Ett nytt produktionsprojekt måste fortfarande verifieras efter installationen; inga externa Supabase-uppgifter finns i repositoryt.

## Begränsningar och nästa steg

Appen fungerar lokalt och har en förberedd automatisk Supabase-anslutning. Google Kalender har läsande veckoimport med uttrycklig uppdatering; automatisk bakgrundssynk och skrivning till Google ingår inte. Appen har ingen AI-tolkning, automatisk historikbaserad optimering, notifieringar eller samarbete mellan flera användare. Integrationsgränssnitt finns i `types.ts`; externa förslag ska alltid gå genom samma regelvalidering.

De tre viktigaste nästa stegen är:

1. Skapa och anslut ett riktigt Supabase-projekt, verifiera e-post och produktionens RLS enligt installationsguiden och besluta om eventuell normaliserad lagring.
2. Utöka motorn med sökning efter alternativa giltiga placeringar, undantag för återkommande aktiviteter och godkända omprioriteringar.
3. Lägg vid behov till bakgrundsuppdatering via en serverbaserad kalenderanslutning, följt av en AI-assistent som enbart lämnar validerbara förslag.
