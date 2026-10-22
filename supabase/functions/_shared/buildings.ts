// Pure building rules shared by the import Edge Function (Deno), the edit dialog and the tests.
// Keep this file free of Deno and DOM APIs so every runtime can import it.

export const TEMPLATE_COLUMNS = [
  "name",
  "address",
  "city",
  "country",
  "floors",
  "year_built",
] as const;

export const LIMITS = {
  text: 200,
  floorsMin: 0,
  floorsMax: 300,
  yearMin: 1000,
  yearMax: 2100,
} as const;

export type BuildingFields = {
  name: string;
  address: string | null;
  city: string | null;
  country: string | null;
  floors: number | null;
  year_built: number | null;
};

export type RowIssue = { row: number; reason: string };

export type ImportResult = {
  inserted: number;
  duplicates: number;
  invalidCount: number;
  invalid: RowIssue[];
};

export type ParsedRow = { value: BuildingFields; error?: undefined } | { error: string };

function toText(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

function toWhole(v: unknown, label: string, min: number, max: number): number | null | Error {
  const s = toText(v);
  if (s === null) return null;
  const n = Number(s);
  if (!Number.isInteger(n) || n < min || n > max) {
    return new Error(`${label} must be a whole number between ${min} and ${max}`);
  }
  return n;
}

// Spreadsheet headers like "Year Built" become "year_built".
function normalizeKeys(raw: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) out[k.trim().toLowerCase().replace(/\s+/g, "_")] = v;
  return out;
}

export function parseRow(raw: Record<string, unknown>): ParsedRow {
  const r = normalizeKeys(raw);
  const errors: string[] = [];

  const name = toText(r["name"]);
  if (name === null) errors.push("name is required");

  const texts = {
    name,
    address: toText(r["address"]),
    city: toText(r["city"]),
    country: toText(r["country"]),
  };
  for (const [label, value] of Object.entries(texts)) {
    if (value !== null && value.length > LIMITS.text) {
      errors.push(`${label} is longer than ${LIMITS.text} characters`);
    }
  }

  const floors = toWhole(r["floors"], "floors", LIMITS.floorsMin, LIMITS.floorsMax);
  if (floors instanceof Error) errors.push(floors.message);
  const year = toWhole(r["year_built"], "year_built", LIMITS.yearMin, LIMITS.yearMax);
  if (year instanceof Error) errors.push(year.message);

  if (errors.length > 0 || name === null) return { error: errors.join("; ") };
  return {
    value: {
      name,
      address: texts.address,
      city: texts.city,
      country: texts.country,
      floors: floors as number | null,
      year_built: year as number | null,
    },
  };
}

// Two buildings count as the same when name, address and city match, ignoring case and spacing.
export function duplicateKey(b: Pick<BuildingFields, "name" | "address" | "city">): string {
  return [b.name, b.address, b.city]
    .map((part) => (part ?? "").trim().toLowerCase().replace(/\s+/g, " "))
    .join("|");
}

export function prepareImport(
  raw: Record<string, unknown>[],
  existing: Pick<BuildingFields, "name" | "address" | "city">[],
): { rows: BuildingFields[]; duplicates: number; invalid: RowIssue[] } {
  const seen = new Set(existing.map(duplicateKey));
  const rows: BuildingFields[] = [];
  const invalid: RowIssue[] = [];
  let duplicates = 0;

  raw.forEach((record, i) => {
    const parsed = parseRow(record);
    if (parsed.error !== undefined) {
      // Row 1 is the header, so the first data row is row 2 in the spreadsheet.
      invalid.push({ row: i + 2, reason: parsed.error });
      return;
    }
    const key = duplicateKey(parsed.value);
    if (seen.has(key)) {
      duplicates += 1;
      return;
    }
    seen.add(key);
    rows.push(parsed.value);
  });

  return { rows, duplicates, invalid };
}
