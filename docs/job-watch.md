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

**Att granska** visar hela det kvarvarande urvalet, inklusive jobb som behöver kompletterat underlag eller närmare granskning. Jobb som tydligt gäller en annan yrkesinriktning eller ligger utanför Stockholmsområdet utan angivet distansarbete sorteras automatiskt till **Bortsorterade**. Där visas orsaken och originalannonsen; **Ta vidare** kan fortfarande väljas manuellt. Tydliga yrkestitlar som sjuksköterska eller systemutvecklare kan sorteras bort även när fulltext saknas. Policy- och kommunikationsroller sorteras inte bort enbart för att ämnet eller målgruppen gäller forskning eller teknik.

Uttryckligt helt distansarbete gör att ett relevant jobb kan behållas oavsett arbetsgivarens ort. Oklara distansvillkor lämnas för granskning. Sorteringen görs om när annonsunderlag eller privata kravbedömningar ändras och skriver inga automatiska bortval. Att byta visning ändrar inga ansökningar eller bortval. Ett manuellt bortvalt eller sparat jobb lämnar listan och ger plats för nästa granskade träff.

Redan granskade jobb som liknar roller i aktiva ansökningar prioriteras extra. Endast roll och aktiv status används som intressesignal, på användarens enhet. Avslagna eller avslutade ansökningar ger ingen sådan signal. Ett specialistkrav eller ofullständigt underlag kan inte åsidosättas av likheten, och likheten är inte ett bevis på behörighet. Inga privata ansökningsuppgifter skickas till källorna eller skrivs till det publika annonsflödet.

Granskningen använder förklarbara regler på annonsinnehållet. Prioritering betyder överensstämmelse med sökinriktningen. Personlig kravbedömning använder det privata CV-underlaget och användarens bekräftelser enligt nedan. Kravlistan är ett urval ur underlaget; den fullständiga annonsen kan alltid öppnas före beslut. Ingen separat AI-tjänst, API-nyckel eller ändring av kalendern krävs.

**Jobb → Jobbspaning → Källor och sökurval** visar källorna, sökurvalet och respektive källas senaste kontroll. **Uppdatera** hämtar den senaste rapporten; knappen startar inte en ny genomsökning av externa sajter.

Samma titel, organisation och sista ansökningsdag från flera källor visas som ett annonskort, med källänkarna kvar. Befintliga sparade eller bortvalda källänkar döljer även motsvarande kort. **Ta vidare** sparar ett nytt jobb med fullständigt annonsunderlag direkt som utkast och öppnar nästa steg. Möjliga dubbletter och ofullständiga underlag öppnas först för granskning. Den separat lästa ansökningslänken följer med till ansökningsflödet. Kalendern ändras inte.

## Bedöm senare och bortval

**Bedöm senare** väljer en återkomstdag efter idag och senast sista ansökningsdagen. Jobbet ligger under **Bedöm senare** tills dess och kommer tillbaka överst bland startjobben på den valda dagen, även om det behöver granskas närmare eller annars skulle sorteras bort automatiskt. Det uttryckligt valda återkomstdatumet går före filtret. **Bedöm nu** hämtar tillbaka det tidigare; **Ändra återkomstdatum** ändrar valet. Om annonsen inte finns i senaste flödet finns originallänken kvar för kontroll. Passerade ansökningsdagar visas inte som nya öppna jobb.

**Ointressant** döljer alla kända annonskällor för jobbet. Ett frivilligt bortvalsskäl kan anges efteråt. Endast **Fel inriktning** sänker liknande rollers prioritet lokalt; ett bortval på grund av placering eller krav blir inte ett generellt yrkesfilter. **Ångra bortval** återställer hela jobbet, inklusive alternativa källänkar. **Visa bortvalda jobb igen** återställer bortvalen utan att ändra uppskjutna jobb.

## Privat jämförelse med CV

Öppna **CV för jobbmatchning** i jobbspaningen eller under **Mina jobb → Fler verktyg**. Klistra in grund-CV:t eller välj **Läs in filer (PDF, PowerPoint eller text)**. Flera `.pdf`, äldre `.ppt`, nyare `.pptx` och `.txt`-/`.md`-filer kan väljas tillsammans: högst tio filer, 20 MB per fil och 60 MB sammanlagt. Den samlade CV-texten får vara högst 60 000 tecken. För Word kopieras texten till fältet. En länk till en separat CV-chatt ger inte appen tillgång till dess dokument.

