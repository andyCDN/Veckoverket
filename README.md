# Veckoverket

En svensk webbapp för veckoplanering, målhantering och uppföljning.

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

Demoläget kräver inga externa nycklar. Varje besökares plan sparas i den egna webbläsaren. Lokal data från utvecklingsadressen följer inte automatiskt med till GitHub-adressen; använd export/import om du vill flytta planen. Vid en framtida Supabase-anslutning behöver de publika variablerna sättas vid Pages-bygget och den publicerade adressen tillåtas i Supabase Auth.

## Det som fungerar

- Svensk kalender med måndag som veckostart och rullbart veckoschema på mobil och surfplatta. Separata vyer för översikt, planerare, mål, inställningar och reflektion.
- Varje kalenderhändelse har en kryssruta för Genomförd. Markeringen kan återställas och sparas med planen; genomförd tid visas i veckoreflektionen.
- Skapa, redigera, ta bort och dra aktiviteter mellan dagar och tider. Tiden snäpps till 15 minuter. Alla redigeringar kan göras utan mus, via formuläret.
- Låst tid kan bara ändras uttryckligen i formuläret eller genom inställningarna; den kan inte dras. Skyddad tid flyttas som ett helt block om dess regel tillåter det.
- Regelbaserad planering med redigerbara dagar, tider, lunch, familjetid, tidsbudgetar, prioriteringar, passlängd, buffert och helger. Egna livsområden stöds.
- En eller två hela musikförmiddagar, två eller tre träningspass. Omedelbar förhandsvisning av utrymmet i inställningarna, med förklaringar vid kapacitetsbrist.
- Långsiktiga mål, veckomål, uppgifter, aktiviteters målkoppling, genomförd tid och veckoreflektion. Tid och resultat visas separat.
- Återkommande aktiviteter varje vecka eller varje vardag. Befintliga och tidigare veckor bevaras. Nya veckor genereras vid navigering. Regeln läggs även in när en befintlig vecka genereras om.
- Automatisk lokal lagring, JSON-export och validerad import. Korrupt lagring skrivs inte över. Vid lagringsfel visas ett meddelande; exportera då en säkerhetskopia.
- Valbar Supabase-inloggning och explicit spara/hämta av hela arbetsytan. Se nedan.

## Planeringsregler och antaganden

`src/lib/planner.ts` är en fristående, deterministisk modul. Den tar in regler och data och returnerar ett veckoförslag samt konflikter. Den använder inte AI eller externa API:er.

1. Hårda begränsningar: tillgänglighet, låsta åtaganden, inga överlappningar, buffert och sammanhängande skyddade pass. Egna och flyttade aktiviteter samt registrerade utfall bevaras vid generering. Ändrade inställningar ersätter systemets oredigerade tidsreservationer. Förslag med hårda konflikter kan inte appliceras.
2. Mjuka preferenser: musik tisdag/fredag, träning efter lunch, studier onsdag/torsdag. En annan giltig placering är tillåten när det behövs.
3. Optimeringsmål: skapa skyddade pass först, tillgodose kategorier i prioritetsordning (5 först), fyll sedan återstående giltiga luckor med jobbsökande. Detta är en enkel heuristik, inte en globalt optimal sökalgoritm. Den kan därför föreslå omprioritering även när en annan manuell placering skulle kunna passa.

Standardveckan ger 25 timmar utöver lunch och familjetid: 10 h kompetens, 7 h musik, 3 h träning och 5 h jobbsökande. Med en musikförmiddag blir jobbtiden 8,5 h. Jobbsökandets 5 h är en **redigerbar miniminivå**, så ett tredje 90-minuterspass vid två musikförmiddagar ger en synlig brist på 90 minuter i stället för att tyst ta jobbtid. Med en musikförmiddag finns faktisk kapacitet för tre träningspass.

Buffert gäller mellan aktiviteter, även intill lunch och familjetid, men inte mellan två låsta åtaganden. En hel musikförmiddag fram till lunch och en positiv buffert före lunch går därför inte ihop; detta rapporteras. Tidigare veckor påverkas inte när inställningarna ändras. Varje genererad vecka sparar en kopia av sina regler och tidsmål för historisk jämförelse. Skyddade musikpass behåller sin plats vid omgenerering om automatisk flytt inte är tillåten; ett uttryckligen minskat antal frigör överflödiga genererade förmiddagar. Genomförd tid baseras på hela aktivitetslängden för statusen Genomförd, inte på en inbyggd tidtagare. Överhoppade aktiviteter redovisas som planerade men inte genomförda.

