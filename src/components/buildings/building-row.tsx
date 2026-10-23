import { useState, type KeyboardEvent } from "react";
import { Check, Pencil, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { parseRow } from "../../../supabase/functions/_shared/buildings.ts";
import { updateBuilding, type Building } from "@/lib/buildings-api";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { TableCell, TableRow } from "@/components/ui/table";

type Draft = {
  name: string;
  address: string;
  city: string;
  country: string;
  floors: string;
  year_built: string;
};

function toDraft(b: Building): Draft {
  return {
    name: b.name,
    address: b.address ?? "",
    city: b.city ?? "",
    country: b.country ?? "",
    floors: b.floors?.toString() ?? "",
    year_built: b.year_built?.toString() ?? "",
  };
}

// One table row that switches to inline editing in place; Enter saves, Escape cancels.
export function BuildingRow({
  building,
  selected,
  editing,
  onSelect,
  onStartEdit,
  onStopEdit,
  onDelete,
  onSaved,
}: {
  building: Building;
  selected: boolean;
  editing: boolean;
  onSelect: (on: boolean) => void;
  onStartEdit: () => void;
  onStopEdit: () => void;
  onDelete: () => void;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState<Draft>(() => toDraft(building));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function start() {
    setDraft(toDraft(building));
    setError(null);
    onStartEdit();
  }

  async function save() {
    const parsed = parseRow(draft);
    if (parsed.error !== undefined) {
      setError(parsed.error);
      return;
    }
    setBusy(true);
    try {
      await updateBuilding(building.id, parsed.value);
      toast.success("Building updated.");
      onSaved();
      onStopEdit();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      void save();
    } else if (e.key === "Escape") {
      onStopEdit();
    }
  }

  const selectCell = (
    <TableCell>
      <Checkbox
        aria-label={`Select ${building.name}`}
        checked={selected}
        disabled={editing}
        onCheckedChange={(on) => onSelect(on === true)}
      />
    </TableCell>
  );

  if (!editing) {
    return (
      <TableRow data-state={selected ? "selected" : undefined}>
        {selectCell}
        <TableCell className="font-medium">{building.name}</TableCell>
        <TableCell>{building.address}</TableCell>
        <TableCell>{building.city}</TableCell>
        <TableCell>{building.country}</TableCell>
        <TableCell className="text-right">{building.floors}</TableCell>
        <TableCell className="text-right">{building.year_built}</TableCell>
        <TableCell className="text-right">
          <Button variant="ghost" size="icon" aria-label={`Edit ${building.name}`} onClick={start}>
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Delete ${building.name}`}
            onClick={onDelete}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </TableCell>
      </TableRow>
    );
  }

  const field = (key: keyof Draft, label: string, className = "", type = "text") => (
    <Input
      aria-label={label}
      type={type}
      className={`h-8 ${className}`}
      value={draft[key]}
      onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
      onKeyDown={onKeyDown}
    />
  );

  return (
    <>
      <TableRow data-state="selected">
        {selectCell}
        <TableCell>{field("name", "Name")}</TableCell>
        <TableCell>{field("address", "Address")}</TableCell>
        <TableCell>{field("city", "City")}</TableCell>
        <TableCell>{field("country", "Country")}</TableCell>
        <TableCell>{field("floors", "Floors", "w-20 text-right", "number")}</TableCell>
        <TableCell>{field("year_built", "Year built", "w-24 text-right", "number")}</TableCell>
        <TableCell className="text-right">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Save"
            disabled={busy}
            onClick={() => void save()}
          >
            <Check className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" aria-label="Cancel" onClick={onStopEdit}>
            <X className="h-4 w-4" />
          </Button>
        </TableCell>
      </TableRow>
      {error && (
        <TableRow>
          <TableCell colSpan={8} className="py-2">
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}
