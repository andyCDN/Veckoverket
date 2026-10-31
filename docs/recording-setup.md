# Samtalsinspelning

Mobilwebbsidan finns på `/Veckoverket/inspelning/`. Öppna den direkt eller från en ansökan, intervju eller kontakt. Startvyn har en stor inspelningsknapp; ingen kategori, rubrik eller koppling behöver väljas i förväg. Logga in med samma Supabase-konto som i Veckoverket. Håll sidan öppen och synlig under samtalet. Start och stopp styrs av användaren; mikrofonen arbetar kontinuerligt mellan dessa åtgärder.

Gränssnittet visar stegen **Spela in → Koppla → Granska**. På dator ligger inspelningskontrollen och panelen **Ljud & bearbetning** bredvid varandra; på mobil följer statuspanelen efter den stora inspelningsknappen. Panelen visar väntande uppladdningar, enhetens transkriberingskö och pågående bearbetning. Kategorisering, åtgärdsgranskning och sammanfattning har egna avsnitt efter stopp. Utseendet ändrar inte inspelningsformat, lagring eller sparade uppgifter.

Efter stopp visas **Kategorisera**. Välj valfri kategori, ändra rubrik och koppla vid behov en ansökan, intervju eller kontakt. **Spara kategorisering** sparar dessa uppgifter även om sammanfattningen ännu inte är klar. Du kan också lämna inspelningen okategoriserad och öppna den från **Tidigare inspelningar** senare. En länk från en ansökan eller kontakt föreslår kopplingen i efterhand; den sparas först när du väljer att spara.

## Egen appikon på hemskärmen

