import { expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  appendCvDocument,
  CV_FILE_SIZE_LIMIT,
  readCvFile,
  validateCvFiles,
  type CvImportedDocument,
  type CvImportFile,
} from "../lib/cv-file-import";
import { cvEvidenceSuggestions } from "../lib/job-cv-match";

const fixture = readFileSync(
  new URL("./fixtures/cv-import/kompetens.ppt", import.meta.url),
);
function file(name: string, bytes: Uint8Array = fixture): CvImportFile {
  return {
    name,
    size: bytes.length,
    text: async () => new TextDecoder().decode(bytes),
    arrayBuffer: async () => Uint8Array.from(bytes).buffer,
  };
}
const document: CvImportedDocument = {
  name: "mitt-cv.pptx",
  format: "pptx",
  text: "[Bild 1]\nErfarenhet av projektledning och politiskt arbete.",
  slides: 1,
  emptySlides: 0,
  hiddenSlides: 0,
};

it("läser en verklig binär PowerPoint med svensk text och tabellceller", async () => {
  const result = await readCvFile(file("kompetens.ppt"));
  expect(result).toMatchObject({
    format: "ppt",
    slides: 2,
    hiddenSlides: 1,
    emptySlides: 0,
  });
  expect(result.text).toContain("Kandidatexamen i statsvetenskap");
  expect(result.text).toContain(
    "Politiskt arbete 2012–2022: rådgivning och remissvar.",
  );
  expect(result.text).toContain("Svenska och engelska");
  expect(result.text).not.toContain("Privat talaranteckning");
  expect(result.text).not.toContain("Inaktuell text");
  expect(result.text.indexOf("[Bild 1]")).toBeLessThan(
    result.text.indexOf("[Bild 2]"),
  );
});

it("känner igen PPT-innehåll även med stor bokstav eller PPTX-filändelse", async () => {
  expect((await readCvFile(file("CV.PPT"))).format).toBe("ppt");
  expect((await readCvFile(file("felmärkt.pptx"))).format).toBe("ppt");
});

it("ger begripliga fel för trasiga eller andra filformat", async () => {
  await expect(
    readCvFile(
      file("broken.ppt", new TextEncoder().encode("Inte en PowerPoint")),
    ),
  ).rejects.toThrow("PowerPoint-format");
  await expect(
    readCvFile(
      file("broken.ppt", new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0, 0, 0, 0])),
    ),
  ).rejects.toThrow("PPT-filen kunde inte läsas");
  await expect(readCvFile(file("document.pdf"))).rejects.toThrow(
    ".ppt eller .pptx",
  );
  await expect(readCvFile(file("document.ppt.exe"))).rejects.toThrow();
});

it("kontrollerar storlek och antal innan filernas innehåll läses", async () => {
  await expect(
    readCvFile({ ...file("large.ppt"), size: CV_FILE_SIZE_LIMIT + 1 }),
  ).rejects.toThrow("20 MB");
  await expect(readCvFile({ ...file("empty.ppt"), size: 0 })).rejects.toThrow(
    "tom",
  );
  expect(() =>
    validateCvFiles(Array.from({ length: 11 }, () => file("cv.ppt"))),
  ).toThrow("10 filer");
  expect(() =>
    validateCvFiles(
      Array.from({ length: 4 }, () => ({
        ...file("cv.ppt"),
        size: CV_FILE_SIZE_LIMIT,
      })),
    ),
  ).toThrow("60 MB");
  expect(() =>
    validateCvFiles([file("cv.ppt"), file("cv.pptx")]),
  ).not.toThrow();
});

it("lägger till flera källor utan att skriva över egna texter eller dubblera samma import", () => {
  const existing = "Egen verifierad erfarenhet som måste vara kvar.";
  const first = appendCvDocument(existing, document);
  expect(first.added).toBe(true);
  expect(first.text).toContain(existing);
  expect(first.text).toContain("[Källa: mitt-cv.pptx]");
  expect(first.text).toContain(document.text);
  expect(appendCvDocument(first.text, document)).toEqual({
    added: false,
    text: first.text,
  });
  expect(
    appendCvDocument(first.text, { ...document, name: "kopia.ppt" }).added,
  ).toBe(false);
  const second = appendCvDocument(first.text, {
    ...document,
    name: "meriter.ppt",
    text: "[Bild 1]\nPersonalansvar för fem medarbetare.",
  });
  expect(second.text).toContain("[Källa: meriter.ppt]");
  expect(second.text).toContain(document.text);
  expect(() => appendCvDocument("a".repeat(60000), document)).toThrow(
    "Befintlig text är kvar",
  );
});

it("bevarar enkla textfiler och avvisar tom eller för stor text", async () => {
  const value = "Statsvetenskap, projektledning och organisationsutveckling.";
  const result = await readCvFile(
    file("cv.txt", new TextEncoder().encode(value)),
  );
  expect(appendCvDocument("", result).text).toBe(value);
  await expect(
    readCvFile(file("cv.md", new TextEncoder().encode(" "))),
  ).rejects.toThrow("tom");
  await expect(
    readCvFile(file("cv.txt", new TextEncoder().encode("a".repeat(60001)))),
  ).rejects.toThrow("60 000");
});

it("använder inte filnamn eller bildrubriker som belägg för en kvalifikation", () => {
  const cv =
    "[Källa: underlag. Doktorsexamen.pptx]\n[Bild 1]\nProjektledning och samhällsarbete.";
  expect(cvEvidenceSuggestions("Doktorsexamen krävs.", cv)).toEqual([]);
  expect(
    cvEvidenceSuggestions("Erfarenhet av projektledning krävs.", cv),
  ).toEqual(["Projektledning och samhällsarbete."]);
});
