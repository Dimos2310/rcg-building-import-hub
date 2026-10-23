import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import type { BuildingFields, ImportResult } from "../../supabase/functions/_shared/buildings.ts";

export type Building = Database["public"]["Tables"]["buildings"]["Row"];

// Data access for the buildings page. Row-level security scopes every call to the signed-in user.

export async function listBuildings(): Promise<Building[]> {
  const { data, error } = await supabase
    .from("buildings")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function updateBuilding(id: string, fields: BuildingFields): Promise<void> {
  const { data, error } = await supabase.from("buildings").update(fields).eq("id", id).select("id");
  if (error) throw new Error(error.message);
  if (data.length === 0) throw new Error("Building not found.");
}

export async function deleteBuilding(id: string): Promise<void> {
  const { data, error } = await supabase.from("buildings").delete().eq("id", id).select("id");
  if (error) throw new Error(error.message);
  if (data.length === 0) throw new Error("Building not found.");
}

export async function deleteBuildings(ids: string[]): Promise<number> {
  const { data, error } = await supabase.from("buildings").delete().in("id", ids).select("id");
  if (error) throw new Error(error.message);
  return data.length;
}

// FunctionsHttpError carries the raw Response; surface the function's own { error } message.
async function functionErrorMessage(error: Error): Promise<string> {
  const response = (error as { context?: unknown }).context;
  if (response instanceof Response) {
    try {
      const payload = (await response.json()) as { error?: string };
      if (payload.error) return payload.error;
    } catch {
      /* fall through to the generic message */
    }
  }
  return error.message;
}

export async function importBuildingsFile(file: File): Promise<ImportResult> {
  const body = new FormData();
  body.append("file", file);
  const { data, error } = await supabase.functions.invoke<ImportResult>("import-buildings", {
    body,
  });
  if (error) throw new Error(await functionErrorMessage(error));
  if (!data) throw new Error("Empty response from the import function.");
  return data;
}