Öppna [inspelningssidan](https://andycdn.github.io/Veckoverket/inspelning/) i mobilens webbläsare och installera just den sidan. På iPhone: **Dela → Lägg till på hemskärmen**. På Android: **⋮ → Installera appen** eller **Lägg till på startskärmen**. Inspelning får en egen röd ikon med en svart inspelningspunkt, eget appnamn och startadress. Veckoverket behåller sin V-ikon.

Om en genväg till inspelningen redan har skapats med den gamla V-ikonen kan den behöva läggas till på nytt från inspelningssidan. Kontrollera att väntande ljud har laddats upp innan en äldre hemskärmsinstallation tas bort. Behåll Veckoverkets vanliga ikon. Befintliga molnplaner och uppladdat ljud berörs inte.

## Aktivera serverdelen

GitHub Pages publicerar gränssnittet. Supabase-tabellerna, ljudlagringen och Edge-funktionen måste installeras separat av projektets administratör. GitHub Pages publicering installerar inte dessa delar.

1. Kör SQL-filen [`supabase/migrations/202610300001_recordings.sql`](../supabase/migrations/202610300001_recordings.sql) i det befintliga Supabase-projektets SQL Editor, eller använd projektets vanliga migrationsflöde. Den skapar separata inspelningstabeller och en privat bucket `interview-recordings`. Befintliga arbetsytor och kalenderdata ändras inte.
2. Lägg upp inspelningens serverkod i Supabase. Du kan göra detta i webbläsaren:

   Öppna [Veckoverket i GitHub Codespaces](https://codespaces.new/andyCDN/Veckoverket), välj **Create codespace** och sedan **Terminal → New Terminal**. Terminalen står normalt redan i projektets huvudmapp `Veckoverket`, där `package.json` finns. Det är den mappen som menas med ”repots rot”.

   Logga in i Supabase genom att köra följande i terminalen och följa inloggningslänken som visas:

   ```sh
   npx --yes supabase login
   ```

   Publicera därefter serverkoden:

   ```sh
   npx --yes supabase functions deploy recording --project-ref DITT_PROJEKT --use-api
   ```

   Ersätt `DITT_PROJEKT` med projektets **Reference ID**, som finns under **Settings → General** i [Supabase](https://supabase.com/dashboard). Det är också delen före `.supabase.co` i projektets adress. `--use-api` gör att datorn inte behöver Docker. När kommandot är klart ska `recording` finnas under **Edge Functions** i samma Supabase-projekt. [Supabases guide till publicering](https://supabase.com/docs/guides/functions/deploy) beskriver terminalverktyget mer utförligt.

   Publicera funktionen på nytt om den redan är installerad: den nya versionen tillåter okategoriserad start och sparar kategorisering i efterhand. Tabellerna behöver ingen ny migrering för denna ändring; kategori och koppling ligger i det befintliga JSON-fältet `context`. En äldre serverversion känns igen av gränssnittet och startknappen är då avstängd tills funktionen är uppdaterad.

   `supabase/config.toml` pekar på projektets befintliga import map. Plattformens `verify_jwt` är avstängd eftersom funktionen själv verifierar token med `Auth.getUser`, inklusive nyare signeringsnycklar. Ta inte bort denna kontroll i funktionen.

3. För automatisk transkribering och sammanfattning: lägg till `RECORDING_AI_KEY` under **Edge Functions → Secrets** i Supabase Dashboard. Använd en servernyckel för OpenAI med tillgång till de valda modellerna. Nyckeln ska aldrig läggas i frontendvariabler, GitHub Pages, källkod eller chatt. Ljudlagring fungerar även innan AI-nyckeln är tillagd; bearbetningen väntar.
4. `APP_ORIGIN` är som standard `https://andycdn.github.io`. Ange en annan exakt origin om sidan körs på en annan domän. Sökvägen `/Veckoverket` ingår inte i origin. `SUPABASE_URL` och `SUPABASE_SERVICE_ROLE_KEY` tillhandahålls av Supabase, aldrig av webbläsaren.
5. Standardmodeller är `gpt-4o-mini-transcribe` och `gpt-4.1-mini`. Vid behov kan administratören ange `RECORDING_TRANSCRIPTION_MODEL` och `RECORDING_SUMMARY_MODEL` som serverhemligheter. Ljud skickas till OpenAI för transkribering och text för sammanfattning. Kostnader för API och lagring tillkommer.

## Ljud och återhämtning

- AudioWorklet skapar självständiga PCM WAV-filer, normalt 20 sekunder vardera. Kortare delar skapas vid paus eller stopp. Ingen fil behöver den föregående filens header för att gå att spela upp.
- Varje del sparas först i IndexedDB på mobilen. Uppladdning försöker igen automatiskt var 15:e sekund och när nätet återkommer. En långsam uppladdning eller AI-kö pausar aldrig mikrofonen. Avslutade samtal som fått ett tillfälligt bearbetningsfel försöker också igen medan sidan är öppen.
- Efter uppladdning läser servern tillbaka filen och verifierar SHA-256. Först efter matchande bekräftelse tas den lokala ljudkopian bort. En liten köpost finns kvar tills transkriberingen är klar. Separata arbetare gör att AI inte blockerar uppladdningar.
- Vid nätavbrott växer den lokala kön. Efter omladdning återupptas uppladdningen för samma inloggade konto. Välj den tidigare inspelningen och **Avsluta och sammanfatta sparat ljud** för att slutföra den. En avbruten webbläsare kan inte återhämta ljud som ännu inte nått en lokal 20-sekundersfil.
- Inspelningen kan stoppas och nästa startas medan det tidigare samtalet bearbetas. Låt sidan vara öppen för fortsatt köhantering. Bearbetningen drivs av sidan; detta är ingen fristående serverkö som fortsätter arbeta efter att alla sidor stängts.
- Om en verklig lokal skrivning misslyckas, exempelvis vid full lagring, pausas mikrofonen och alla mottagna, osparade delar behålls i minnet med möjlighet att ladda ned dem. Lämna då inte sidan innan ljudkopiorna är säkrade. En varning visas även när lite uppskattat utrymme återstår. Beständig lagring begärs, men webbläsaren bestämmer om den beviljas.
- Vid 16 kHz mono kräver WAV ungefär 115 MB per timme. Webbläsarens faktiska samplingsfrekvens kan ge större filer. Råljud ligger separat från arbetsytans JSON och ingår inte i den vanliga planbackupen.

## Granska och spara

Sammanfattningen visar överenskommelser, förslag till nästa steg, osäkerheter och stödjande citat. Påståenden utan ett matchande citat i transkriptionen flyttas till osäkerheter. Ett citat garanterar inte att AI:s tolkning är korrekt. Läs och korrigera texten före **Spara granskad sammanfattning i historiken**.

Sparning läser den senaste molnrevisionen och skriver en anteckning till ansökan och/eller kontaktloggen. Samma inspelning får ett stabilt antecknings-id så att ett nytt klick inte skapar dubbletter. Kalenderpass, avklarade aktiviteter och befintliga nästa steg ändras inte. Vid samtidig redigering används arbetsytans vanliga revisionskontroll.

Ljud, transkriptioner och AI-förslag är privata för kontot. Radering av inspelningen tar bort dessa serverdata; redan sparade historikanteckningar bevaras. Inga tidsstyrda raderingar är konfigurerade.

## Begränsningar och kontroll

Mobilwebben spelar in mikrofonens omgivningsljud. Den hämtar inte automatiskt internt samtalsljud från telefonen eller andra appar. Sidan pausar när den döljs. Låst mobil, stängd sida, operativsystemets mikrofonavbrott eller att webbläsaren avslutas kan stoppa inspelningen. Appen begär att skärmen hålls vaken när webbläsaren stöder det, men bakgrundsinspelning garanteras inte.

Efter installation: spela in ett kort prov med en aktuell Safari/Chrome på den faktiska mobilen, låt det laddas upp och granska sammanfattningen. Prova även tillfälligt nätavbrott och omladdning efter stopp. Automatiska tester använder syntetiskt mikrofonljud och simulerade API-svar; de verifierar inte projektets riktiga OpenAI-nyckel, Supabase-installation eller en fysisk mobil.

## Felsök AI-analysen

Under **Felsök AI-analysen → Kontrollera AI-anslutningen** görs ett kort prov mot både transkriberingsmodellen och sammanfattningsmodellen. Provet använder en sekund tyst ljud och en fast testtext, aldrig något från dina inspelningar. Det gör vanliga, avgiftsbelagda API-anrop. Kontrollen ändrar eller raderar inte inspelningar eller planer. När den lyckas försöker sidan också bearbeta väntande ljud igen.

En konfigurerad nyckel betyder endast att ett nyckelvärde finns. Kontrollen kan skilja på avvisad nyckel, saknad behörighet, otillgänglig modell, slut på API-kredit, anropsbegränsning och tidsgräns. API-kredit hanteras i [OpenAI:s API-fakturering](https://platform.openai.com/settings/organization/billing/overview), separat från ChatGPT-abonnemang. En nätverksstörning ska inte längre beskrivas som att serverfunktionen saknas. AI-tjänstens råa felsvar, nycklar och samtalsinnehåll visas inte.

Serverfunktionen måste publiceras på nytt för denna diagnostik. Kör från den uppdaterade projektmappen (i en befintlig Codespace: hämta först senaste `main` med `git pull --ff-only`):

```sh
npx --yes supabase functions deploy recording --project-ref cefzxeproambftvhcgme --use-api
```

Ingen ny SQL-migrering behövs. Inställningarna finns i [projektets Edge Functions](https://supabase.com/dashboard/project/cefzxeproambftvhcgme/functions) och [Secrets](https://supabase.com/dashboard/project/cefzxeproambftvhcgme/functions/secrets). `RECORDING_AI_KEY` är förstahandsval; om den saknas används även det vanliga servernamnet `OPENAI_API_KEY`. Nyckeln ska aldrig klistras in i chatten eller läggas i webbappens kod.
