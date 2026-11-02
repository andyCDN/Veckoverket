import { expect, it } from "vitest";
import { createData } from "../lib/defaults";
import { decodeData } from "../lib/storage";

it("adds Stadshuset to existing workspaces without changing saved plans", () => {
  const data = createData();
  data.categories = data.categories.filter((c) => c.id !== "stadshuset");
  const restored = decodeData(JSON.stringify(data));
  expect(restored.categories.find((c) => c.id === "stadshuset")).toMatchObject({
    name: "Stadshuset",
    targetMinutes: 0,
  });
  expect(restored.weeks).toEqual(data.weeks);
  expect(decodeData(JSON.stringify(restored)).categories).toEqual(
    restored.categories,
  );
});

it("preserves an existing custom Stadshuset category", () => {
  const data = createData();
  const category = data.categories.find((c) => c.id === "stadshuset")!;
  category.id = "custom-city-hall";
  category.targetMinutes = 120;
  const restored = decodeData(JSON.stringify(data));
  expect(restored.categories).toEqual(data.categories);
});
