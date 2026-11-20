# Personlig veckoplan, måndag–torsdag

Nya veckor använder följande mall. Fredag, lördag och söndag visas tillsammans som helg i både mobil- och datorvyn.

| Dag     | Tid         | Pass                  |
| ------- | ----------- | --------------------- |
| Måndag  | 08.30–09.00 | Veckoincheck          |
|         | 09.00–10.30 | Söka jobb             |
|         | 10.30–11.30 | Träna                 |
|         | 11.30–12.30 | Lunch                 |
|         | 12.30–14.00 | Kompetensutveckling   |
|         | 14.00–15.00 | Nätverksförfrågningar |
| Tisdag  | 08.30–10.00 | Söka jobb             |
|         | 10.00–11.30 | Kompetensutveckling   |
|         | 11.30–12.30 | Lunch                 |
|         | Efter 12.30 | Öppet                 |
| Onsdag  | 08.30–10.00 | Söka jobb             |
|         | 10.00–11.30 | Kompetensutveckling   |
|         | 11.30–12.30 | Lunch                 |
|         | 12.30–13.30 | Träna                 |
|         | 13.30–15.00 | Öppet                 |
|         | 15.00–15.30 | Hämta                 |
| Torsdag | 08.30–10.00 | Söka jobb             |
|         | 10.00–11.00 | Träna                 |
|         | 11.00–12.00 | Kompetensutveckling   |
|         | 12.00–13.00 | Lunch                 |
|         | 13.00–13.30 | Stänga veckan         |

Måndagens nätverkande är 60 minuter enligt användarens besked. Hämtningen och torsdagens check har tills vidare fått 30 minuter var. Övriga sluttider följer nästa angivna starttid. Tisdag efter 12.30 och onsdag 13.30–15.00 fylls inte automatiskt.

## Införande och bevarande

Vid första öppningen med uppdateringen aktiveras mallen för befintliga arbetsytor som saknar ett val av veckomall. Nya arbetsytor använder den direkt. Innevarande och tidigare sparade veckor behåller sina aktiviteter, utfall och tidigare planeringsregler. Framtida sparade veckor får den nya mallen; uttryckligen tömda veckor förblir tomma. Inställningen kan stängas av utan att aktiveras igen vid nästa öppning.

Egna bokningar, återkommande bokningar, importerade aktiviteter, påbörjade pass, registrerade utfall och pass som kopplats till konkreta uppgifter behålls. Om en bokning krockar med en malltid behålls bokningen och en varning visas. Mallpasset flyttas inte till någon annan tid. En redan sparad egen fredagsbokning ligger kvar och visas i helgen.

Veckomål och ansökningars nästa steg kan använda en del av ett befintligt jobb- eller kompetenspass. Den återstående tiden stannar i samma malltid även efter automatisk omplanering. Lunch, träning, hämtning och checkar flyttas inte för att ge plats åt sådana bokningar.

Torsdagschecken öppnar samma uppföljningsflöde som den tidigare fredagschecken. Måndagschecken behåller flödet för veckomål och bokning av konkreta uppgifter. Den generella planeringsmotorn finns kvar för veckor och arbetsytor där mallen är avstängd.

## Verifiering

- Enhetstester jämför samtliga tider med den begärda planen och kontrollerar bokningar, uppgiftskopplingar, omplanering, bevarad historik, tomma veckor och migrering av äldre säkerhetskopior.
- Webbläsartester kontrollerar mobil- och datorvyn vid 320, 390 och 1440 pixlar, torsdagens popup, sparande, fredagens helgplacering och tillgänglighet.
- Befintliga tester för dragbokning, planeringsgenvägar och generell automatisk planering körs också.
