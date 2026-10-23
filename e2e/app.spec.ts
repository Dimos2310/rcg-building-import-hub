import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";
import * as XLSX from "xlsx";

// Authenticated tests need an existing, confirmed user:
//   E2E_EMAIL=you@example.com E2E_PASSWORD=... npm run test:e2e
const email = process.env["E2E_EMAIL"];
const password = process.env["E2E_PASSWORD"];
const supabaseUrl = process.env["VITE_SUPABASE_URL"] ?? "https://zhsevbaeijsrfqfpcgox.supabase.co";
const supabaseKey =
  process.env["VITE_SUPABASE_PUBLISHABLE_KEY"] ?? "sb_publishable_w9gx10EF6EuPxc-28n38xg_x9z0u0OU";

const PREFIX = `E2E-${Date.now()}`;

async function login(page: Page) {
  await page.goto("/auth");
  await page.getByLabel("Email").fill(email!);
  await page.getByLabel("Password").fill(password!);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/buildings$/);
}

function workbook(rows: unknown[][], name: string) {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Buildings");
  return {
    name,
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xlsx" })),
  };
}

test.describe("signed out", () => {
  test("/ redirects to the login page", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/auth$/);
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  });

  test("the private page redirects to login instead of showing data", async ({ page }) => {
    await page.goto("/buildings");
    await expect(page).toHaveURL(/\/auth$/);
    await expect(page.getByText("Download Excel template")).toHaveCount(0);
  });

  test("a wrong password shows an error and stays on the login page", async ({ page }) => {
    await page.goto("/auth");
    await page.getByLabel("Email").fill("nobody@example.com");
    await page.getByLabel("Password").fill("definitely-wrong");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.getByText("Invalid login credentials")).toBeVisible();
    await expect(page).toHaveURL(/\/auth$/);
  });

  test("an unknown route shows the not-found page", async ({ page }) => {
    await page.goto("/some/deep/link");
    await expect(page.getByText("Page not found")).toBeVisible();
  });
});

