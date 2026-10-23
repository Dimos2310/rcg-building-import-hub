import { describe, expect, it } from "vitest";
import type { Building } from "./buildings-api";
import { describeImport, isUnchanged, toDraft } from "./buildings";

describe("describeImport", () => {
  it("reports a clean import", () => {
    expect(describeImport({ inserted: 2, duplicates: 0, invalidCount: 0, invalid: [] })).toEqual({
      level: "success",
      title: "Imported 2 buildings.",
    });
  });

  it("uses the singular for one building", () => {
    expect(describeImport({ inserted: 1, duplicates: 0, invalidCount: 0, invalid: [] }).title).toBe(
      "Imported 1 building.",
    );
  });

  it("mentions duplicates and lists the first rejected rows", () => {
    const result = describeImport({
      inserted: 2,
      duplicates: 1,
      invalidCount: 5,
      invalid: [
        { row: 2, reason: "name is required" },
        { row: 3, reason: "floors must be a whole number between 0 and 300" },
        { row: 4, reason: "name is required" },
        { row: 5, reason: "name is required" },
        { row: 6, reason: "name is required" },
      ],
    });
    expect(result.level).toBe("success");
    expect(result.description).toBe(
      "1 duplicate skipped. 5 rows rejected (row 2: name is required; row 3: floors must be a whole number between 0 and 300; row 4: name is required; and 2 more).",
    );
  });

  it("warns when nothing was imported", () => {
    const result = describeImport({ inserted: 0, duplicates: 3, invalidCount: 0, invalid: [] });
    expect(result).toEqual({
      level: "warning",
      title: "Nothing was imported.",
      description: "3 duplicates skipped.",
    });
  });
});

describe("editing helpers", () => {
  const building: Building = {
    id: "1",
    user_id: "u",
    created_at: "2026-10-21T00:00:00Z",
    name: "Tower",
    address: "1 Main St",
    city: null,
    country: "Greece",
    floors: 12,
    year_built: null,
  };

  it("turns a building into input text, using empty strings for missing values", () => {
    expect(toDraft(building)).toEqual({
      name: "Tower",
      address: "1 Main St",
      city: "",
      country: "Greece",
      floors: "12",
      year_built: "",
    });
  });

  it("detects when nothing changed, so no request is sent", () => {
    const same = {
      name: "Tower",
      address: "1 Main St",
      city: null,
      country: "Greece",
      floors: 12,
      year_built: null,
    };
    expect(isUnchanged(building, same)).toBe(true);
    expect(isUnchanged(building, { ...same, city: "Athens" })).toBe(false);
    expect(isUnchanged(building, { ...same, floors: 13 })).toBe(false);
  });
});
