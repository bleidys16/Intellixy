import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Almacenamiento de archivos subidos. Hoy es disco local; en la Fase 6 se puede
 * reemplazar por uno S3-compatible implementando esta misma interfaz.
 * Las claves las genera el servidor (nunca el nombre que manda el cliente).
 */
export interface FileStorage {
  save(key: string, data: Buffer): Promise<void>;
  read(key: string): Promise<Buffer>;
  remove(key: string): Promise<void>;
}

const here = path.dirname(fileURLToPath(import.meta.url));
const root = process.env.UPLOADS_DIR
  ? path.resolve(process.env.UPLOADS_DIR)
  : path.resolve(here, "..", "..", "uploads");

function resolveKey(key: string): string {
  const full = path.resolve(root, key);
  if (full !== root && !full.startsWith(root + path.sep)) {
    throw new Error("Clave de almacenamiento inválida");
  }
  return full;
}

export const storage: FileStorage = {
  async save(key, data) {
    const full = resolveKey(key);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, data);
  },
  async read(key) {
    return readFile(resolveKey(key));
  },
  async remove(key) {
    await rm(resolveKey(key), { force: true });
  },
};
