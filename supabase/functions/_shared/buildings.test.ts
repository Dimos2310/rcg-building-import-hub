import { describe, expect, it } from "vitest";
import { duplicateKey, parsePatch, parseRow, prepareImport } from "./buildings.ts";

describe("parseRow", () => {
  it("accepts a full row and normalises header names", () => {
    const parsed = parseRow({
      Name: "  Tower ",
      Address: "1 Main St",
      City: "Athens",
      Country: "Greece",
      Floors: 12,
      "Year Built": "1998",
    });
    expect(parsed).toEqual({
      value: {
        name: "Tower",
        address: "1 Main St",
        city: "Athens",
        country: "Greece",
        floors: 12,
        year_built: 1998,
      },
    });
  });

  it("treats empty optional cells as null", () => {
    const parsed = parseRow({ name: "Hut", address: "", city: null, floors: "", year_built: null });
    expect(parsed).toEqual({
      value: {
        name: "Hut",
        address: null,
        city: null,
        country: null,
        floors: null,
        year_built: null,
      },
    });
  });

  it("requires a name", () => {
    expect(parseRow({ name: "  ", city: "Athens" })).toEqual({ error: "name is required" });
  });

  it.each([
    ["text", "n/a"],
    ["a decimal", 12.5],
    ["a negative number", -1],
    ["too many floors", 301],
  ])("rejects floors given as %s", (_label, floors) => {
    const parsed = parseRow({ name: "X", floors });
    expect(parsed.error).toMatch(/floors must be a whole number/);
  });

  it("rejects an implausible year", () => {
    expect(parseRow({ name: "X", year_built: 99 }).error).toMatch(/year_built must be/);
  });

  it("rejects over-long text", () => {
    expect(parseRow({ name: "x".repeat(201) }).error).toMatch(/name is longer than 200/);
  });

  it("reports every problem in one row", () => {
    const parsed = parseRow({ name: "", floors: "abc", year_built: "abc" });
    expect(parsed.error).toBe(
      "name is required; floors must be a whole number between 0 and 300; year_built must be a whole number between 1000 and 2100",
    );
  });
});

describe("duplicateKey", () => {
  it("ignores case and extra spacing", () => {
    const a = duplicateKey({ name: "Example  Tower", address: "1 Main St", city: "Athens" });
    const b = duplicateKey({ name: " example tower", address: "1 MAIN ST", city: "athens " });
    expect(a).toBe(b);
  });

  it("distinguishes buildings at different addresses", () => {
    const a = duplicateKey({ name: "Tower", address: "1 Main St", city: "Athens" });
    const b = duplicateKey({ name: "Tower", address: "2 Main St", city: "Athens" });
    expect(a).not.toBe(b);
  });
});

describe("prepareImport", () => {
  const existing = [{ name: "Old Tower", address: "9 Old St", city: "Patras" }];

  it("inserts new rows, skips duplicates and reports invalid rows with spreadsheet row numbers", () => {
    const result = prepareImport(
      [
        { name: "New Tower", address: "1 Main St", city: "Athens" },
        { name: "old tower", address: "9 OLD ST", city: "patras" },
        { name: "", address: "no name" },
        { name: "Bad Floors", floors: "n/a" },
        { name: "New Tower", address: "1 Main St", city: "Athens" },
      ],
      existing,
    );
    expect(result.rows.map((r) => r.name)).toEqual(["New Tower"]);
    expect(result.duplicates).toBe(2);
    expect(result.invalid).toEqual([
      { row: 4, reason: "name is required" },
      { row: 5, reason: "floors must be a whole number between 0 and 300" },
    ]);
  });

  it("imports everything when nothing exists yet", () => {
    const result = prepareImport([{ name: "A" }, { name: "B" }], []);
    expect(result.rows).toHaveLength(2);
    expect(result.duplicates).toBe(0);
    expect(result.invalid).toEqual([]);
  });

  it("returns nothing for an empty sheet", () => {
    expect(prepareImport([], existing)).toEqual({ rows: [], duplicates: 0, invalid: [] });
  });
});

describe("parsePatch", () => {
  it("keeps only the fields that were filled in", () => {
    expect(
      parsePatch({ address: "", city: " Patras ", country: "", floors: "", year_built: "2005" }),
    ).toEqual({ value: { city: "Patras", year_built: 2005 } });
  });

  it("ignores a name, because a bulk rename makes no sense", () => {
    expect(parsePatch({ name: "Everything", country: "Greece" })).toEqual({
      value: { country: "Greece" },
    });
  });

  it("requires at least one field", () => {
    expect(parsePatch({ city: "", floors: "" })).toEqual({
      error: "fill in at least one field to change",
    });
  });

  it("rejects invalid numbers and over-long text", () => {
    expect(parsePatch({ floors: "999" })).toEqual({
      error: "floors must be a whole number between 0 and 300",
    });
    expect(parsePatch({ city: "x".repeat(201) })).toEqual({
      error: "city is longer than 200 characters",
    });
  });
});
