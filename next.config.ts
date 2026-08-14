import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdf-parse (via pdfjs-dist) dynamically imports its worker script at
  // runtime. Bundling it rewrites that dynamic import into a chunk lookup
  // that can't resolve the worker file, breaking PDF text extraction.
  // Marking it external makes Node require/import it natively instead.
  serverExternalPackages: ["pdf-parse", "pdfjs-dist"],
};

export default nextConfig;
