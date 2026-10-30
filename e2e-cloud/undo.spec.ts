import { test, expect } from "@playwright/test";
import {
  mock,
  login,
  logout,
  row,
  plan,
  status,
  renameFirst,
  userA,
  userB,
  week,
} from "./helpers";

test("ångra sparas i molnet och historiken stannar i rätt konto samt rensas vid externa ändringar", async ({
  page,
}) => {
  const cloud = await mock(page);
  cloud.documents.set(userB, row(plan("Andra kontot")));
  await page.goto("./");
  await login(page);
  await status(page, "Sparat i molnet");
  const undo = page
    .locator(".workspace-tools")
    .getByRole("button", { name: "Ångra senaste ändringen", exact: true });
  await expect(undo).toBeDisabled();
  const before = structuredClone(cloud.documents.get(userA)!.data);
  await renameFirst(page, "Molnändring att ångra");
  await status(page, "Sparat i molnet");
  await undo.click();
  await status(page, "Sparat i molnet");
  expect(cloud.documents.get(userA)!.data).toEqual(before);
  await renameFirst(page, "Lokalt namn");
  await status(page, "Sparat i molnet");
  const current = cloud.documents.get(userA)!;
  cloud.documents.set(
    userA,
    row(
      { ...current.data, profile: { name: "Annan enhet" } },
      current.revision + 1,
    ),
  );
  await page.clock.fastForward(31000);
  await status(page, "Sparat i molnet");
  await expect(undo).toBeDisabled();
  await renameFirst(page, "Sista ändringen");
  await status(page, "Sparat i molnet");
  await expect(undo).toBeEnabled();
  await logout(page);
  await login(page, "b@example.test");
  await status(page, "Sparat i molnet");
  await expect(undo).toBeDisabled();
  expect(cloud.documents.get(userB)!.data.profile.name).toBe("Andra kontot");
  expect(
    cloud.documents
      .get(userB)!
      .data.weeks[week].activities.some((a) => a.title === "Sista ändringen"),
  ).toBe(false);
  expect(cloud.errors).toEqual([]);
});
