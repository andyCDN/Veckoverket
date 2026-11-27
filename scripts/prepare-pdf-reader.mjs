import { cp, mkdir, copyFile, readFile } from "node:fs/promises";

export async function preparePdfReader() {
  const source = new URL("../node_modules/pdfjs-dist/", import.meta.url);
  const { version } = JSON.parse(
    await readFile(new URL("package.json", source), "utf8"),
  );
  const target = new URL(`../public/vendor/pdfjs/${version}/`, import.meta.url);
  await mkdir(target, { recursive: true });
  await copyFile(
    new URL("build/pdf.worker.min.mjs", source),
    new URL("pdf.worker.min.mjs", target),
  );
  for (const directory of ["cmaps", "standard_fonts"]) {
    await cp(
      new URL(`${directory}/`, source),
      new URL(`${directory}/`, target),
      { recursive: true },
    );
  }
  await mkdir(new URL("../public/third-party/", import.meta.url), {
    recursive: true,
  });
  await copyFile(
    new URL("LICENSE", source),
    new URL("../public/third-party/pdfjs-LICENSE.txt", import.meta.url),
  );
}
