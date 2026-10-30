import { test, expect } from "@playwright/test";
import {
  mock,
  login,
  logout,
  status,
  plan,
  row,
  week,
  userA,
  userB,
} from "./helpers";
test("ansökningar och kontaktlogg molnsparas, återläses och hålls åtskilda mellan konton", async ({
  page,
}) => {
  const original = plan("Molnplan");
  original.weeks[week].activities[0].status = "done";
  const f = await mock(page, row(original));
  f.documents.set(userB, row(plan("Andra kontot")));
  await page.goto("./");
  await login(page);
  await status(page, "Sparat i molnet");
  const nav = () =>
    page
      .getByRole("navigation", { name: "Huvudnavigation" })
      .getByRole("button", { name: "Jobb & nätverk", exact: true })
      .click();
  await nav();
  await page.getByRole("button", { name: "Ny ansökan", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Organisation", { exact: true }).fill("Bolaget");
  await dialog.getByLabel("Tjänst", { exact: true }).fill("Analytiker");
  await dialog
    .getByRole("button", { name: "Spara ansökan", exact: true })
    .click();
  await status(page, "Sparat i molnet");
  expect(f.documents.get(userA)!.data.applications?.[0].role).toBe(
    "Analytiker",
  );
  await page.getByRole("button", { name: "Kontaktlogg", exact: true }).click();
  await page.getByRole("button", { name: "Ny kontakt", exact: true }).click();
  await dialog.getByLabel("Namn", { exact: true }).fill("Kim");
  await dialog
    .getByRole("button", { name: "Lägg till kontaktanteckning" })
    .click();
  await dialog
    .getByRole("textbox", { name: "Anteckning", exact: true })
    .fill("Samtal om rollen");
  await dialog
    .getByRole("button", { name: "Spara kontakt", exact: true })
    .click();
  await status(page, "Sparat i molnet");
  expect(f.documents.get(userA)!.data.contacts?.[0].entries[0].notes).toBe(
    "Samtal om rollen",
  );
  await page.getByRole("button", { name: "Ansökningar", exact: true }).click();
  await page
    .getByRole("button", { name: "Redigera ansökan", exact: true })
    .click();
  await dialog
    .getByRole("combobox", { name: "Status", exact: true })
    .selectOption("interview");
  await dialog
    .getByLabel("Nästa steg", { exact: true })
    .fill("Förbered intervju");
  await dialog.getByLabel("Uppföljningsdatum").fill("2026-10-30");
  await dialog.getByRole("checkbox", { name: "Kim", exact: true }).check();
  await dialog
    .getByRole("button", { name: "Spara ansökan", exact: true })
    .click();
  await status(page, "Sparat i molnet");
  expect(
    f.documents.get(userA)!.data.applications?.[0].history?.map((e) => e.kind),
  ).toEqual(["created", "status", "action"]);
  expect(f.documents.get(userA)!.data.applications?.[0].contactIds).toEqual([
    f.documents.get(userA)!.data.contacts![0].id,
  ]);
  expect(f.documents.get(userA)!.data.weeks).toEqual(original.weeks);
  await page.reload();
  await status(page, "Sparat i molnet");
  await nav();
  await expect(
    page.getByRole("heading", { name: "Analytiker · Bolaget" }),
  ).toBeVisible();
  await logout(page);
  await login(page, "b@example.test");
  await status(page, "Sparat i molnet");
  await nav();
  await expect(
    page.getByRole("heading", { name: "Analytiker · Bolaget" }),
  ).toHaveCount(0);
  expect(f.documents.get(userB)!.data.applications).toBeUndefined();
  expect(f.writes.every((w) => w.user === userA)).toBe(true);
  expect(f.errors).toEqual([]);
});

test("dokument och intervjuanteckningar återläses från molnet med bevarade avklarade pass", async ({
  page,
}) => {
  const original = plan("Molnplan");
  const done = original.weeks[week].activities[0];
  done.status = "done";
  original.weeks[week].activities = [done];
  original.weeks[week].weeklyRoutinesFrom = week;
  original.applications = [
    {
      id: "application",
      organization: "Bolaget",
      role: "Analytiker",
      status: "sent",
      deadline: "",
      nextAction: "",
      followUpDate: "",
      notes: "",
    },
  ];
  const f = await mock(page, row(original));
  await page.goto("./");
  await login(page);
  await status(page, "Sparat i molnet");
  await page
    .getByRole("navigation", { name: "Huvudnavigation" })
    .getByRole("button", { name: "Jobb & nätverk", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await page
    .getByRole("button", { name: "Dokumentunderlag", exact: true })
    .click();
  await dialog.getByLabel("Annonstext", { exact: true }).fill("Sparad annons");
  await dialog
    .getByRole("button", { name: "Lägg till dokument", exact: true })
    .click();
  await dialog
    .getByLabel("Dokumentlänk", { exact: true })
    .fill("https://example.test/cv-v2");
  await dialog
    .getByRole("button", { name: "Spara dokumentunderlag", exact: true })
    .click();
  await status(page, "Sparat i molnet");
  await page
    .getByRole("button", { name: "Boka intervju", exact: true })
    .click();
  await dialog.getByLabel("Intervjudatum", { exact: true }).fill("2026-10-30");
  await dialog.getByLabel("Intervjuns starttid", { exact: true }).fill("13:30");
  await dialog
    .getByRole("button", {
      name: "Spara intervju och förberedelse",
      exact: true,
    })
    .click();
  await status(page, "Sparat i molnet");
  await page
    .getByRole("button", { name: "Intervjuanteckningar", exact: true })
    .click();
  await dialog
    .getByLabel("Anteckningar efter intervjun", { exact: true })
    .fill("Nästa samtal om en vecka.");
  await dialog
    .getByRole("button", { name: "Markera intervjun genomförd", exact: true })
    .click();
  await status(page, "Sparat i molnet");
  const saved = structuredClone(f.documents.get(userA)!.data);
  expect(saved.applications![0].materials?.[0].url).toBe(
    "https://example.test/cv-v2",
  );
  expect(saved.applications![0].interviews?.[0].outcomeNotes).toBe(
    "Nästa samtal om en vecka.",
  );
  expect(saved.weeks[week].activities.find((a) => a.id === done.id)).toEqual(
    done,
  );
  await page.reload();
  await status(page, "Sparat i molnet");
  expect(f.documents.get(userA)!.data.applications).toEqual(saved.applications);
  expect(f.errors).toEqual([]);
});

test("deadlinebokning molnsparas och återläses med bevarade avklarade och importerade tider", async ({
  page,
}) => {
  const original = plan("Deadlineplan");
  const done = original.weeks[week].activities[0];
  done.status = "done";
  const external = {
    ...done,
    id: "external",
    blockType: "locked" as const,
    title: "Kalendermöte",
    date: "2026-10-30",
    start: 780,
    end: 840,
    estimatedMinutes: 60,
    status: "planned" as const,
    source: "external" as const,
    external: {
      provider: "google-calendar" as const,
      calendarId: "c",
      eventId: "e",
      allDay: false,
      busy: true,
      originalStart: "2026-10-30T13:00:00+01:00",
      originalEnd: "2026-10-30T14:00:00+01:00",
    },
  };
  original.weeks[week].activities = [done, external];
  original.weeks[week].weeklyRoutinesFrom = week;
  const f = await mock(page, row(original));
  await page.goto("./");
  await login(page);
  await status(page, "Sparat i molnet");
  await page
    .getByRole("navigation", { name: "Huvudnavigation" })
    .getByRole("button", { name: "Jobb & nätverk", exact: true })
    .click();
  await page.getByRole("button", { name: "Ny ansökan", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Organisation", { exact: true }).fill("Bolaget");
  await dialog.getByLabel("Tjänst", { exact: true }).fill("Analytiker");
  await dialog.getByLabel("Ansökningsdeadline").fill("2026-10-30");
  await dialog
    .getByRole("button", { name: "Spara ansökan", exact: true })
    .click();
  await status(page, "Sparat i molnet");
  const reserved = f.documents.get(userA)!.data.weeks[week].activities;
  expect(reserved.filter((a) => a.deadlineId)).toHaveLength(1);
  expect(reserved).toContainEqual(done);
  expect(reserved).toContainEqual(external);
  const work = reserved.find((a) => a.deadlineId)!;
  expect(work.end <= external.start || work.start >= external.end).toBe(true);
  await page.reload();
  await status(page, "Sparat i molnet");
  await page
    .getByRole("navigation", { name: "Huvudnavigation" })
    .getByRole("button", { name: "Jobb & nätverk", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Redigera ansökan", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "Spara ansökan", exact: true })
    .click();
  await status(page, "Sparat i molnet");
  expect(f.documents.get(userA)!.data.weeks[week].activities).toEqual(reserved);
  expect(f.errors).toEqual([]);
});
