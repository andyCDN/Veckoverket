# Kort dagsincheck

Tre val, ingen fritext: aktuellt mående, ett meningsfullt steg ur dagens verkliga uppgifter/pass (eller återhämtning), och en startsignal. Ungefär 20 sekunder är ett UX-mål, inte ett uppmätt forskningsresultat. Fem minuter är en låg starttröskel som valts för produkten, inte en vetenskapligt optimal dos.

## Forskningsgrund, kontrollerad 11 november 2026

- [Gollwitzer & Sheeran, *Psychology of Planning*, 2025](https://doi.org/10.1146/annurev-psych-021524-110536), samt [Sheeran et al., metaanalys av 642 tester, publicerad online 2024](https://doi.org/10.1080/10463283.2024.2334563): stöd för planer som kopplar en identifierbar situation till en handling. Produkten låter användaren välja startsignal och återvisar den tillsammans med uppgiften. Effekten beror bland annat på motivation och planens utformning; detta garanterar inte högre produktivitet för varje användare.
- [Uphoff et al., Cochrane, 2020](https://www.cochrane.org/evidence/CD013305_behavioural-activation-therapy-depression-adults): beteendeaktivering innebär bland annat att återgå till meningsfull aktivitet och kan hjälpa vid depression, med begränsningar i evidensens säkerhet. Inchecken lånar principen om en konkret, meningsfull handling. Den är inte beteendeaktiveringsterapi och ingen klinisk behandlingseffekt tillskrivs appen.
- [Albulescu et al., PLOS ONE, 2022](https://doi.org/10.1371/journal.pone.0272460): metaanalys av mikropauser fann små förbättringar i energi och trötthet, men ingen statistiskt säkerställd generell prestationseffekt. Därför är återhämtning ett fullvärdigt val, utan löften om ökad prestation.

Den tregradiga måendefrågan är ett eget gränssnittsval för att stanna upp, inte en validerad skattningsskala, diagnos eller riskbedömning. Just kombinationen av dessa tre frågor har inte utvärderats vetenskapligt. Utvecklingen är forskningsinspirerad, inte kliniskt validerad.

## Beteende och data

- Frivillig ingång i dagsstarten varje ny Stockholmsdag, även helger; inga popupkrav, poäng, obrutna sviter eller missade incheckar att ta igen.
- En uppdaterbar post per datum i `dailyCheckIns`; export/import och befintlig kontobunden molnsynk bevarar fältet. Äldre data utan incheckar fungerar.
- Inchecken styr rekommenderat fokus i dagsstarten. En avslutad/borttagen uppgift ersätts inte automatiskt med mer arbete. Återhämtning skapar ingen kalenderbokning.
- Befintlig kalender, mål och uppgiftsstatus ändras inte vid incheckning. Åtgärderna Öppna pass/Boka tid använder de befintliga flödena. Godkänd Låg ork-plan håller valt fokus i inchecken synkroniserat med den lättare planen.
- Svar kan ändras eller raderas. Uppgifterna följer samma lokal-/molnlagring och ångra-flöde som den övriga planen. Ingen AI-tjänst, klinisk analys eller statistik över mående tillkommer.
- En öppen dialog över midnatt får inte spara på gårdagens datum. Dagssammanfattningen och incheckningsknappen uppdateras när dagen växlar.
