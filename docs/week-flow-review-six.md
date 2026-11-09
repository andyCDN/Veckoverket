# Veckoflödet – sex förbättringar för granskning

Status: implementerat lokalt. Publicering inväntar godkännande.

1. **Tydligt nästa steg.** Uppgifter visar Planera, Öppna pass eller Följ upp beroende på läge. Mindre vanliga val ligger under Fler alternativ.
2. **Gemensam planeringskö.** Behöver planeras samlar obokade uppgifter och tidsatta vanor med tidsbehov. Kalenderförslag förklarar varför något inte ryms och tillämpas först efter aktivt val.
3. **Resultat efter ett pass.** Ett genomfört uppgiftspass följs av Klar, Mer tid behövs eller Väntar på svar. Mer tid går till ny planering; väntan får kontakt och uppföljningsdatum. Vanor fortsätter räknas direkt från genomförda pass.
4. **Sammanhängande veckobyte.** Fredagschecken sparar en sammanfattning och för bara valda öppna uppgifter till nästa vecka. Genomförd tid och målens ursprung bevaras. Måndagschecken visar föregående veckas anteckningar och sammanfattning.
5. **Lugnare visning.** Relevanta mål och vanor visas först. Klara uppgifter, historik och vanlig planeringsinformation går att fälla ut. Fel förblir synliga.
6. **Samma språk.** Mål beskriver önskat resultat, uppgift vad som ska göras, pass tiden i kalendern och vana det återkommande beteendet.

## Kontroll

- 275 enhetstester, inklusive beslut efter pass, väntan, omplanering, valda överföringar och oförändrad veckohistorik.
- Produktionsbygge med TypeScript-kontroll.
- Webbläsartester på desktop och mobil för veckoloopen, kalenderns dra-och-boka, vanor, målkopplingar, kontakter, navigation och PWA.
- Mobilens fredagscheck kontrolleras även med automatisk tillgänglighetsgranskning.

Granskningsbilder skapas i `test-results/week-loop-1440.png`, `test-results/week-loop-390.png` och `test-results/friday-flow-1440.png`.