Filväljaren visar alla filtyper för att PPT-filer även ska kunna väljas från filappar som märker dem med en annan eller okänd filtyp. Appen kontrollerar de valda filernas format vid inläsningen och visar ett fel för format som inte stöds.

PowerPoint-texter från rubriker, textrutor och tabeller läggs till i befintligt underlag med filnamn och bildnummer. Fasta texter i de bildmallar och sidlayouter som bilderna använder tas också med; mallarnas exempeltexter i platshållare hoppas över. Presentationens bildordning följs. Dolda bilder och talaranteckningar tas inte med; bildfiler och skärmbilder tolkas inte med OCR. Resultatet visar lästa filer, bilder utan läsbar text och eventuella fel. Vid ett läsfel kan **Visa teknisk felorsak** öppnas för att se tillgänglig felkod och orsak. PowerPoint-format som är äldre än 97–2003 behöver sparas om till `.pptx` i PowerPoint först. Samma importerade text dubbleras inte. Ett fel i en fil raderar inte tidigare text eller andra lyckade importer. En import som överskrider textgränsen avvisas utan att kapas. **Spara CV-underlag** sparar den granskade texten, medan **Avbryt** lämnar kontots tidigare underlag kvar.

PDF läses sida för sida i dokumentets ordning med filnamn och sidnummer som källor. En fil får innehålla högst 250 sidor; filer som överskrider sid- eller textgränsen avvisas hela. Sidmetadata, bilagor och kommentarer läses inte in som CV-innehåll. Tomma sidor hoppas över och räknas i resultatet. Lösenordsskyddade, trasiga och skannade filer utan text visar separata felorsaker. Läsningen kan försöka igen med en ny fil utan att stänga dialogen.

Läsningen sker på enheten. Endast den extraherade texten med källrubriker sparas i arbetsytan. PDF läses med PDF.js (`pdfjs-dist`), äldre PPT med `@file-viewer/ppt` och PPTX-arkiv med `fflate`. Läsarna laddas först när formatet används. PDF-läsarens worker och teckenresurser publiceras med samma version som paketet under appens egen adress; ingen extern dokument- eller OCR-tjänst används. `dev`, `build` och `build:pages` förbereder dessa resurser automatiskt. Licenserna följer med webbpubliceringen under `public/third-party/`.

**Jämför krav med ditt CV** finns på annonskort och sparade ansökningar. Angivna krav och meriter hålls isär. Relevanta, ordagranna utdrag föreslås med textregler. En ordträff styrker aldrig automatiskt ett krav: **Behöver kontrolleras** gäller tills användaren har bekräftat ett faktiskt CV-utdrag eller markerat **Saknar stöd i CV:t**. Bekräftat stöd måste finnas i det sparade CV-underlaget. Antal år, examensnivå och alternativa meriter behöver kontrolleras mot hela kravet.

Bekräftade krav ger högre lokal prioritet. Ett obligatoriskt krav som användaren markerat utan stöd flyttar jobbet till **Bortsorterade**; en saknad merit gör inte det. Frånvaro av en ordträff i CV-texten räknas aldrig som ett bekräftat saknat krav. Osäkra specialistkrav ligger kvar för granskning. Ett specialistkrav kan prövas genom att användaren bekräftar samtliga urskilda angivna krav. Ändrad CV-text återställer tidigare bedömningar, och borttagning av CV-underlaget tar även bort dessa bedömningar, så sorteringen prövas på nytt. Ansökningar och deras dokumentlänkar bevaras.

CV-text, kravbedömningar, veckans val och beslut sparas i samma privata arbetsyta som ansökningarna och synkas genom befintlig kontolagring. Ingen databasändring krävs. CV-texten skickas inte till annonskällor, AI-tjänster eller det publika GitHub-flödet. Själva jämförelsen sker i webbläsaren. Bedömningen är inte ett intyg om formell behörighet.
