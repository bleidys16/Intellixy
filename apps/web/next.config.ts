import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Por defecto sale abajo a la izquierda, donde ahora vive el menú flotante de materia.
  devIndicators: {
    position: "top-left",
  },
  // pdfjs-dist y tesseract.js resuelven rutas a sus propios assets (fuentes, wasm) en
  // node_modules en tiempo de ejecución; si Next los empaqueta, esas rutas se rompen.
  serverExternalPackages: ["pdfjs-dist", "tesseract.js", "sharp"],
  // Garantiza que las fuentes de pdfjs (copia propia) y los datos de idioma de tesseract
  // viajen con la función serverless aunque nada los "importe" — se leen por ruta en runtime.
  outputFileTracingIncludes: {
    "/api/subjects/[subjectId]/materials/**": [
      "./src/server/extraction/standard_fonts/**",
      "./src/server/extraction/tessdata/**",
      "./src/server/extraction/pdfjs_worker/**",
    ],
  },
};

export default nextConfig;
