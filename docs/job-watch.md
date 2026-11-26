# Jobbspaning

Jobbspaningen kombinerar det befintliga publicerade urvalet med automatisk läsning av [Ideella jobb](https://ideellajobb.se/jobs/) och [Stockholms stads jobbdatabas](https://jobba.stockholm/lediga-jobb/).

Det automatiska urvalet gäller Stockholmsområdet eller distans och titlar inom utredning, handläggning, projektledning, samordning, kommunikation, påverkan och verksamhetsledning. Kliniska vårdroller, socialsekreterare och förskole-/rektorsroller ingår inte. Det är ett titel- och ortsfilter, inte en individuell bedömning av behörighet. Filteruttrycken finns i `scripts/job-watch-sources.mjs`; beskrivningen i appen finns i `src/lib/job-watch-config.ts`.

## Hämtning och publicering

GitHub Actions-flödet **Update job sources** körs dagligen kl. 06.17 UTC och när källkoden för hämtningen ändras på `main`. Det kan också köras manuellt via **Actions → Update job sources → Run workflow**. GitHubs schemalagda körningar kan bli fördröjda.

`npm run scan:jobs` hämtar alla sidor i de publika annonslistorna, inklusive Ideella jobbs **Visa fler**, filtrerar och läser hela annonstexten för matchande jobb. Titeln kontrolleras mot annonsen. Titel, organisation/förvaltning, annonslänk, ort, sista ansökningsdag, fulltext och eventuell separat ansökningslänk publiceras i `public/jobbspaning.json`. Inga konton, privata ansökningar eller kalenderuppgifter läses av flödet. Saknas förvaltning i Stockholms stads lista används den övergripande organisationen Stockholms stad.

Källflödet skriver endast denna JSON-fil med arbetsflödets `contents: write`-behörighet och GitHubs inbyggda token. Inga egna token eller Supabase-funktioner behöver installeras. Eftersom en push med GitHubs inbyggda token inte startar Pages-flödet läser appen i första hand senaste JSON-filen från `main`. Den publicerade Pages-kopian används om den läsningen misslyckas. Nästa vanliga apppublicering uppdaterar även reservkopian. Hämtningar från källorna är begränsade till två samtidiga anrop per källa och följer aldrig en annonslänk till en annan värd.

Ett misslyckat källanrop eller förändrat sidformat ger felstatus. Tidigare fortfarande öppna annonser från den källan bevaras med datumet för senaste lyckade hämtningen; andra källor kan uppdateras. Vid en lyckad hämtning ersätts enbart den källans tidigare poster, så att borttagna och utgångna annonser försvinner. Ursprungliga manuella poster bevaras. Arbetsflödet publicerar även felstatusen och markerar sedan körningen som misslyckad.

## I appen

**Jobb → Jobbspaning → Källor och sökurval** visar källorna, sökurvalet och respektive källas senaste kontroll. **Uppdatera** hämtar den senaste rapporten; knappen startar inte en ny genomsökning av externa sajter.

Samma titel, organisation och sista ansökningsdag från flera källor visas som ett annonskort, med källänkarna kvar. Befintliga sparade eller bortvalda källänkar döljer även motsvarande kort. **Granska jobbet** använder publicerad fulltext, vilket gör att dessa nya källor inte behöver läsas direkt från webbläsaren. Inget sparas före **Spara jobb**. Den separat lästa ansökningslänken följer med till ansökningsflödet. Kalendern ändras inte av hämtningen eller granskningen.
