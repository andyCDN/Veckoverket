# Samtalsinspelning

Mobilwebbsidan finns på `/Veckoverket/inspelning/`. Öppna den direkt eller från en ansökan, intervju eller kontakt. Startvyn har en stor inspelningsknapp; ingen kategori, rubrik eller koppling behöver väljas i förväg. Logga in med samma Supabase-konto som i Veckoverket. Håll sidan öppen och synlig under samtalet. Start och stopp styrs av användaren; mikrofonen arbetar kontinuerligt mellan dessa åtgärder.

Efter stopp visas **Kategorisera**. Välj valfri kategori, ändra rubrik och koppla vid behov en ansökan, intervju eller kontakt. **Spara kategorisering** sparar dessa uppgifter även om sammanfattningen ännu inte är klar. Du kan också lämna inspelningen okategoriserad och öppna den från **Tidigare inspelningar** senare. En länk från en ansökan eller kontakt föreslår kopplingen i efterhand; den sparas först när du väljer att spara.

## Aktivera serverdelen

GitHub Pages publicerar gränssnittet. Supabase-tabellerna, ljudlagringen och Edge-funktionen måste installeras separat av projektets administratör. GitHub Pages publicering installerar inte dessa delar.

1. Kör SQL-filen [`supabase/migrations/202610300001_recordings.sql`](../supabase/migrations/202610300001_recordings.sql) i det befintliga Supabase-projektets SQL Editor, eller använd projektets vanliga migrationsflöde. Den skapar separata inspelningstabeller och en privat bucket `interview-recordings`. Befintliga arbetsytor och kalenderdata ändras inte.
2. Publicera funktionen med Supabase CLI från repots rot:

   ```sh
   supabase functions deploy recording --project-ref DITT_PROJEKT
   ```

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
