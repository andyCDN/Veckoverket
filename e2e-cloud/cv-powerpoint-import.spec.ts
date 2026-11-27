import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { unzipSync, zipSync, strToU8 } from "fflate";
import { mock, row, login, userA } from "./helpers";
import { applicationFlowFixture } from "../src/test/fixtures/application-flow";
import { navigateTo } from "../e2e/navigation";

const existing =
  "Eget verifierat CV-underlag. Min tidigare erfarenhet ska bevaras när fler filer läses in.";
const root = resolve("src/test/fixtures/cv-import");
async function setup(page: Page, width = 1440) {
  await page.setViewportSize({ width, height: 1000 });
  const data = applicationFlowFixture();
  data.jobSearch = {
    cvProfile: {
      text: existing,
      updatedAt: "2026-11-23T08:00:00Z",
      checks: [],
    },
  };
  const f = await mock(page, row(data));
  await page.clock.setFixedTime(new Date("2026-11-23T08:00:00Z"));
  await page.goto("./");
  await login(page);
  await navigateTo(page, "Jobb");
  await page.getByText("Fler verktyg", { exact: true }).click();
  await page
    .getByRole("button", { name: "CV för jobbmatchning", exact: true })
    .click();
  return {
    f,
    data,
    editor: page.getByRole("dialog", {
      name: "CV för jobbmatchning",
      exact: true,
    }),
  };
}
const upload = (page: Page) =>
  page.getByLabel("Läs in filer (PowerPoint eller text)", { exact: true });

for (const format of ["ppt", "pptx"]) {
  for (const width of [1440, 390]) {
    test(`text från bildmall och sidlayout kan importeras från ${format} ${width}`, async ({
      page,
    }) => {
      const { f, editor } = await setup(page, width);
      const choose = page.waitForEvent("filechooser");
      await upload(page).click();
      const chooser = await choose;
      // The native picker must allow files even if a provider supplies no MIME
      // type or a generic one. setInputFiles alone bypasses this picker filter.
      expect(await chooser.element().getAttribute("accept")).toBeNull();
      expect(chooser.isMultiple()).toBe(true);
      await chooser.setFiles({
        name: `bildmall.${format.toUpperCase()}`,
        mimeType: "application/octet-stream",
        buffer: readFileSync(resolve(root, `bildmall.${format}`)),
      });
      await expect(
        editor.getByRole("region", { name: "Inlästa filer", exact: true }),
      ).toContainText("1 fil tillagd");
      const text = editor.getByLabel("Klistra in CV-text", { exact: true });
      await expect(text).toHaveValue(/Kandidatexamen i statsvetenskap/);
      await expect(text).toHaveValue(/Svenska och engelska från sidlayouten/);
      const value = await text.inputValue();
      expect(value).not.toMatch(
        /Click to edit|Master text styles|Second level/iu,
      );
      expect(value.match(/Kandidatexamen/gu)).toHaveLength(1);
      expect(f.writes).toHaveLength(0);
      await editor
        .getByRole("button", { name: "Spara CV-underlag", exact: true })
        .click();
      await expect
        .poll(() => f.documents.get(userA)!.data.jobSearch?.cvProfile?.text)
        .toBe(value);
      expect(f.errors).toEqual([]);
    });
  }
}

test("dold bildmall används inte och teknisk felorsak kan läsas", async ({
  page,
}) => {
  const { f, editor } = await setup(page);
  const files = unzipSync(readFileSync(resolve(root, "bildmall.pptx")));
  files["ppt/slides/slide1.xml"] = strToU8(
    new TextDecoder()
      .decode(files["ppt/slides/slide1.xml"])
      .replace("<p:sld ", '<p:sld showMasterSp="0" '),
  );
  await upload(page).setInputFiles({
    name: "dold-bildmall.pptx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    buffer: Buffer.from(zipSync(files)),
  });
  const results = editor.getByRole("region", {
    name: "Inlästa filer",
    exact: true,
  });
  await expect(results).toContainText("Ingen läsbar text hittades");
  await results.getByText("Visa teknisk felorsak", { exact: true }).click();
  await expect(results).toContainText("NO_SLIDE_TEXT");
  await expect(results).toContainText("1 synliga");
  await expect(
    editor.getByLabel("Klistra in CV-text", { exact: true }),
  ).toHaveValue(existing);
  expect(f.writes).toHaveLength(0);
  expect(f.errors).toEqual([]);
});

