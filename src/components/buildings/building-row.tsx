import type { KeyboardEvent } from "react";
import { Check, Pencil, Trash2, X } from "lucide-react";
import type { Building } from "@/lib/buildings-api";
import type { Draft } from "@/lib/buildings";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { TableCell, TableRow } from "@/components/ui/table";

// One table row. With a draft it shows inputs in place (Enter saves, Escape cancels).
export function BuildingRow({
  building,
  selected,
  draft,
  error,
  busy,
  onSelect,
  onStartEdit,
  onDraftChange,
  onSave,
  onCancel,
  onDelete,
}: {
  building: Building;
  selected: boolean;
  draft: Draft | null;
  error: string | null;
  busy: boolean;
  onSelect: (on: boolean) => void;
  onStartEdit: () => void;
  onDraftChange: (draft: Draft) => void;
  onSave: () => void;
  onCancel: () => void;
  onDelete: () => void;
}) {
  const selectCell = (
    <TableCell>
      <Checkbox
        aria-label={`Select ${building.name}`}
        checked={selected}
        disabled={draft !== null}
        onCheckedChange={(on) => onSelect(on === true)}
      />
    </TableCell>
  );

  if (!draft) {
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
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Edit ${building.name}`}
            onClick={onStartEdit}
          >
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

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      onSave();
    } else if (e.key === "Escape") {
      onCancel();
    }
  }

  const field = (key: keyof Draft, label: string, className = "", type = "text") => (
    <Input
      aria-label={label}
      type={type}
      className={`h-8 ${className}`}
      value={draft[key]}
      onChange={(e) => onDraftChange({ ...draft, [key]: e.target.value })}
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
          <Button variant="ghost" size="icon" aria-label="Save" disabled={busy} onClick={onSave}>
            <Check className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" aria-label="Cancel" onClick={onCancel}>
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
