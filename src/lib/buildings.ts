import type { ImportResult } from "../../supabase/functions/_shared/buildings.ts";

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
