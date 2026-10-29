# RISO-gränssnitt

Utformningen bygger på det uppladdade Veckoverket RISO Design Kit. Användarens instruktion om neutrala texter gäller framför designkittets exempeltexter. Manifest, slogans, motiverande stämplar och peppande statusmeddelanden ingår inte.

## Formspråk

- Papper `#F3EEDF`, ljust papper `#FAF6EB`, trycksvart `#24231F`.
- Blått `#234B8C`, korall `#E85B45`, blekt blått `#DBE5ED`, blekt korall `#F6D9CE`.
- Gemensamma variabler finns i `src/app/globals.css`. Konturer är 2 px, hörn är raka och skuggor har hård offset utan oskärpa. Text ligger över pappersstrukturen; dekorativa raster ligger i separata ytor.
- Anton är ett lokalt levererat, kondenserat rubriktypsnitt. Mastheaden breddas för att motsvara referensens Impact-uttryck. Övrig text använder Arial och metadata Courier New. Typsnittslicensen finns i `public/fonts/Anton-OFL.txt`.
- Kategorier har alltid textetiketter. RISO-paletten appliceras i presentationslagret via `src/lib/presentation.ts`; användarens sparade kategorifärger och övriga planeringsdata ändras inte.

## Komponenter och interaktion

`src/components/riso.tsx` innehåller `Masthead`, `RisoMark`, `EditorialSidebar` och `CategoryFilter`. Den befintliga kalendern, redigeringsdialogen, målhanteringen, inställningarna och reflektionen använder samma tema.

Kategorifiltret ändrar enbart vilka aktiviteter som visas. Alla aktiviteter finns kvar i lagring, tidsberäkning och konfliktvalidering. En filtrerad bort aktivitet gör därför inte den upptagna tiden bokningsbar.

Skriv ut-knappen anropar webbläsarens utskrift. Utskriftsstilen visar hela veckan och samtliga kategorier, oberoende av aktivt filter eller vald dag på mobilen. Kontroller och sidospalt döljs. Standardformat är liggande A4.

## Anpassningar från prototypen

- Den tidsproportionella kalendern och dess validerade dra-och-släpp behålls i stället för att ersättas av prototypens fristående passlista.
- Mobilen behåller en dagvy med dagval. Surfplatta och dator visar veckokolumner.
- Samtliga produktvyer nås via navigationen under mastheaden.
- Sidospalten visar riktiga mål, tidsfördelning och nästa aktivitet från appens state. Den innehåller inte prototypens manifest eller exempeldata.
- Utskrift och kategorifilter är kopplade till den befintliga datamodellen. Prototypens separata localStorage och provschema används inte.

## Verifiering

`npm test` kontrollerar planeringsmotor och lagring. `npm run test:pages` efter `npm run build:pages` kontrollerar de exporterade filerna: redigering, veckobyte, persistens, drag-and-drop, tillgänglighet, kategorifilter, utskrift och layout i 1440, 768 och 390 px. Webbläsartesterna sparar skärmbilder och ett PDF-schema i den ignorerade katalogen `test-results/`.
