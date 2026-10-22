// Excel uploader: receives a workbook from the signed-in user, validates it and inserts the rows.
// ./xlsx.mjs is the official SheetJS 0.20.3 ESM build (https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs),
// vendored because the Supabase bundler cannot import from the SheetJS CDN and npm has only 0.18.5 (known CVEs).
// Runs with the caller's JWT, so the buildings RLS policies decide what may be written.
import { createClient } from "npm:@supabase/supabase-js@2";
import * as XLSX from "./xlsx.mjs";
import { prepareImport, type ImportResult } from "../_shared/buildings.ts";

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_ROWS = 5000;
const MAX_REPORTED_ISSUES = 20;
const PAGE_SIZE = 1000;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: userData, error: userError } = await supabase.auth.getUser(
    authHeader.replace("Bearer ", ""),
  );
  if (userError || !userData.user) return json({ error: "Unauthorized" }, 401);
  const userId = userData.user.id;

  let file: File | null = null;
  try {
    const form = await req.formData();
    const f = form.get("file");
    if (f instanceof File) file = f;
  } catch {
    return json({ error: "Expected multipart/form-data with a 'file' field." }, 400);
  }
  if (!file) return json({ error: "Missing 'file' field." }, 400);
  if (file.size > MAX_FILE_BYTES) {
    return json({ error: `File too large (max ${MAX_FILE_BYTES / 1024 / 1024} MB).` }, 413);
  }

  let raw: Record<string, unknown>[];
  try {
    const wb = XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: "array" });
    const first = wb.SheetNames[0];
    const sheet = first ? wb.Sheets[first] : undefined;
    if (!sheet) return json({ error: "The file has no sheets." }, 400);
    raw = XLSX.utils.sheet_to_json(sheet, { defval: null }) as Record<string, unknown>[];
  } catch {
    return json({ error: "Could not read the file. Upload an .xlsx, .xls or .csv file." }, 400);
  }
  if (raw.length > MAX_ROWS) return json({ error: `Too many rows (max ${MAX_ROWS}).` }, 413);

  // PostgREST returns at most PAGE_SIZE rows per request, so page through the user's buildings.
  const existing: { name: string; address: string | null; city: string | null }[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("buildings")
      .select("name,address,city")
      .order("id")
      .range(from, from + PAGE_SIZE - 1);
    if (error) return json({ error: error.message }, 400);
    existing.push(...data);
    if (data.length < PAGE_SIZE) break;
  }

  const { rows, duplicates, invalid } = prepareImport(raw, existing);

  if (rows.length > 0) {
    const { error } = await supabase
      .from("buildings")
      .insert(rows.map((r) => ({ ...r, user_id: userId })));
    if (error) return json({ error: error.message }, 400);
  }

  const result: ImportResult = {
    inserted: rows.length,
    duplicates,
    invalidCount: invalid.length,
    invalid: invalid.slice(0, MAX_REPORTED_ISSUES),
  };
  return json(result);
});
