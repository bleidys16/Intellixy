import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Por defecto sale abajo a la izquierda, donde ahora vive el menú flotante de materia.
  devIndicators: {
    position: "top-left",
  },
};

export default nextConfig;
