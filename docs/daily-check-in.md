# Att göra idag

Dagsstarten öppnar med färdiga små steg för Jobb och Nätverkande. Den korta vyn visar ett steg per område; Visa dagens att göra öppnar hela listan. Det finns ingen frågeblankett och ingen fritext eller obligatorisk sparknapp före start.

## Flöde

- Aktuella utkast prioriteras efter känd deadline. Inskickade/avslutade ansökningar och utgångna utkast blir inte nya ansökningssteg.
- Kontakter som behöver uppföljning prioriteras. Redan loggade kontakter idag och framtida bevakningar föreslås inte som nya kontaktsteg. En egen anteckning räknas inte som genomförd kontakt.
- Högst två jobb och två kontakter föreslås från början. Gränsen är ett designval för överblick, inte ett vetenskapligt optimalt antal. Fler aktuella steg finns i en utfällbar lista och läggs till uttryckligen.
- Varje rad har en konkret handling, källa, relevant datum, avprickning och Börja. Exempel: välj ett krav ur annonsen, eller formulera en fråga till kontakten. Börja öppnar rätt Dokumentunderlag eller kontaktkort direkt, även om flera personer har samma namn.
- Avprickning gäller bara det lilla steget. Den skickar ingen ansökan, markerar ingen hel ansökan som färdig och skapar ingen kontaktlogg. Ansökans faktiska status och genomförda kontakter registreras i sina befintliga flöden.
- Inte idag lägger steget åt sidan i dagens lista. Det flyttar inte kalenderpass eller deadlines. Steget kan tas tillbaka.
- Vid första uttryckliga ändringen sparas dagens referenser. Färdiga steg ersätts inte automatiskt med nya. Statusändringar i registret visas direkt som klara eller inaktuella, och blockerar inte övriga steg.
- Klart/inte längre aktuellt, åt sidan och fler steg ligger i egna utfällbara listor. Återställ dagens lista återgår uttryckligen till nya förslag från aktuella register.
- Tomma register ger ett lugnt tomläge. Den befintliga dagsstarten och uppgiftsplaneringen finns kvar. En godkänd Låg ork-plan prioriteras i dagsstarten.

## Forskningsgrund, kontrollerad 11 november 2026

- [Gollwitzer & Sheeran, Psychology of Planning, 2025](https://doi.org/10.1146/annurev-psych-021524-110536): forskning om att binda en identifierbar situation till en konkret handling. Här öppnar Börja valt underlag och visar det lilla steget där.
- [Rai et al., A Field Experiment on Subgoal Framing to Boost Volunteering, online 2022, volym 2023](https://doi.org/10.1037/apl0001040), [författarens översikt](https://aneesh-rai.com/publication/subgoals/): stöd för konkreta delmål och flexibilitet i den studerade volontärverksamheten. Produkten tillämpar principerna på små relevanta steg och möjlighet att avstå idag; studien är inte en utvärdering av denna lista.
- [Liu, Huang & Wang, Effectiveness of Job Search Interventions, 2014](https://doi.org/10.1037/a0035923), [Monash University](https://research.monash.edu/en/publications/effectiveness-of-job-search-interventions-a-meta-analytic-review/): metaanalys av bredare jobbsökarinsatser. Målsättning och proaktivitet ingick i komponenter som var associerade med bättre resultat. Det belägger inte att just denna lista förbättrar anställningschanser.

Utformningen är en praktisk tillämpning av principerna. Inga effekter på produktivitet, hälsa eller anställning garanteras. Inga måendefrågor, prestationspoäng, dagliga kvoter eller obrutna sviter tillkommer.

## Data

`dailyCheckIns` bevarar en post per Stockholmsdatum med referenser till jobb/kontakter samt småstegens `completedKeys` och `deferredKeys`. Inga extra globala uppgifter, jobb eller kontakter kopieras. Kalender, deadlines, ansökningsstatusar och kontaktloggar ändras bara i sina egna ordinarie flöden.

Lokal lagring, export/import, kontobunden molnsynk och ångra följer det befintliga upplägget. Äldre publicerade data utan dagslistor fungerar. En öppen dialog över midnatt kan inte skriva till gårdagens lista. Nästa dag beräknar förslag från då aktuella register; gamla avprickningar bevaras på sitt datum.
