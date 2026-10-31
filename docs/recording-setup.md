# Samtalsinspelning

Mobilwebbsidan finns på `/Veckoverket/inspelning/`. Öppna den direkt eller från en ansökan, intervju eller kontakt. Startvyn har en stor inspelningsknapp; ingen kategori, rubrik eller koppling behöver väljas i förväg. Logga in med samma Supabase-konto som i Veckoverket. Håll sidan öppen och synlig under samtalet. Start och stopp styrs av användaren; mikrofonen arbetar kontinuerligt mellan dessa åtgärder.

Gränssnittet visar stegen **Spela in → Koppla → Granska**. På dator ligger inspelningskontrollen och panelen **Ljud & bearbetning** bredvid varandra; på mobil följer statuspanelen efter den stora inspelningsknappen. Panelen visar väntande uppladdningar, enhetens transkriberingskö och pågående bearbetning. Kategorisering, åtgärdsgranskning och sammanfattning har egna avsnitt efter stopp. Utseendet ändrar inte inspelningsformat, lagring eller sparade uppgifter.

Efter stopp visas **Kategorisera**. Välj valfri kategori, ändra rubrik och koppla vid behov en ansökan, intervju eller kontakt. **Spara kategorisering** sparar dessa uppgifter även om sammanfattningen ännu inte är klar. Du kan också lämna inspelningen okategoriserad och öppna den från **Tidigare inspelningar** senare. En länk från en ansökan eller kontakt föreslår kopplingen i efterhand; den sparas först när du väljer att spara.

## Egen appikon på hemskärmen