for (const width of [1440, 390]) {
  test(`flera PPT och PPTX kan blandas, granskas och sparas utan att ett trasigt dokument tar bort något ${width}`, async ({
    page,
  }) => {
    const { f, data, editor } = await setup(page, width);
    const requests: string[] = [];
    page.on("request", (request) => {
      if (
        request.method() === "POST" &&
        !request.url().includes("127.0.0.1:54321")
      )
        requests.push(request.url());
    });
    await expect(upload(page)).toHaveAttribute("multiple", "");
    await upload(page).setInputFiles([
      {
        name: "kompetens.ppt",
        mimeType: "application/vnd.ms-powerpoint",
        buffer: readFileSync(resolve(root, "kompetens.ppt")),
      },
      {
        name: "erfarenhet.pptx",
        mimeType:
          "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        buffer: readFileSync(resolve(root, "erfarenhet.pptx")),
      },
      {
        name: "trasig.ppt",
        mimeType: "application/vnd.ms-powerpoint",
        buffer: Buffer.from("Detta är inte en PowerPoint-fil."),
      },
    ]);
    const results = editor.getByRole("region", {
      name: "Inlästa filer",
      exact: true,
    });
    await expect(results).toContainText(
      "2 filer tillagda · 1 kunde inte läsas",
    );
    await expect(results).toContainText("1 dold bild överhoppad");
    await results.screenshot({
      path: `test-results/powerpoint-import-${width}.png`,
    });
    const text = editor.getByLabel("Klistra in CV-text", { exact: true });
    await expect(text).toHaveValue(/Eget verifierat CV-underlag/);
    await expect(text).toHaveValue(/\[Källa: kompetens.ppt\]/);
    await expect(text).toHaveValue(/Kandidatexamen i statsvetenskap/);
    await expect(text).toHaveValue(/Svenska och engelska/);
    await expect(text).toHaveValue(/\[Källa: erfarenhet.pptx\]/);
    await expect(text).toHaveValue(/Personalansvar för fem medarbetare/);
    expect(await text.inputValue()).not.toContain("Privat talaranteckning");
    expect(await text.inputValue()).not.toContain("Inaktuell text");
    expect(f.writes).toHaveLength(0);
    expect(requests).toEqual([]);
    const before = await text.inputValue();
    await upload(page).setInputFiles(resolve(root, "kompetens.ppt"));
    await expect(results).toContainText("Redan inläst");
    await expect(text).toHaveValue(before);
    await editor
      .getByRole("button", { name: "Spara CV-underlag", exact: true })
      .click();
    await expect
      .poll(() => f.documents.get(userA)!.data.jobSearch?.cvProfile?.text)
      .toBe(before);
    await page.reload();
    await navigateTo(page, "Jobb");
    await page.getByText("Fler verktyg", { exact: true }).click();
    await page
      .getByRole("button", { name: "CV för jobbmatchning", exact: true })
      .click();
    await expect(
      page.getByLabel("Klistra in CV-text", { exact: true }),
    ).toHaveValue(before);
    expect(f.documents.get(userA)!.data.applications).toEqual(
      data.applications,
    );
    expect(f.documents.get(userA)!.data.weeks).toEqual(data.weeks);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(f.errors).toEqual([]);
  });
}

