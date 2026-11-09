# Granskning: veckomål, vanor och måndagscheck

Status: genomfört lokalt för granskning. Inte publicerat. Omfattningen är de tre godkända flödena från chattförslaget.

## 1. Veckomål blir verkliga uppgifter och kalenderpass

- Veckans mål och uppgifter visas i veckovyns högerspalt, ovanför vanorna på desktop.
- Nya mål kan skapas i samma vy. Uppgifter kan läggas till direkt på målet.
- Planeringsförslaget låter användaren välja uppgifter, tidsbehov, prioritet och önskad dag.
- Förslaget kan använda ledig tid eller ersätta ett obundet genererat block i samma kategori. Manuella, importerade, låsta och genomförda bokningar skyddas.
- Varje uppgiftspass har både `taskId` och det riktiga `goalId`. Flera mål i samma kategori får egna, korrekta kopplingar.
- Obokade uppgifter syns som ”Behöver planeras”. Ett bokat arbete öppnar sitt befintliga pass.
- Genomförd arbetstid gör inte automatiskt en jobbmålsuppgift klar. Resultatet bekräftas med uppgiftens avbockning.

## 2. Vanor kopplas till kalendern

- Vanor kan ha tidsbehov och område via ”Avsätt tid i kalendern”. Befintliga vanor utan tidsbehov fungerar fortsatt som manuella vanor.
- ”Boka i veckan” öppnar samma planeringsflöde. Bestämda dagar följs och veckofrekvens får förvalda tillfällen som användaren kan ändra.
- Vanepass har `habitId`. Genomförda kalenderpass räknas i vanomatrisen.
- Manuella bockar och kalenderbaserade genomföranden hålls åtskilda. Flera genomförda pass samma dag ger en avklarad vanodag.
- Kalenderbaserade markeringar öppnar källpasset för ändring. Manuella markeringar registrerar inte kalenderminuter och bevaras när ett pass ändras eller tas bort.
- Kalenderpass kan öppnas direkt från vanans lista med bokade pass.

## 3. Måndagschecken skapar en veckoplan

- ”Planera veckans mål och vanor” öppnar det gemensamma planeringsflödet.
- Urval, minuter, prioritet och dag granskas innan ”Visa planeringsförslag”.
- Förslaget visar konkreta datum och tider samt arbete som inte ryms.
- ”Lägg in … pass i veckan” sparar först efter användarens val och återgår till måndagschecken.
- Anteckningarna i checken bevaras. Kalendern ändras inte av att förslaget öppnas eller granskas.
- Ett förändrat underlag stoppar tillämpning av ett gammalt förslag.

## Granskningsbilder

- [Planeringsförslag, desktop](../test-results/weekly-work-preview-1440.png)
- [Planeringsförslag, mobil](../test-results/weekly-work-preview-390.png)
- [Veckovy med kopplade mål och vanor, desktop](../test-results/connected-week-1440.png)
- [Veckovy med kopplade mål och vanor, mobil](../test-results/connected-week-390.png)

## Produktregler i denna version

- Ett föreslaget pass per konkret uppgift, 15–240 minuter. Större arbete kan brytas ned i flera uppgifter.
- Prioritet styr i vilken ordning förslaget försöker placera arbetet. Framtida bokningar kan öppnas och redigeras med de befintliga kalenderverktygen.
- Vanor kan planeras även på aktiverade helgdagar. Redan bokade eller genomförda tillfällen skapas inte en gång till.
- Kategoriernas befintliga tidsmål och planeringsinformation behålls. Ett förslag för utvalda veckouppgifter innebär inte att alla övriga kategoritidsmål är uppfyllda.
- Fredagscheckens större överföringsflöde samt samordning av alla ingångar i Jobb, Nätverk och inspelning ingår i efterföljande delar av förslaget.

## Verifiering

Godkänt: 269 enhetstester, 13 webbläsartester av produktionsbygget, TypeScript-kontroll och produktionsbygge.

Enhetstester omfattar källkopplingar, återanvändning av genererad tid, prioritet, full kalender, avsaknad av dubbletter, vanors källor, flytt mellan veckor, helgkapacitet och säkerhetskopiering.

Webbläsartester omfattar nya mål och uppgifter i veckovyn, skapande av tidsatt vana, måndagscheck → förslag → sparade kalenderpass, explicit bekräftelse av uppgiftsresultat, automatiska vanomarkeringar, manuell historik, omladdning, mobil/desktop, direktdragning samt PWA/offline.

Publicering kräver användarens godkännande enligt instruktionen i chatten.
