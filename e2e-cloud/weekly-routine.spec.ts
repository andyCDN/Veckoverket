import { test, expect } from "@playwright/test";
import { mock, login, status, userA, week, plan, row } from "./helpers";

test("befintlig molnplan uppdateras en gång och bevarar tidigare datum", async ({
  page,
}) => {
  const legacy = plan("Befintlig plan");
  legacy.categories = legacy.categories.filter(
    (c) => c.id !== "weekly-planning",
  );
  legacy.weeks[week].activities = legacy.weeks[week].activities.filter(
    (a) => !a.routine,
  );
  delete legacy.weeks[week].weeklyRoutinesFrom;
  delete legacy.weeks[week].targets?.["weekly-planning"];
  const past = structuredClone(
    legacy.weeks[week].activities.filter((a) => a.date < "2026-10-29"),
  );
  const f = await mock(page, row(legacy));
  await page.goto("./");
  await login(page);
  await expect
    .poll(
      () =>
        f.documents
          .get(userA)!
          .data.weeks[week].activities.filter((a) => a.routine).length,
    )
    .toBe(1);
  await status(page, "Sparat i molnet");
  const saved = f.documents.get(userA)!.data.weeks[week];
  expect(saved.activities.filter((a) => a.date < "2026-10-29")).toEqual(past);
  expect(saved.activities.find((a) => a.routine)?.routine).toBe("week-review");
  expect(f.writes).toHaveLength(1);
  await page.reload();
  await status(page, "Sparat i molnet");
  expect(f.writes).toHaveLength(1);
  expect(f.errors).toEqual([]);
});

test("veckoplaneringens övningar och målstatus sparas i kontot och återläses", async ({
  page,
}) => {
  const f = await mock(page);
  await page.goto("./");
  await login(page);
  await page
    .locator(".calendar-block")
    .filter({ hasText: "Veckoavstämning" })
    .click();
  await page
    .getByLabel(/^Sammanfattning av veckan/)
    .fill("Sparad sammanfattning i molnet.");
  await page
    .getByLabel(/^Bedömning av måluppfyllelse/)
    .fill("Två mål delvis klara.");
  await page
    .getByLabel(/^Plan inför nästa vecka/)
    .fill("Fortsätt projektet på onsdag.");
  await page
    .getByRole("button", { name: "Markera som genomförd", exact: true })
    .click();
  await status(page, "Sparat i molnet");
  const saved = f.documents.get(userA)!.data;
  expect(saved.reflections[week].goalReview).toBe("Två mål delvis klara.");
  expect(
    saved.weeks[week].activities.find((a) => a.routine === "week-review")
      ?.status,
  ).toBe("done");
  await page.reload();
  await page
    .locator(".calendar-block")
    .filter({ hasText: "Veckoavstämning" })
    .click();
  await expect(page.getByLabel(/^Plan inför nästa vecka/)).toHaveValue(
    "Fortsätt projektet på onsdag.",
  );
  expect(f.errors).toEqual([]);
});