test.describe("signed in", () => {
  test.skip(!email || !password, "set E2E_EMAIL and E2E_PASSWORD to run the signed-in tests");

  test.afterAll(async () => {
    if (!email || !password) return;
    const supabase = createClient(supabaseUrl, supabaseKey);
    await supabase.auth.signInWithPassword({ email, password });
    await supabase.from("buildings").delete().like("name", `${PREFIX}%`);
  });

  test("login, hard refresh and sign out", async ({ page }) => {
    await login(page);
    await page.reload();
    await expect(page).toHaveURL(/\/buildings$/);
    await expect(page.getByRole("heading", { name: "Buildings" })).toBeVisible();

    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/auth$/);
    await page.goBack();
    await expect(page).toHaveURL(/\/auth$/);
    await expect(page.getByText("Download Excel template")).toHaveCount(0);
  });

  test("the Excel template downloads with the expected columns", async ({ page }) => {
    await login(page);
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Download Excel template" }).click(),
    ]);
    expect(download.suggestedFilename()).toBe("buildings-template.xlsx");
    const wb = XLSX.read(readFileSync((await download.path())!));
    const first = wb.Sheets[wb.SheetNames[0]!]!;
    const header = XLSX.utils.sheet_to_json<string[]>(first, { header: 1 })[0];
    expect(header).toEqual(["name", "address", "city", "country", "floors", "year_built"]);
  });

  test("importing validates rows and skips duplicates on a second import", async ({ page }) => {
    await login(page);
    const file = () =>
      workbook(
        [
          ["Name", "Address", "City", "Country", "Floors", "Year Built"],
          [`${PREFIX} Tower`, "1 Main St", "Athens", "Greece", 12, 1998],
          [`${PREFIX} Annex`, "2 Side St", "Patras", "Greece", 5, null],
          ["", "no name here", "Nowhere", "", 3, 2001],
          [`${PREFIX} Broken`, "3 Bad St", "Athens", "Greece", "n/a", null],
        ],
        "import.xlsx",
      );

    await page.locator('input[type="file"]').setInputFiles(file());
    await expect(page.getByText("Imported 2 buildings.")).toBeVisible();
    await expect(page.getByText(/2 rows rejected/)).toBeVisible();
    await expect(page.getByText(/row 4: name is required/)).toBeVisible();
    await expect(page.getByRole("cell", { name: `${PREFIX} Tower`, exact: true })).toBeVisible();
    await expect(page.getByRole("cell", { name: `${PREFIX} Annex`, exact: true })).toBeVisible();
    await expect(page.getByRole("cell", { name: "no name here", exact: true })).toHaveCount(0);
    await expect(page.getByRole("cell", { name: `${PREFIX} Broken`, exact: true })).toHaveCount(0);

    // Same file again: everything valid is now a duplicate, so nothing new is stored.
    await page.locator('input[type="file"]').setInputFiles(file());
    await expect(page.getByText("Nothing was imported.")).toBeVisible();
    await expect(page.getByText(/2 duplicates skipped/)).toBeVisible();
    await expect(page.getByRole("cell", { name: `${PREFIX} Tower`, exact: true })).toHaveCount(1);
  });

  test("a building is edited in place and validation errors are shown", async ({ page }) => {
    await login(page);
    const name = `${PREFIX} Edit Me`;
    await page.locator('input[type="file"]').setInputFiles(
      workbook(
        [
          ["name", "address", "city", "country", "floors", "year_built"],
          [name, "5 Edit St", "Athens", "Greece", 4, 1990],
        ],
        "edit.xlsx",
      ),
    );
    await expect(page.getByRole("cell", { name, exact: true })).toBeVisible();

    await page.getByRole("button", { name: `Edit ${name}` }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    const editRow = page
      .getByRole("row")
      .filter({ has: page.getByRole("textbox", { name: "Name" }) });
    await editRow.getByRole("spinbutton", { name: "Floors" }).fill("999");
    await editRow.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("alert")).toContainText("floors must be a whole number");

    await editRow.getByRole("spinbutton", { name: "Floors" }).fill("6");
    await editRow.getByRole("textbox", { name: "City" }).fill("Thessaloniki");
    await editRow.getByRole("textbox", { name: "City" }).press("Enter");
    await expect(page.getByText("Building updated.")).toBeVisible();
    const row = page.getByRole("row").filter({ hasText: name });
    await expect(row).toContainText("Thessaloniki");
    await expect(row).toContainText("6");
    await expect(page.getByRole("textbox", { name: "Name" })).toHaveCount(0);

    // Escape discards an edit.
    await page.getByRole("button", { name: `Edit ${name}` }).click();
    await page.getByRole("textbox", { name: "City" }).fill("Nowhere");
    await page.getByRole("textbox", { name: "City" }).press("Escape");
    await expect(page.getByRole("row").filter({ hasText: name })).toContainText("Thessaloniki");
  });

  test("a building can be deleted after confirming", async ({ page }) => {
    await login(page);
    const name = `${PREFIX} Delete Me`;
    await page
      .locator('input[type="file"]')
      .setInputFiles(workbook([["name"], [name]], "delete.xlsx"));
    await expect(page.getByRole("cell", { name, exact: true })).toBeVisible();

    await page.getByRole("button", { name: `Delete ${name}` }).click();
    const confirm = page.getByRole("alertdialog");
    await confirm.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByRole("cell", { name, exact: true })).toBeVisible();

    await page.getByRole("button", { name: `Delete ${name}` }).click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Delete", exact: true })
      .click();
    await expect(page.getByText("Building deleted.")).toBeVisible();
    await expect(page.getByRole("cell", { name, exact: true })).toHaveCount(0);
  });

  test("several buildings are edited in place together, then deleted together", async ({
    page,
  }) => {
    await login(page);
    const names = [`${PREFIX} Bulk A`, `${PREFIX} Bulk B`, `${PREFIX} Bulk C`];
    await page
      .locator('input[type="file"]')
      .setInputFiles(
        workbook(
          [
            ["name", "address", "city", "country", "floors", "year_built"],
            ...names.map((n, i) => [n, `${i + 1} Bulk St`, "Athens", "Greece", 3, 2000]),
          ],
          "bulk.xlsx",
        ),
      );
    for (const name of names) {
      await expect(page.getByRole("cell", { name, exact: true })).toBeVisible();
    }

    // "Edit selected" turns the two chosen rows into inputs, each keeping its own values.
    await page.getByRole("checkbox", { name: `Select ${names[0]}` }).click();
    await page.getByRole("checkbox", { name: `Select ${names[1]}` }).click();
    await expect(page.getByText("2 selected")).toBeVisible();
    await page.getByRole("button", { name: "Edit selected" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByText("Editing 2 buildings")).toBeVisible();
    const editRow = (name: string) =>
      page.getByRole("row").filter({
        has: page.locator(`input[aria-label="Name"][value="${name}"]`),
      });

    // One invalid row blocks the whole save and shows its message.
    await editRow(names[0]!).getByRole("spinbutton", { name: "Floors" }).fill("999");
    await editRow(names[0]!).getByRole("textbox", { name: "City" }).fill("Larissa");
    await editRow(names[1]!).getByRole("textbox", { name: "City" }).fill("Volos");
    await page.getByRole("button", { name: "Save all" }).click();
    await expect(page.getByRole("alert")).toContainText("floors must be a whole number");

    await editRow(names[0]!).getByRole("spinbutton", { name: "Floors" }).fill("8");
    await page.getByRole("button", { name: "Save all" }).click();
    await expect(page.getByText("Updated 2 buildings.")).toBeVisible();
    const row = (name: string) => page.getByRole("row").filter({ hasText: name });
    await expect(row(names[0]!)).toContainText("Larissa");
    await expect(row(names[0]!)).toContainText("8");
    await expect(row(names[1]!)).toContainText("Volos");
    await expect(row(names[2]!)).toContainText("Athens");

    // Delete the same two together.
    await page.getByRole("checkbox", { name: `Select ${names[0]}` }).click();
    await page.getByRole("checkbox", { name: `Select ${names[1]}` }).click();
    await page.getByRole("button", { name: "Delete selected" }).click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Delete selected", exact: true })
      .click();
    await expect(page.getByText("Deleted 2 buildings.")).toBeVisible();
    await expect(page.getByRole("cell", { name: names[0]!, exact: true })).toHaveCount(0);
    await expect(page.getByRole("cell", { name: names[1]!, exact: true })).toHaveCount(0);
    await expect(page.getByRole("cell", { name: names[2]!, exact: true })).toBeVisible();
  });

  test("exporting includes the buildings imported earlier", async ({ page }) => {
    await login(page);
    const file = workbook(
      [
        ["name", "address", "city", "country", "floors", "year_built"],
        [`${PREFIX} Export Tower`, "9 Export St", "Athens", "Greece", 7, 2010],
      ],
      "export-source.xlsx",
    );
    await page.locator('input[type="file"]').setInputFiles(file);
    await expect(
      page.getByRole("cell", { name: `${PREFIX} Export Tower`, exact: true }),
    ).toBeVisible();

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Export Excel" }).click(),
    ]);
    expect(download.suggestedFilename()).toBe("buildings-export.xlsx");
    const wb = XLSX.read(readFileSync((await download.path())!));
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]!]!);
    expect(rows).toContainEqual({
      name: `${PREFIX} Export Tower`,
      address: "9 Export St",
      city: "Athens",
      country: "Greece",
      floors: 7,
      year_built: 2010,
    });
  });

  test("a file that is not a workbook is rejected with a message", async ({ page }) => {
    await login(page);
    // The table renders after the buildings query resolves; count rows only once it is there.
    await expect(page.getByRole("columnheader", { name: "Name" })).toBeVisible();
    await expect(page.getByText(/\d+ total/)).toBeVisible();
    const before = await page.getByRole("row").count();
    await page.locator('input[type="file"]').setInputFiles({
      name: "notes.png",
      mimeType: "image/png",
      buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01, 0x02]),
    });
    await expect(page.locator("[data-sonner-toast][data-type='error']")).toBeVisible();
    expect(await page.getByRole("row").count()).toBe(before);
  });
});
