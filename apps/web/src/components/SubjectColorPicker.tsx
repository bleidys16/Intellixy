import { SUBJECT_COLORS } from "@/lib/subjectColors";

interface Props {
  value: string;
  onChange: (hex: string) => void;
}

/** Fila de swatches de color de materia; se usa al crear y al editar. */
export function SubjectColorPicker({ value, onChange }: Props) {
  return (
    <div className="flex items-center gap-1" role="group" aria-label="Color de la materia">
      {SUBJECT_COLORS.map((c) => (
        <button
          type="button"
          key={c.hex}
          onClick={() => onChange(c.hex)}
          aria-label={c.name}
          aria-pressed={value === c.hex}
          className="flex h-11 w-11 items-center justify-center rounded-full"
        >
          <span
            className={`block h-8 w-8 rounded-full border border-ciruela/15 ${
              value === c.hex ? "outline-2 outline-offset-2 outline-ciruela" : ""
            }`}
            style={{ backgroundColor: c.hex }}
          />
        </button>
      ))}
    </div>
  );
}
