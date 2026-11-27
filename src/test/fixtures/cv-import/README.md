# PowerPoint-underlag för tester

Alla utbildningar, erfarenheter och årtal i dessa filer är syntetiska testdata.

- `kompetens.pptx`: svensk text, tabell, talaranteckning och en dold bild.
- `kompetens.ppt`: samma presentation exporterad till PowerPoint 97–2003 med LibreOffice. Används för att testa riktig binär PPT, inte en omdöpt PPTX.
- `erfarenhet.pptx`: en separat presentation med kompletterande erfarenheter.
- `bildmall.pptx` och `bildmall.ppt`: en tom presentationsbild vars meriter i stället ligger som fasta texter i bildmallen och sidlayouten. Äldre import hittade ingen text här. Mallarnas exempeltexter för platshållare ska inte räknas som CV-innehåll.

PPTX-filerna skapades med python-pptx. Bara presentationsbildernas läsbara text ska importeras; talaranteckningen och den dolda bildens text ska inte förekomma i CV-underlaget.
