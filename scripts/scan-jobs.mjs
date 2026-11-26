import { readFile, rename, writeFile } from "node:fs/promises";
import { refreshWatchFeed } from "./job-watch-sources.mjs";

const file = new URL("../public/jobbspaning.json", import.meta.url);
const previous = JSON.parse(await readFile(file, "utf8"));
if (!Array.isArray(previous.jobs))
  throw new Error("Den befintliga jobbspaningen är ogiltig.");
const feed = await refreshWatchFeed(previous);
const temporary = new URL("../public/jobbspaning.json.tmp", import.meta.url);
await writeFile(temporary, JSON.stringify(feed, null, 2) + "\n");
await rename(temporary, file);
for (const source of feed.sources)
  console.log(
    `${source.id}: ${source.status}, ${source.count} aktuella träffar`,
  );
if (feed.sources.some((source) => source.status === "error"))
  process.exitCode = 1;