Återkommande regler startar på det valda datumet. Ändring av en series tider uppdaterar framtida, planerade tillfällen atomiskt om inga hårda konflikter uppstår. Ändring av veckodagar används vid kommande generering; befintliga tillfällens datum flyttas inte automatiskt. Borttagning av regeln i inställningarna lämnar befintliga tillfällen kvar. Kalenderns ”Ta bort serien” tar också bort framtida planerade tillfällen. Om ett enskilt tillfälle tas bort kan regeln återskapa det vid en ny generering; undantag för enstaka datum är ännu inte implementerade.

Datum lagras som lokala `YYYY-MM-DD`, tider som minuter från midnatt i Europe/Stockholm. Ren datumaritmetik använder UTC mitt på dagen för att undvika fel vid sommar-/vintertid. Framtida kalenderintegration ska konvertera externa tidsstämplar vid integrationsgränsen.

## Struktur

```text
src/app/                  Next.js App Router och global stil
src/components/           Presentation och användarflöden
src/lib/types.ts          Domänmodell och gränssnitt för framtida integrationer
src/lib/planner.ts        Planering, kapacitet och hård validering
src/lib/date.ts           Datum och svensk presentation
src/lib/defaults.ts       Exempelprofil och startvärden
src/lib/storage.ts        Lokal lagring, import/export och validering
src/lib/supabase.ts       Valbar autentiserad molnlagring
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

## Valbar Supabase

1. Skapa ett Supabase-projekt och kör `supabase/migrations/202610290001_initial.sql` i SQL-editorn eller via Supabase CLI.
2. Kopiera `.env.example` till `.env.local` och ange projektets URL samt dess publika anon-nyckel. Använd aldrig en service-role-nyckel i klienten.
3. Aktivera e-post/lösenord i Supabase Auth. Bekräftelsemejl styrs av projektets inställningar. Starta om appen (och bygg om en produktionsbuild när publika miljövariabler ändras).
4. Öppna ”Lokalt demoläge” eller ”Konto & molnlagring”. Skapa ett konto eller logga in och välj sedan Spara eller Hämta.

Adaptern lagrar MVP-arbetsytan som ett atomiskt, versionsmärkt JSON-dokument i `workspaces`. Migrationen förbereder dessutom normaliserade tabeller för profiler, livsområden, mål, uppgifter, aktiviteter, återkommande regler, planeringsregler och reflektioner. Dessa domäntabeller fylls inte av den nuvarande dokumentadaptern. Samtliga tabeller har RLS med `auth.uid() = user_id`; anonyma användare får ingen åtkomst. Sammansatta främmande nycklar i domäntabellerna förhindrar referenser till andra användares data.

Molnsparning är uttrycklig, inte automatisk synk. Senast sparade dokument gäller; samtidiga redigeringar har ingen konfliktlösning. Lokal data ligger kvar efter utloggning – exportera och återställ demoläget om du använder en delad enhet. Supabase-flödet och RLS behöver integrationstestas mot ett konfigurerat projekt; lokala tester kräver inga inloggningsuppgifter.

## Begränsningar och nästa steg

Den första versionen är en lokalt fungerande MVP. Den har ingen Google Calendar-synk, AI-tolkning, automatisk historikbaserad optimering, notifieringar eller samarbete mellan flera användare. Integrationsgränssnitt finns i `types.ts`; externa förslag ska alltid gå genom samma regelvalidering.

De tre viktigaste nästa stegen är:

1. Verifiera Supabase Auth och RLS i ett riktigt testprojekt, införa versionskontroll vid molnsparning och besluta om normaliserad lagring.
2. Utöka motorn med sökning efter alternativa giltiga placeringar, undantag för återkommande aktiviteter och godkända omprioriteringar.
3. Implementera Google Calendar via en separat connector, följt av en AI-assistent som enbart lämnar validerbara förslag.
