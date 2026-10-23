import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { parsePatch } from "../../../supabase/functions/_shared/buildings.ts";
import {
  deleteBuilding,
  deleteBuildings,
  updateBuildings,
  type Building,
} from "@/lib/buildings-api";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const FIELDS = [
  { key: "name", label: "Name", type: "text" },
  { key: "address", label: "Address", type: "text" },
  { key: "city", label: "City", type: "text" },
  { key: "country", label: "Country", type: "text" },
  { key: "floors", label: "Floors", type: "number" },
  { key: "year_built", label: "Year built", type: "number" },
] as const;

export function DeleteBuildingDialog({
  building,
  onClose,
  onDeleted,
}: {
  building: Building;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [busy, setBusy] = useState(false);

  async function confirm() {
    setBusy(true);
    try {
      await deleteBuilding(building.id);
      toast.success("Building deleted.");
      onDeleted();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AlertDialog open onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this building?</AlertDialogTitle>
          <AlertDialogDescription>
            “{building.name}” will be removed permanently. This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={busy}
            onClick={(e) => {
              e.preventDefault();
              void confirm();
            }}
          >
            {busy ? "Deleting…" : "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

const BULK_FIELDS = FIELDS.filter((f) => f.key !== "name");

export function BulkEditDialog({
  ids,
  onClose,
  onSaved,
}: {
  ids: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const parsed = parsePatch(values);
    if ("error" in parsed) {
      setError(parsed.error);
      return;
    }
    setBusy(true);
    try {
      const count = await updateBuildings(ids, parsed.value);
      toast.success(`Updated ${count} building${count === 1 ? "" : "s"}.`);
      onSaved();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>
              Edit {ids.length} building{ids.length === 1 ? "" : "s"}
            </DialogTitle>
            <DialogDescription>
              Fill in only the fields you want to change. Empty fields keep each building's current
              value.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            {BULK_FIELDS.map((f) => (
              <div key={f.key} className="space-y-1">
                <Label htmlFor={`bulk-${f.key}`}>{f.label}</Label>
                <Input
                  id={`bulk-${f.key}`}
                  type={f.type}
                  value={values[f.key] ?? ""}
                  onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
                />
              </div>
            ))}
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Saving…" : "Apply to selected"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function BulkDeleteDialog({
  ids,
  onClose,
  onDeleted,
}: {
  ids: string[];
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [busy, setBusy] = useState(false);

  async function confirm() {
    setBusy(true);
    try {
      const count = await deleteBuildings(ids);
      toast.success(`Deleted ${count} building${count === 1 ? "" : "s"}.`);
      onDeleted();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AlertDialog open onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Delete {ids.length} building{ids.length === 1 ? "" : "s"}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            The selected buildings will be removed permanently. This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={busy}
            onClick={(e) => {
              e.preventDefault();
              void confirm();
            }}
          >
            {busy ? "Deleting…" : "Delete selected"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
