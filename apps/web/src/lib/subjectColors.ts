/**
 * Colores de materia de la paleta (ver "Identidad visual y paleta" del plan). El `hex` es lo que se guarda en
 * `subjects.color`; `card` es su tono suave al 35% sobre Oat Milk, con texto ciruela encima (11 a 14:1).
 */
export const SUBJECT_COLORS = [
  { hex: "#8CA7F4", name: "Azul", card: "bg-card-blue" },
  { hex: "#D98CF4", name: "Morado", card: "bg-card-purple" },
  { hex: "#DBF48C", name: "Lima", card: "bg-card-lime" },
  { hex: "#56DFCF", name: "Turquesa", card: "bg-card-turquoise" },
  { hex: "#F4D98C", name: "Amarillo", card: "bg-card-yellow" },
  { hex: "#F48C96", name: "Rosa", card: "bg-card-rose" },
] as const;

export const DEFAULT_SUBJECT_COLOR = SUBJECT_COLORS[0];

/** Clase de fondo de la tarjeta para un color guardado; cae al azul si el color no es de la paleta. */
export function subjectCardClass(color: string | null): string {
  return (SUBJECT_COLORS.find((c) => c.hex.toLowerCase() === color?.toLowerCase()) ?? DEFAULT_SUBJECT_COLOR).card;
}
