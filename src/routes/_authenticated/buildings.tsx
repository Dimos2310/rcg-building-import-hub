import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { queryOptions, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { Pencil, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { TEMPLATE_COLUMNS, describeImport } from "@/lib/buildings";
import { importBuildingsFile, listBuildings, type Building } from "@/lib/buildings-api";
import { DeleteBuildingDialog, EditBuildingDialog } from "@/components/buildings/building-dialogs";
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
  const [editing, setEditing] = useState<Building | null>(null);
  const [deleting, setDeleting] = useState<Building | null>(null);

  const refresh = () => qc.invalidateQueries({ queryKey: ["buildings"] });

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

      <div className="rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
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
                <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                  No buildings yet. Download the template, fill it in and import it.
                </TableCell>
              </TableRow>
            ) : (
              buildings.map((b) => (
                <TableRow key={b.id}>
                  <TableCell className="font-medium">{b.name}</TableCell>
                  <TableCell>{b.address}</TableCell>
                  <TableCell>{b.city}</TableCell>
                  <TableCell>{b.country}</TableCell>
                  <TableCell className="text-right">{b.floors}</TableCell>
                  <TableCell className="text-right">{b.year_built}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Edit ${b.name}`}
                      onClick={() => setEditing(b)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Delete ${b.name}`}
                      onClick={() => setDeleting(b)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {editing && (
        <EditBuildingDialog
          building={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
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
