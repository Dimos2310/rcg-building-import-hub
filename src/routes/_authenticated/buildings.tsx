import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { queryOptions, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { parseRow } from "../../../supabase/functions/_shared/buildings.ts";
import {
  TEMPLATE_COLUMNS,
  describeImport,
  isUnchanged,
  toDraft,
  type Draft,
} from "@/lib/buildings";
import {
  importBuildingsFile,
  listBuildings,
  updateBuilding,
  type Building,
} from "@/lib/buildings-api";
import { BulkDeleteDialog, DeleteBuildingDialog } from "@/components/buildings/building-dialogs";
import { BuildingRow } from "@/components/buildings/building-row";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const buildingsQuery = queryOptions({
  queryKey: ["buildings"],
  queryFn: listBuildings,
});

export const Route = createFileRoute("/_authenticated/buildings")({
  head: () => ({
    meta: [
      { title: "Buildings — Buildings Registry" },
      { name: "description", content: "Your buildings list with Excel import." },
      { property: "og:title", content: "Buildings — Buildings Registry" },
      { property: "og:description", content: "Your buildings list with Excel import." },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(buildingsQuery),
  component: BuildingsPage,
});

// Same columns as the template, so an exported file can be edited and imported again.
function exportBuildings(buildings: Building[]) {
  const ws = XLSX.utils.aoa_to_sheet([
    [...TEMPLATE_COLUMNS],
    ...buildings.map((b) => TEMPLATE_COLUMNS.map((c) => b[c])),
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Buildings");
  XLSX.writeFile(wb, "buildings-export.xlsx");
}

function downloadTemplate() {
  const ws = XLSX.utils.aoa_to_sheet([
    [...TEMPLATE_COLUMNS],
    ["Example Tower", "1 Main St", "Athens", "Greece", 12, 1998],
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Buildings");
  XLSX.writeFile(wb, "buildings-template.xlsx");
}

function BuildingsPage() {
  const { data: buildings } = useSuspenseQuery(buildingsQuery);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<Building | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDelete, setBulkDelete] = useState(false);

  // Drop ids that no longer exist (deleted or imported away) so counts stay truthful.
  const selectedIds = buildings.filter((b) => selected.has(b.id)).map((b) => b.id);
  const allSelected = buildings.length > 0 && selectedIds.length === buildings.length;

  function toggle(id: string, on: boolean) {
    const next = new Set(selectedIds);
    if (on) next.add(id);
    else next.delete(id);
    setSelected(next);
  }

  const refresh = () => qc.invalidateQueries({ queryKey: ["buildings"] });

  const draftIds = Object.keys(drafts);

  function startEdit(ids: string[]) {
    const byId = new Map(buildings.map((b) => [b.id, b]));
    const next = { ...drafts };
    for (const id of ids) {
      const b = byId.get(id);
      if (b && !next[id]) next[id] = toDraft(b);
    }
    setDrafts(next);
  }

  function stopEdit(ids: string[]) {
    const omit = <T,>(record: Record<string, T>) =>
      Object.fromEntries(Object.entries(record).filter(([id]) => !ids.includes(id)));
    setDrafts((d) => omit(d));
    setRowErrors((e) => omit(e));
  }

  // Validates every row first; nothing is sent if any row is invalid.
  async function saveRows(ids: string[]) {
    const byId = new Map(buildings.map((b) => [b.id, b]));
    const invalid: Record<string, string> = {};
    const changed: { id: string; fields: Parameters<typeof updateBuilding>[1] }[] = [];
    const untouched: string[] = [];

    for (const id of ids) {
      const building = byId.get(id);
      const draft = drafts[id];
      if (!building || !draft) continue;
      const parsed = parseRow(draft);
      if (parsed.error !== undefined) invalid[id] = parsed.error;
      else if (isUnchanged(building, parsed.value)) untouched.push(id);
      else changed.push({ id, fields: parsed.value });
    }
    if (Object.keys(invalid).length > 0) {
      setRowErrors((e) => ({ ...e, ...invalid }));
      return;
    }

    setSaving(true);
    const results = await Promise.allSettled(changed.map((c) => updateBuilding(c.id, c.fields)));
    const saved = [...untouched];
    const failed: Record<string, string> = {};
    results.forEach((r, i) => {
      const id = changed[i]!.id;
      if (r.status === "fulfilled") saved.push(id);
      else failed[id] = (r.reason as Error).message;
    });
    stopEdit(saved);
    setRowErrors((e) => ({ ...e, ...failed }));
    setSaving(false);

    const updated = results.filter((r) => r.status === "fulfilled").length;
    if (updated > 0) {
      toast.success(updated === 1 ? "Building updated." : `Updated ${updated} buildings.`);
    }
    if (Object.keys(failed).length > 0) toast.error("Some changes could not be saved.");
    await refresh();
  }

  async function onFile(file: File) {
    setBusy(true);
    try {
      const res = await importBuildingsFile(file);
      const { level, title, description } = describeImport(res);
      toast[level](title, description ? { description } : undefined);
      await refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">Buildings</h1>
          <p className="text-sm text-muted-foreground">{buildings.length} total</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={downloadTemplate}>
            Download Excel template
          </Button>
          <Button
            variant="outline"
            disabled={buildings.length === 0}
            onClick={() => exportBuildings(buildings)}
          >
            Export Excel
          </Button>
          <Button disabled={busy} onClick={() => fileRef.current?.click()}>
            {busy ? "Importing…" : "Import Excel"}
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
          />
          <Button variant="ghost" onClick={signOut}>
            Sign out
          </Button>
        </div>
      </header>

      {draftIds.length > 1 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border bg-card px-4 py-2">
          <span className="text-sm font-medium">Editing {draftIds.length} buildings</span>
          <Button size="sm" disabled={saving} onClick={() => void saveRows(draftIds)}>
            {saving ? "Saving…" : "Save all"}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => stopEdit(draftIds)}>
            Cancel all
          </Button>
        </div>
      )}

      {selectedIds.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border bg-card px-4 py-2">
          <span className="text-sm font-medium">{selectedIds.length} selected</span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              startEdit(selectedIds);
              setSelected(new Set());
            }}
          >
            Edit selected
          </Button>
          <Button variant="outline" size="sm" onClick={() => setBulkDelete(true)}>
            Delete selected
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
            Clear selection
          </Button>
        </div>
      )}

      <div className="rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  aria-label="Select all"
                  checked={allSelected ? true : selectedIds.length > 0 ? "indeterminate" : false}
                  className="data-[state=indeterminate]:bg-primary data-[state=indeterminate]:text-primary-foreground"
                  disabled={buildings.length === 0}
                  onCheckedChange={(on) =>
                    setSelected(on === true ? new Set(buildings.map((b) => b.id)) : new Set())
                  }
                />
              </TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Address</TableHead>
              <TableHead>City</TableHead>
              <TableHead>Country</TableHead>
              <TableHead className="text-right">Floors</TableHead>
              <TableHead className="text-right">Year built</TableHead>
              <TableHead className="w-24 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {buildings.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                  No buildings yet. Download the template, fill it in and import it.
                </TableCell>
              </TableRow>
            ) : (
              buildings.map((b) => (
                <BuildingRow
                  key={b.id}
                  building={b}
                  selected={selected.has(b.id)}
                  draft={drafts[b.id] ?? null}
                  error={rowErrors[b.id] ?? null}
                  busy={saving}
                  onSelect={(on) => toggle(b.id, on)}
                  onStartEdit={() => startEdit([b.id])}
                  onDraftChange={(draft) => setDrafts((d) => ({ ...d, [b.id]: draft }))}
                  onSave={() => void saveRows([b.id])}
                  onCancel={() => stopEdit([b.id])}
                  onDelete={() => setDeleting(b)}
                />
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {bulkDelete && (
        <BulkDeleteDialog
          ids={selectedIds}
          onClose={() => setBulkDelete(false)}
          onDeleted={() => {
            setBulkDelete(false);
            setSelected(new Set());
            void refresh();
          }}
        />
      )}
      {deleting && (
        <DeleteBuildingDialog
          building={deleting}
          onClose={() => setDeleting(null)}
          onDeleted={() => {
            setDeleting(null);
            void refresh();
          }}
        />
      )}
    </div>
  );
}