test("PPTX läser presentationens ordning och hoppar över dolda och borttagna bilder", async ({
  page,
}) => {
  const { f, editor } = await setup(page);
  const p = "http://schemas.openxmlformats.org/presentationml/2006/main",
    a = "http://schemas.openxmlformats.org/drawingml/2006/main",
    r = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
  const slide = (text: string, hidden = false) =>
    strToU8(
      `<p:sld xmlns:p="${p}" xmlns:a="${a}"${hidden ? ' show="0"' : ""}><p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>${text}</a:t></a:r></a:p></p:txBody></p:sp><p:sp><p:nvSpPr><p:cNvPr hidden="1"/></p:nvSpPr><p:txBody><a:p><a:r><a:t>Dolt textobjekt ska inte läsas</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>`,
    );
  const bytes = zipSync({
    "ppt/presentation.xml": strToU8(
      `<p:presentation xmlns:p="${p}" xmlns:r="${r}"><p:sldIdLst><p:sldId r:id="s2"/><p:sldId r:id="s1"/><p:sldId r:id="hidden"/></p:sldIdLst></p:presentation>`,
    ),
    "ppt/_rels/presentation.xml.rels": strToU8(
      `<Relationships><Relationship Id="s1" Type="${r}/slide" Target="slides/slide99.xml"/><Relationship Id="s2" Type="${r}/slide" Target="slides/slide3.xml"/><Relationship Id="hidden" Type="${r}/slide" Target="slides/slide8.xml"/></Relationships>`,
    ),
    "ppt/slides/slide99.xml": slide(
      "Stats</a:t></a:r><a:r><a:t>vetenskap &amp; förvaltning",
    ),
    "ppt/slides/slide3.xml": slide("Projektledning kommer först"),
    "ppt/slides/slide8.xml": slide("Dold gammal erfarenhet", true),
    "ppt/slides/slide50.xml": slide("Borttagen äldre erfarenhet"),
  });
  await upload(page).setInputFiles({
    name: "ordning.PPTX",
    mimeType:
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    buffer: Buffer.from(bytes),
  });
  await expect(
    editor.getByRole("region", { name: "Inlästa filer", exact: true }),
  ).toContainText("1 fil tillagd");
  const value = await editor
    .getByLabel("Klistra in CV-text", { exact: true })
    .inputValue();
  expect(value).toContain("Statsvetenskap & förvaltning");
  expect(value.indexOf("Projektledning kommer först")).toBeLessThan(
    value.indexOf("Statsvetenskap & förvaltning"),
  );
  expect(value).not.toContain("Borttagen äldre erfarenhet");
  expect(value).not.toContain("Dold gammal erfarenhet");
  expect(value).not.toContain("Dolt textobjekt");
  expect(f.writes).toHaveLength(0);
  expect(f.errors).toEqual([]);
});

test("felaktiga och för stora arkiv bevarar tidigare text och kan avbrytas utan sparning", async ({
  page,
}) => {
  const { f, editor } = await setup(page);
  const large = zipSync({
    "ppt/presentation.xml": strToU8("x".repeat(2 * 1024 * 1024 + 1)),
  });
  await upload(page).setInputFiles({
    name: "för-stor-text.pptx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    buffer: Buffer.from(large),
  });
  await expect(
    editor.getByRole("region", { name: "Inlästa filer", exact: true }),
  ).toContainText("textdelar är för stora");
  await expect(
    editor.getByLabel("Klistra in CV-text", { exact: true }),
  ).toHaveValue(existing);
  await upload(page).setInputFiles(resolve(root, "erfarenhet.pptx"));
  await expect(
    editor.getByLabel("Klistra in CV-text", { exact: true }),
  ).toHaveValue(/Personalansvar/);
  await editor.getByRole("button", { name: "Avbryt", exact: true }).click();
  await page
    .getByRole("button", { name: "CV för jobbmatchning", exact: true })
    .click();
  await expect(
    editor.getByLabel("Klistra in CV-text", { exact: true }),
  ).toHaveValue(existing);
  expect(f.writes).toHaveLength(0);
  expect(f.errors).toEqual([]);
});
