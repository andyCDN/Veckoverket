# Importera sparade LinkedIn-jobb

Granskningsversion. Inte publicerad.

1. Öppna Jobb och välj **Importera från LinkedIn**.
2. Klistra in jobblänkar, en per rad (högst 100). Kopiera länken från ett öppnat jobb, inte bara själva listan Sparade jobb.
3. Välj **Granska jobben**, fyll i tjänst och arbetsgivare och komplettera eventuell sista ansökningsdag. Välj Bedöm jobbet, Förbered ansökan eller Inget nästa steg ännu.
4. Importera de valda jobben. De sparas som utkast, med annonslänken i Dokumentunderlag.
5. Valda nästa steg finns i veckovyn. Boka tid där eller från ansökans kort när du vill fortsätta.

Länkarna normaliseras till LinkedIns jobb-id så att spårningsparametrar, landsdomäner och olika länkar till samma jobb inte skapar dubbletter. Även befintliga avslutade ansökningar räknas vid kontrollen. Granskning och avbryt ändrar inga registerposter eller bokningar. Importen behåller befintliga ansökningar, historik och anteckningar och bokar inga pass automatiskt, även när en deadline anges.

Inga uppgifter hämtas från LinkedIn-kontot och ingen LinkedIn-inloggning behövs. Tjänst och arbetsgivare fylls i av användaren; flödet är en manuell import och inte en löpande kontosynk.

Verifierat med produktionsbygge, 287 enhetstester och 11 webbläsarscenarier, inklusive import och bokning på desktop/mobil, tillgänglighet, dubbletter, bevarad lagring, befintlig ansökningsöversikt och navigation.

Bas: senaste publicerade versionen d2fcc20. Den tidigare opublicerade dagstarten och lågenergiläget saknades i den återstartade miljön och ingår inte i den här ändringen.
