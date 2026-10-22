import { describe, expect, it } from "vitest";
import { describeImport } from "./buildings";

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
