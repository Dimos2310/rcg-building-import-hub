// Excel uploader: receives a workbook from the signed-in user, parses it and inserts the rows.
// ./xlsx.mjs is the official SheetJS 0.20.3 ESM build (https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs),
// vendored because the Supabase bundler cannot import from the SheetJS CDN and npm has only 0.18.5 (known CVEs).
// Runs with the caller's JWT, so the buildings RLS policies decide what may be written.
import { createClient } from "npm:@supabase/supabase-js@2";
import * as XLSX from "./xlsx.mjs";

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_ROWS = 5000;

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

function toInt(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function toText(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
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

  const rows = raw
    .map((r) => {
      const norm: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(r)) norm[k.trim().toLowerCase().replace(/\s+/g, "_")] = v;
      return {
        user_id: userId,
        name: toText(norm["name"]),
        address: toText(norm["address"]),
        city: toText(norm["city"]),
        country: toText(norm["country"]),
        floors: toInt(norm["floors"]),
        year_built: toInt(norm["year_built"]),
      };
    })
    .filter((r) => r.name !== null);

  const skipped = raw.length - rows.length;
  if (rows.length === 0) return json({ inserted: 0, skipped });

  const { error } = await supabase.from("buildings").insert(rows);
  if (error) return json({ error: error.message }, 400);

  return json({ inserted: rows.length, skipped });
});
