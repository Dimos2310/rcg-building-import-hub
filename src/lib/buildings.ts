import type { BuildingFields, ImportResult } from "../../supabase/functions/_shared/buildings.ts";
import type { Building } from "@/lib/buildings-api";

export { TEMPLATE_COLUMNS } from "../../supabase/functions/_shared/buildings.ts";

const MAX_LISTED_ISSUES = 3;

// Turns the import function's result into the text shown to the user.
export function describeImport(res: ImportResult): {
  level: "success" | "warning";
  title: string;
  description?: string;
} {
  const lines: string[] = [];
  if (res.duplicates > 0) {
    lines.push(`${res.duplicates} duplicate${res.duplicates === 1 ? "" : "s"} skipped.`);
  }
  if (res.invalidCount > 0) {
    const listed = res.invalid
      .slice(0, MAX_LISTED_ISSUES)
      .map((i) => `row ${i.row}: ${i.reason}`)
      .join("; ");
    const more = res.invalidCount - Math.min(res.invalid.length, MAX_LISTED_ISSUES);
    lines.push(
      `${res.invalidCount} row${res.invalidCount === 1 ? "" : "s"} rejected (${listed}${more > 0 ? `; and ${more} more` : ""}).`,
    );
  }
  const description = lines.length > 0 ? lines.join(" ") : undefined;
  if (res.inserted === 0) {
    return {
      level: "warning",
      title: "Nothing was imported.",
      ...(description && { description }),
    };
  }
  return {
    level: "success",
    title: `Imported ${res.inserted} building${res.inserted === 1 ? "" : "s"}.`,
    ...(description && { description }),
  };
}

// Text the edit inputs hold while a row is being edited.
export type Draft = {
  name: string;
  address: string;
  city: string;
  country: string;
  floors: string;
  year_built: string;
};

export function toDraft(b: Building): Draft {
  return {
    name: b.name,
    address: b.address ?? "",
    city: b.city ?? "",
    country: b.country ?? "",
    floors: b.floors?.toString() ?? "",
    year_built: b.year_built?.toString() ?? "",
  };
}

// True when saving `fields` would not change the stored building, so no request is needed.
export function isUnchanged(b: Building, fields: BuildingFields): boolean {
  return (
    b.name === fields.name &&
    b.address === fields.address &&
    b.city === fields.city &&
    b.country === fields.country &&
    b.floors === fields.floors &&
    b.year_built === fields.year_built
  );
}
