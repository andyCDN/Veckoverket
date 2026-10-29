# PUNK × RISO v2.5 / Aktiv dag

Utformningen bygger på det uppladdade kittet `Veckoverket-PUNK-RISO-v2.5-komplett-kit`. Referensens HTML, CSS, JavaScript och förhandsbilder används för utformningen. Prototypens data, lagringsnyckel och separata appmodell används inte.

## Formspråk och struktur

- En kompakt röd masthead med `VECKOVERKET` och `VECKANS SCHEMA` ersätter det tidigare omslaget och mittuppslaget. Huvudnavigation, veckoval, utskrift, planering och nytt pass ligger direkt ovanför kalendern.
- Paletten är papper `#F1EAD6`, ljust papper `#FFF9E9`, svart `#191918`, blått `#243D9B`, rött `#F04B31` och gult `#F9C845`.
- Displaystacken följer kittets Impact/Arial Narrow med Arial/Helvetica som fallback. Metadata använder Courier New. Typsnitt hämtas inte från externa tjänster.
- Tungt raster ligger i masthead, filter och dagrubriker. Passens texter har ljusa läsytor med svagt raster. Innehållet använder sakliga etiketter utan pepp, slogans eller belöningsfraser.
- `src/components/punk.tsx` innehåller `PlannerMasthead`, `WorkspaceTools` och `BackCoverInfo`. `src/app/punk.css` innehåller temat och dess responsiva regler. Gemensamma formulär och vyer använder `globals.css`.
- Planinfo, riktiga mål, uppgifter och tidsfördelning finns i en utfällbar bilaga efter kalendern. Baksidans länkar öppnar veckoreflektion respektive lagringsinställningar.

## Aktiv dag och kalender

En blå fokusremsa visar fullständigt veckodagsnamn och exakt datum. `IDAG` används endast när valt datum är dagens datum i Europe/Stockholm. `VALD DAG` används för övriga datum. På aktuell vecka väljs dagens vardag; andra veckor och helger väljer måndag. Om egna planeringsregler utesluter den dagen används första tillgängliga dag.

Dagrubriker är tangentbordsstyrda knappar med `aria-pressed`. Pilarna flyttar valet inom de planerade dagarna. Nytt pass använder den valda dagen. Den aktiva kolumnen har dubbel svart/röd ram, tydlig etikett, större typografi och cirka 1,9 gånger övriga kolumners bredd.

Pass visas i tidsordning som kort med naturlig höjd, enligt v2.5-referensen. Start- och sluttid visas alltid; kortens höjd representerar inte tidslängden. Dra och släpp flyttar ett tillåtet pass till en annan dag med samma starttid. Redigeringsformuläret används för att ändra klockslag. Befintliga regler för låst och skyddad tid, konflikter och buffertar gäller fortfarande.

Under 950 px kommer den valda dagen först och tar cirka 92 procent av kalenderns bredd. Kalendern rullar internt i sidled; hela dokumentet ska inte få horisontell överströmning. Utskrift återställer kronologisk ordning, lika breda dagar och alla kategorier även efter filtrering och mobilrullning.

## Missade pass och ombokning

Alla händelser har en egen checkbox för genomförd tid. Jobbpass (`career`) och pass med `nätverk` i titel eller beskrivning kan även markeras som missade. Dessa handlingar använder det befintliga statusfältet: `planned`, `done` och `skipped`. Genomförd och missad status kan därför aldrig vara aktiva samtidigt. Förfluten tid ändrar inte status automatiskt.

`src/lib/follow-up.ts` räknar missad tid från de verkliga sparade aktiviteterna. `src/components/follow-up.tsx` visar återstående timmar och ombokningar. Obokad tid från tidigare veckor syns även på senare veckor.

Ett ersättningspass innehåller den valfria kopplingen `followUpOf: { week, activityId }`. Uppföljningen räknas om från ersättningspassens verkliga status, kategori och tidslängd. Förkortning, kategoribyte, missat ersättningspass eller borttagning återför återstående tid. Delbokningar summeras och missade ersättningspass dubbelräknas inte. Det finns ingen separat flagga som kan bli inaktuell.

Ombokningsformuläret föreslår en ledig tid om sådan finns och kontrollerar den med samma planeringsmotor som vanliga pass. Fullbokade veckor kräver att användaren frigör tid eller väljer en annan vecka. Befintliga pass flyttas eller tas inte bort automatiskt.

## Lagring och bevarade funktioner

Lagringsnyckeln `veckoverket.workspace.v1` och filversion 1 är oförändrade. Gamla sparade planer fungerar utan migrering. Den nya valfria kopplingen följer med lokal lagring, säkerhetskopior och appens automatiska Supabase-sparning av hela arbetsytan som JSON. Kopplingen läggs inte i återkommande mallar, så en serie inte skapar nya ombokningar av samma original.

Molnlagringens revisionskontroll installeras med `202610290002_workspace_sync.sql`; följ `docs/cloud-setup.md`. Liveanslutning till Supabase kan verifieras när projektet har skapats. Kategorifiltret ändrar bara visningen; dolda pass ligger kvar i konfliktkontrollen. Användarens kategorier, färger, tider, mål, reflektioner och historik behålls.

## Verifiering

`npm test` testar planeringsmotor, datumval, lagring och ombokningens livscykel. Efter `npm run build:pages` kontrollerar `npm run test:pages` den statiskt exporterade appen: redigering, lagring, avbockning, missat/klart, ombokning över veckogränser, ändring och borttagning av ersättningspass, drag och släpp, filter, utskrift och tillgänglighet.

Google Kalender öppnas från kalenderns verktygsrad eller inställningarna. Importen förhandsgranskas i en dialog med kalenderval, upptagen/ledig tid och planeringskonflikter. Importerade kort använder blått, visar Heldag vid behov och har samma kryssruta för genomförd som övriga pass. Källhändelser redigeras i Google Kalender. Helg- och kvällshändelser visas även utanför planeringsreglerna; lediga poster blockerar inte planering och heldagsposter räknas inte som 24 arbetstimmar.

Layoutkontroller omfattar 1440, 1024, 768, 390 och 320 px. Skärmbilder och PDF sparas i den ignorerade katalogen `test-results/`. Statisk export och typkontroll körs separat. Produktionskonfigurerade Supabase- och Google-anslutningar kräver egna integrationskontroller.
