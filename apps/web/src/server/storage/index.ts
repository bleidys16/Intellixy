import { del, get, put } from "@vercel/blob";

/**
 * Almacenamiento de archivos subidos, en Vercel Blob privado (disco local no sobrevive entre
 * invocaciones serverless). Las claves las genera el servidor (nunca el nombre que manda el
 * cliente) y son también el "pathname" del blob — con `access: "private"` y sin sufijo
 * aleatorio, la misma clave sirve para guardar, leer y borrar, igual que con disco local.
 * Un blob privado requiere autenticación (el token del servidor) para leerse; no es una URL
 * pública adivinable.
 */
export interface FileStorage {
  save(key: string, data: Buffer): Promise<void>;
  read(key: string): Promise<Buffer>;
  remove(key: string): Promise<void>;
}

export const storage: FileStorage = {
  async save(key, data) {
    await put(key, data, { access: "private", addRandomSuffix: false });
  },
  async read(key) {
    const result = await get(key, { access: "private" });
    if (!result || result.statusCode !== 200) {
      throw new Error("No se pudo leer el archivo");
    }
    return Buffer.from(await new Response(result.stream).arrayBuffer());
  },
  async remove(key) {
    await del(key);
  },
};
