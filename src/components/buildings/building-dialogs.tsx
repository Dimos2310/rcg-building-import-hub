import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { parseRow } from "../../../supabase/functions/_shared/buildings.ts";
import { deleteBuilding, updateBuilding, type Building } from "@/lib/buildings-api";
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

type FieldKey = (typeof FIELDS)[number]["key"];

export function EditBuildingDialog({
  building,
  onClose,
  onSaved,
}: {
  building: Building;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [values, setValues] = useState<Record<FieldKey, string>>(() => ({
    name: building.name,
    address: building.address ?? "",
    city: building.city ?? "",
    country: building.country ?? "",
    floors: building.floors?.toString() ?? "",
    year_built: building.year_built?.toString() ?? "",
  }));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const parsed = parseRow(values);
    if (parsed.error !== undefined) {
      setError(parsed.error);
      return;
    }
    setBusy(true);
    try {
      await updateBuilding(building.id, parsed.value);
      toast.success("Building updated.");
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
            <DialogTitle>Edit building</DialogTitle>
            <DialogDescription>Changes apply to your copy of this building only.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            {FIELDS.map((f) => (
              <div key={f.key} className="space-y-1">
                <Label htmlFor={`edit-${f.key}`}>{f.label}</Label>
                <Input
                  id={`edit-${f.key}`}
                  type={f.type}
                  value={values[f.key]}
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
              {busy ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

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
