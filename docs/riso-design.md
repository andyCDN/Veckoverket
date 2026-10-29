# PUNK × RISO v2.1

Utformningen bygger på det uppladdade kittet `Veckoverket-PUNK-RISO-v2.1-utan-pepp`. Alla texter är sakliga. Manifest, motiverande uppmaningar och slogans ingår inte.

## Formspråk

- Papper `#F1EAD6`, ljust papper `#FFF9E9`, xeroxsvart `#191918`.
- Blått `#243D9B`, rött `#F04B31`, gult `#F9C845`, blått papper `#DCE4F4` och rött papper `#FAE1D7`.
- Tema och referensens `--vv-*`-variabler finns i `src/app/punk.css`. `globals.css` innehåller gemensam layout, formulär, kalenderbeteende och utskriftsregler.
- Tvåradig masthead, omslagskollage, rött mittuppslag, gula utgåvemärken, svart kanttryck och blå baksida följer referensens struktur. Raster placeras i dekorativa fält; kompakt löptext ligger på solida ytor. Inmatning och navigering roteras inte.
- Anton levereras lokalt; Arial och Courier New används för löptext respektive metadata. Licensen finns i `public/fonts/Anton-OFL.txt`. Inga externa fontanrop eller nya bibliotek krävs.
- RISO-paletten appliceras via `src/lib/presentation.ts`. Användarens sparade kategorifärger, tider, mål och övriga planeringsdata ändras inte.

## Komponenter

`src/components/punk.tsx` innehåller `MastheadCover`, `CutoutMark`, `IssueSpread` och `BackCoverInfo`. Omslagets asterisk och favicon kommer från det nya kitets SVG-resurser. Raster och övrigt kollage byggs med CSS.

`src/components/riso.tsx` innehåller `EditorialSidebar` och `CategoryFilter`, kopplade till appens riktiga mål, tidsberäkningar och aktiviteter. Den befintliga kalendern, redigeringsdialogen, inställningarna och reflektionen använder samma tema.

Baksidans knappar öppnar befintlig veckoreflektion respektive lagringsinställningar. Baksidans information beskriver appens faktiska lagring, inte prototypens begränsningar.

## Responsivitet och utskrift

Datorer visar tidsproportionella veckokolumner. Under 950 px rullar enbart kalenderns egen yta horisontellt. Mobilens dagknappar navigerar till respektive kolumn, och markeringen följer den synliga dagen. Hela dokumentet ska inte rulla i sidled.

Utskrift visar hela veckan och alla kategorier, även efter filtrering eller rullning till en senare dag. Omslagsdekoration, sidospalt, kontroller och baksida döljs. Standardformat är liggande A4.

## Bevarad funktionalitet

Planeringsmotor, datamodell, databasstruktur och lagringsnycklar är oförändrade. Kategorifiltret ändrar enbart visningen; dolda aktiviteter ligger kvar i konfliktvalideringen. Alla kalenderhändelser kan bockas av och återställas direkt. Redigering, låsta/skyddade block, återkommande aktiviteter, uppgifter och veckohistorik använder den befintliga implementationen.

Prototypens JavaScript, lokala demolagring och exempelpass har inte importerats till produktionsappen. Befintliga sparade veckor ersätts inte med provdata.

## Verifiering

`npm test` kontrollerar planeringsmotor och lagring. `npm run test:pages` efter `npm run build:pages` kontrollerar de exporterade filerna: aktivitetsredigering, veckobyte, lagring, avbockning, dra-och-släpp, tillgänglighet, filter och utskrift. Layouten kontrolleras i 1440, 1024, 768 och 390 px. Tester sparar skärmbilder och ett PDF-schema i den ignorerade katalogen `test-results/`.
