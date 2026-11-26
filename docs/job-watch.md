# Jobbspaning

Jobbspaningen kombinerar det befintliga publicerade urvalet med automatisk läsning av [Ideella jobb](https://ideellajobb.se/jobs/), [Stockholms stads jobbdatabas](https://jobba.stockholm/lediga-jobb/) och [Jobba statligt](https://www.jobbastatligt.se/sok).

Det automatiska urvalet gäller Stockholmsområdet eller distans och titlar inom utredning, handläggning, projektledning, samordning, kommunikation, påverkan och verksamhetsledning. Kliniska vårdroller, socialsekreterare och förskole-/rektorsroller ingår inte. Det är ett titel- och ortsfilter, inte en individuell bedömning av behörighet. Filteruttrycken finns i `scripts/job-watch-sources.mjs`; beskrivningen i appen finns i `src/lib/job-watch-config.ts`.

## Hämtning och publicering

GitHub Actions-flödet **Update job sources** körs dagligen kl. 06.17 UTC och när källkoden för hämtningen ändras på `main`. Det kan också köras manuellt via **Actions → Update job sources → Run workflow**. GitHubs schemalagda körningar kan bli fördröjda.

`npm run scan:jobs` hämtar alla sidor i de publika annonslistorna, inklusive Ideella jobbs **Visa fler**, filtrerar och läser hela annonstexten för matchande jobb. Titeln kontrolleras mot annonsen. Titel, organisation/förvaltning, annonslänk, ort, sista ansökningsdag, fulltext och eventuell separat ansökningslänk publiceras i `public/jobbspaning.json`. Inga konton, privata ansökningar eller kalenderuppgifter läses av flödet. Saknas förvaltning i Stockholms stads lista används den övergripande organisationen Stockholms stad.

Källflödet skriver endast denna JSON-fil med arbetsflödets `contents: write`-behörighet och GitHubs inbyggda token. Inga egna token eller Supabase-funktioner behöver installeras. Eftersom en push med GitHubs inbyggda token inte startar Pages-flödet läser appen i första hand senaste JSON-filen från `main`. Den publicerade Pages-kopian används om den läsningen misslyckas. Nästa vanliga apppublicering uppdaterar även reservkopian. Hämtningar från källorna är begränsade till två samtidiga anrop per källa. Godtyckliga externa annonslänkar följs inte.

Jobba statligts offentliga sökmodell används för källans annonsurval. Sökningar som överskrider portalens gräns på 250 annonser delas efter de publicerade yrkes-, orts- och myndighetsfiltren. Övergripande yrkesrubriker översätts till sina faktiska underkategorier, på samma sätt som sajtens filterformulär. Ett ofullständigt eller oläsbart urval ger felstatus, inte ett tomt lyckat resultat.

Jobba statligt hämtar sina annonser från Platsbanken. För utvalda annonser läser adaptern motsvarande exakta annons-id från det publika JobTech-API:et. Därifrån kommer fulltext, arbetsgivare, faktisk ort, exakt ansökningsdag med årtal och ansökningslänk. Portalens korta datum används inte för att gissa ett årtal. Originalets ort granskas mot sökurvalet igen. Jobba statligts egen annonslänk och Platsbanken-länken bevaras tillsammans. Borttagna original visas inte som nya öppna jobb; övriga läsfel behåller senaste lyckade hämtningen. API-läsningen är begränsad till `https://jobsearch.api.jobtechdev.se/ad/{annons-id}` utan kontouppgifter.

Ett misslyckat källanrop eller förändrat sidformat ger felstatus. Tidigare fortfarande öppna annonser från den källan bevaras med datumet för senaste lyckade hämtningen; andra källor kan uppdateras. Vid en lyckad hämtning ersätts enbart den källans tidigare poster, så att borttagna och utgångna annonser försvinner. Ursprungliga manuella poster bevaras. Arbetsflödet publicerar även felstatusen och markerar sedan körningen som misslyckad.

Tillfälliga nätavbrott, timeout och HTTP 5xx får högst tre försök med en respektive tre sekunders väntan. Nekad åtkomst, borttagna sidor och HTTP 429 upprepas inte. Vid bestående fel visas den senast lyckade hämtningen enligt ovan.

## I appen

Jobbspaningen börjar med högst åtta **Prioriterade** jobb. Titelträffen måste ha stöd i fullständig annonstext: relevanta arbetsuppgifter, en känd placering och urskiljbara krav. Ett kort förklarar varför jobbet lyfts fram, visar ett utdrag ur arbetsbeskrivningen och erbjuder **Utvalda krav ur annonsen**, med angivna krav och meriterande erfarenheter åtskilda. Likvärdiga utbildnings- och erfarenhetsalternativ bevaras i utdragen.

Specialistroller och uttryckliga specialistkrav prövas före generell titelmatchning. Teknisk kommunikation, forskarroller och exempelvis krav på fysik- eller juridikutbildning ger inte automatiskt en rekommendation för policy-/kommunikationsurvalet. En meriterande specialistexamen behandlas inte som ett obligatoriskt krav. Arbetsgivarens namn är inte en yrkesroll: delsträngen `kansli` i Regeringskansliet räcker inte längre för insamling.

**Alla träffar** visar även jobb som behöver kompletterat underlag, kräver närmare granskning eller ligger utanför nuvarande sökinriktning. Att byta visning ändrar inga ansökningar eller bortval. Ett bortvalt eller sparat jobb lämnar den prioriterade listan och ger plats för nästa granskade träff.

Redan granskade jobb som liknar roller i aktiva ansökningar prioriteras extra. Endast roll och aktiv status används som intressesignal, på användarens enhet. Avslagna eller avslutade ansökningar ger ingen sådan signal. Ett specialistkrav eller ofullständigt underlag kan inte åsidosättas av likheten, och likheten är inte ett bevis på behörighet. Inga privata ansökningsuppgifter skickas till källorna eller skrivs till det publika annonsflödet.

Granskningen använder förklarbara regler på annonsinnehållet. Prioritering betyder överensstämmelse med sökinriktningen, inte att användarens utbildning eller erfarenhet har verifierats mot kraven. Någon CV-profil är ännu inte ansluten till matchningen. Kravlistan är ett urval ur underlaget; den fullständiga annonsen kan alltid öppnas före beslut. Ingen separat AI-tjänst, API-nyckel eller ändring av kalendern krävs.

**Jobb → Jobbspaning → Källor och sökurval** visar källorna, sökurvalet och respektive källas senaste kontroll. **Uppdatera** hämtar den senaste rapporten; knappen startar inte en ny genomsökning av externa sajter.

Samma titel, organisation och sista ansökningsdag från flera källor visas som ett annonskort, med källänkarna kvar. Befintliga sparade eller bortvalda källänkar döljer även motsvarande kort. **Granska jobbet** använder publicerad fulltext, vilket gör att dessa nya källor inte behöver läsas direkt från webbläsaren. Inget sparas före **Spara jobb**. Den separat lästa ansökningslänken följer med till ansökningsflödet. Kalendern ändras inte av hämtningen eller granskningen.
