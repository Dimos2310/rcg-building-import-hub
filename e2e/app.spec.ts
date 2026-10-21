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
    const wb = XLSX.readFile((await download.path())!);
    const first = wb.Sheets[wb.SheetNames[0]!]!;
    const header = XLSX.utils.sheet_to_json<string[]>(first, { header: 1 })[0];
    expect(header).toEqual(["name", "address", "city", "country", "floors", "year_built"]);
  });

  test("importing a workbook inserts rows and skips unnamed ones", async ({ page }) => {
    await login(page);
    const file = workbook(
      [
        ["Name", "Address", "City", "Country", "Floors", "Year Built"],
        [`${PREFIX} Tower`, "1 Main St", "Athens", "Greece", 12, 1998],
        [`${PREFIX} Annex`, "2 Side St", "Patras", "Greece", "n/a", null],
        ["", "no name here", "Nowhere", "", 3, 2001],
      ],
      "import.xlsx",
    );
    await page.locator('input[type="file"]').setInputFiles(file);
    await expect(page.getByText("Imported 2 buildings, skipped 1 without a name.")).toBeVisible();
    await expect(page.getByRole("cell", { name: `${PREFIX} Tower` })).toBeVisible();
    await expect(page.getByRole("cell", { name: `${PREFIX} Annex` })).toBeVisible();
    await expect(page.getByRole("cell", { name: "no name here" })).toHaveCount(0);
  });

  test("a file that is not a workbook is rejected with a message", async ({ page }) => {
    await login(page);
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
