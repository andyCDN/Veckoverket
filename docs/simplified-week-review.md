# Förenklat veckoflöde – granskningsversion

Implementerat lokalt. Publicering inväntar godkännande.

## De sex förändringarna

1. **Måndagscheck som startpunkt.** Bestäm mål → Välj uppgifter → Boka tid ligger i samma popup. Nya förslag kan ändras innan de sparas. Befintliga mål, uppgifter och tidsatta vanor kan planeras direkt. Kalenderförslaget behöver tillämpas aktivt.
2. **En gemensam Nästa steg.** Obokade måluppgifter och vanor, uppgifter från Jobb och Nätverk, förfallna bevakningar, missade pass och deadlinearbete visas tillsammans. Varje rad har Boka tid eller Följ upp. Framtida bevakningar väntar till sitt datum; bokat arbete finns i kalendern. Listan döljs när den är tom.
3. **Kalendern som arbetsyta.** Dubbla mål- och uppgiftslistor i mobilens veckoöversikt är borttagna. Mål och vanor visas till höger på desktop och i en utfällbar panel på mobil. Extra planeringsinformation är fortsatt utfällbar.
4. **En meny för att skapa.** Lägg till samlar Pass, Uppgift, Mål och Vana. Tid kan fortfarande markeras direkt i kalendern med mus, pekskärm eller tangentbord. Tidfördelning efter områden finns bland kalenderverktygen och heter Fördela tid automatiskt.
5. **Kortare avslut.** Efter ett uppgiftspass visas Klar · Mer tid · Väntar. Extra fält visas först efter val. Genomförd tid sparas oberoende av om uppgiften är färdig. Fredagschecken behåller sammanfattningen och de valda överföringarna.
6. **Jobb och Nätverk ansluter till samma arbete.** Nästa steg använder originaluppgiften och samma bokningsfunktion. Slutförande och vänteläge uppdaterar ansökan eller kontakten utan en separat kopia. Källans namn visas i listan och det finns en tydlig väg tillbaka till veckans arbete.

## Bevarat beteende

Manuell avbockning av vanor, koppling till vanopass, skyddade kalenderpass, historik, ångra, fredagsöverföringar, lagring och offlinefunktion finns kvar. Ingen datamigrering behövs. Inspelningens deployskript ingår inte i ändringen.

## Granskning

- Produktionsbygge och TypeScript-kontroll.
- 281 enhetstester: bland annat gemensam kö, väntedatum, ombokning och uppdatering av originalposter.
- 37 webbläsarscenarier för desktop och mobil, inklusive automatisk tillgänglighetskontroll, avsaknad av sidscroll, offlinefunktion och missade pass över veckobyten.
- Bilder: `test-results/simple-week-1440.png`, `simple-week-390.png`, `simple-monday-1440.png` och `simple-monday-390.png`.