Öppna [inspelningssidan](https://andycdn.github.io/Veckoverket/inspelning/) i mobilens webbläsare och installera just den sidan. På iPhone: **Dela → Lägg till på hemskärmen**. På Android: **⋮ → Installera appen** eller **Lägg till på startskärmen**. Inspelning får en egen röd ikon med en svart inspelningspunkt, eget appnamn och startadress. Veckoverket behåller sin V-ikon.

Om en genväg till inspelningen redan har skapats med den gamla V-ikonen kan den behöva läggas till på nytt från inspelningssidan. Kontrollera att väntande ljud har laddats upp innan en äldre hemskärmsinstallation tas bort. Behåll Veckoverkets vanliga ikon. Befintliga molnplaner och uppladdat ljud berörs inte.

## Aktivera serverdelen

GitHub Pages publicerar gränssnittet. Serverkön, rättelser och versionshistorik installeras i det befintliga Supabase-projektet med kommandot nedan. Det lägger till tabeller och funktioner; ljud, tidigare anteckningar, arbetsytor och kalenderplaner bevaras.

1. Skapa en personlig token under [Supabase → Access Tokens](https://supabase.com/dashboard/account/tokens) med åtkomst till projektet. Anslut den som hemligheten `SUPABASE_ACCESS_TOKEN` i molnmiljön om Codex ska sköta publiceringen. Skriv inte värdet i chatten eller källkoden. Alternativt lägger administratören den som en [Codespaces-hemlighet för repot](https://github.com/andyCDN/Veckoverket/settings/secrets/codespaces).
2. Från projektmappen, där `package.json` finns, kör:

   ```sh
   npm run deploy:recording
   ```

   I en befintlig Codespace hämtas först senaste versionen med `git pull --ff-only origin main`. En ny [Codespace för Veckoverket](https://codespaces.new/andyCDN/Veckoverket) öppnar projektmappen automatiskt. Projektet är som standard `cefzxeproambftvhcgme`. `SUPABASE_PROJECT_REF` kan anges för ett annat projekt.

   Installationsskriptet kör inspelningsmigrationerna, lägger upp `recording` och `recording-worker`, hanterar arbetarens separata servernyckel och installerar en schemalagd kö med Supabase Cron/pg_net och Vault. Docker behövs inte. Inga servernycklar skrivs ut. **Enbart `supabase functions deploy recording` installerar inte dessa nya delar.**

3. Lägg till `RECORDING_AI_KEY` under [Edge Functions → Secrets](https://supabase.com/dashboard/project/cefzxeproambftvhcgme/functions/secrets) för AI-bearbetning. Det befintliga namnet `OPENAI_API_KEY` stöds också. Installationsskriptet ändrar inte en befintlig AI-nyckel. Standardmodellerna är `gpt-4o-mini-transcribe` och `gpt-4.1-mini`; `RECORDING_TRANSCRIPTION_MODEL` och `RECORDING_SUMMARY_MODEL` kan anges på servern. API- och lagringskostnader tillkommer.
4. Kontrollera [Edge Functions](https://supabase.com/dashboard/project/cefzxeproambftvhcgme/functions) och **Integrations → Cron** i samma projekt. Jobbet `veckoverket-recording-worker` körs varje minut som reserv; ändringar i kön väcker också arbetaren direkt. Inspelningssidan visar att serverbearbetning är aktiv först när funktionen, tabellerna, schemaläggningen och servernyckeln finns.

`APP_ORIGIN` är som standard `https://andycdn.github.io`. `recording` verifierar användaren med `Auth.getUser`; `recording-worker` kräver en separat hemlig nyckel och hämtar själv nästa tillåtna jobb ur databasen. Arbetarnyckeln lagras i Supabase Secrets och Vault och lämnar aldrig servern. Klienter kan bara läsa sina egna inspelningar, rättelser, jobb och sammanfattningsversioner. Rättelser och köändringar går via den autentiserade funktionen.

## Ljud och återhämtning

- AudioWorklet skapar självständiga PCM WAV-filer, normalt 20 sekunder vardera. Kortare delar skapas vid paus eller stopp. Ingen fil behöver den föregående filens header för att gå att spela upp.
- Varje del sparas först i IndexedDB på mobilen. Uppladdning försöker igen automatiskt var 15:e sekund och när nätet återkommer. En långsam uppladdning eller AI-kö pausar aldrig mikrofonen. Avslutade samtal som fått ett tillfälligt bearbetningsfel försöker också igen medan sidan är öppen.
- Efter uppladdning läser servern tillbaka filen och verifierar SHA-256. Först efter matchande bekräftelse tas den lokala ljudkopian bort. En liten köpost finns kvar tills transkriberingen är klar. Separata arbetare gör att AI inte blockerar uppladdningar.
- Vid nätavbrott växer den lokala kön. Efter omladdning återupptas uppladdningen för samma inloggade konto. Välj den tidigare inspelningen och **Avsluta och sammanfatta sparat ljud** för att slutföra den. En avbruten webbläsare kan inte återhämta ljud som ännu inte nått en lokal 20-sekundersfil.
- Inspelningen kan stoppas och nästa startas medan det tidigare samtalet bearbetas. När sidan bekräftar att alla ljuddelar är verifierade i molnet och serverkön är aktiv kan sidan stängas. Arbetaren fortsätter med transkribering och sammanfattning. En äldre serverinstallation använder sidans tidigare köhantering och behöver då fortfarande en öppen sida.
- Om en verklig lokal skrivning misslyckas, exempelvis vid full lagring, pausas mikrofonen och alla mottagna, osparade delar behålls i minnet med möjlighet att ladda ned dem. Lämna då inte sidan innan ljudkopiorna är säkrade. En varning visas även när lite uppskattat utrymme återstår. Beständig lagring begärs, men webbläsaren bestämmer om den beviljas.
- Vid 16 kHz mono kräver WAV ungefär 115 MB per timme. Webbläsarens faktiska samplingsfrekvens kan ge större filer. Råljud ligger separat från arbetsytans JSON och ingår inte i den vanliga planbackupen.

## Granska och spara

Sammanfattningen visar överenskommelser, förslag till nästa steg, osäkerheter och stödjande citat. Påståenden utan ett matchande citat i transkriptionen flyttas till osäkerheter. Ett citat garanterar inte att AI:s tolkning är korrekt. Läs och korrigera texten före **Spara granskad sammanfattning i historiken**.

Sparning läser den senaste molnrevisionen och skriver en anteckning till ansökan och/eller kontaktloggen. Varje granskad sammanfattningsversion får ett stabilt antecknings-id så att ett nytt klick inte skapar dubbletter. En rättad version kan sparas som en ny anteckning utan att den tidigare skrivs över. Kalenderpass, avklarade aktiviteter och befintliga nästa steg ändras inte. Vid samtidig redigering används arbetsytans vanliga revisionskontroll.

Ljud, transkriptioner och AI-förslag är privata för kontot. Radering av inspelningen tar bort dessa serverdata; redan sparade historikanteckningar bevaras. Inga tidsstyrda raderingar är konfigurerade.

## Begränsningar och kontroll

Mobilwebben spelar in mikrofonens omgivningsljud. Den hämtar inte automatiskt internt samtalsljud från telefonen eller andra appar. Sidan pausar när den döljs. Låst mobil, stängd sida, operativsystemets mikrofonavbrott eller att webbläsaren avslutas kan stoppa inspelningen. Appen begär att skärmen hålls vaken när webbläsaren stöder det, men bakgrundsinspelning garanteras inte.

Efter installation: spela in ett kort prov med en aktuell Safari/Chrome på den faktiska mobilen, låt det laddas upp och granska sammanfattningen. Prova även tillfälligt nätavbrott och omladdning efter stopp. Automatiska tester använder syntetiskt mikrofonljud och simulerade API-svar; de verifierar inte projektets riktiga OpenAI-nyckel, Supabase-installation eller en fysisk mobil.

## Felsök AI-analysen

Under **Felsök AI-analysen → Kontrollera AI-anslutningen** görs ett kort prov mot både transkriberingsmodellen och sammanfattningsmodellen. Provet använder en sekund tyst ljud och en fast testtext, aldrig något från dina inspelningar. Det gör vanliga, avgiftsbelagda API-anrop. Kontrollen ändrar eller raderar inte inspelningar eller planer. När den lyckas försöker sidan också bearbeta väntande ljud igen.

En konfigurerad nyckel betyder endast att ett nyckelvärde finns. Kontrollen kan skilja på avvisad nyckel, saknad behörighet, otillgänglig modell, slut på API-kredit, anropsbegränsning och tidsgräns. API-kredit hanteras i [OpenAI:s API-fakturering](https://platform.openai.com/settings/organization/billing/overview), separat från ChatGPT-abonnemang. En nätverksstörning ska inte längre beskrivas som att serverfunktionen saknas. AI-tjänstens råa felsvar, nycklar och samtalsinnehåll visas inte.

För den senaste serverversionen används `npm run deploy:recording` enligt installationen ovan. Det behövs en ny, additiv migration för kön och textversionerna; skriptet installerar den. Varken AI-nyckeln eller Supabase-token ska klistras in i chatten eller läggas i webbappens kod.

## Sök och rätta transkription

Öppna **Transkription · sök, lyssna och rätta** efter stopp. Sökning sker i aktuell text. Varje ljuddel länkar till sitt ljud och visar starttid när samtliga föregående delar finns. **Rätta ljuddel** sparar rättelsen med versionskontroll; ursprunglig taltext, ändringshistorik och äldre sammanfattningar bevaras. Den tidigare sammanfattningen markeras som inaktuell och kan inte sparas eller skapa nya åtgärder förrän den nya analysen är klar. En egen redigerad sammanfattning skrivs inte över när servern levererar en ny version: användaren väljer att granska och behålla texten eller använda den nya AI-texten.

## Bokning, bevakningar och fortsatta samtal

I varje granskad åtgärd kan **Typ av nästa steg** vara **Egen uppgift** eller **Väntar på annan**. Välj ansvarig och datum. **Föreslå kalenderbokning** visar lediga tider enligt befintliga bokningar, lunch, familjetid och buffertar. För egna uppgifter söks tid före datumet; bevakningar bokas från bevakningsdatumet som ett uppföljningspass. Åtgärd och kalenderpass sparas atomiskt först efter bekräftelse. En samtidig ändring eller en upptagen tid stoppar bokningen utan att skriva över planen.

**Tidigare överenskommelser** använder vald ansökan eller kontakt och visar tidigare öppna åtaganden, även när inspelningen öppnas från en länk inför ett samtal. Efteråt kan de markeras **Uppfylld**, **Ändrad** eller **Fortfarande öppen** med en anteckning. Äldre innehåll, datum och källhänvisningar bevaras i historiken. Redan bokade kalenderpass och genomförda aktiviteter ändras inte automatiskt när ett åtagande ändras.

## Återförsök i serverkön

Jobb och låstoken ligger i databasen. Ett avbrutet jobb kan återtas efter tre minuter. Övergående nätverksfel och anropsgränser försöks om med ökande väntetid, högst åtta på varandra följande misslyckanden. Felaktig nyckel, otillräcklig behörighet, slut på API-kredit, saknad modell och avvisat ljud stoppar automatiken direkt. Orsaken visas vid samtalet; **Försök bearbeta på servern igen** används efter att orsaken åtgärdats. Ljud och färdiga delresultat bevaras under alla återförsök.
