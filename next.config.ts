import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,

  // Tell Next.js/Vercel to treat these packages as server-only (not bundled by webpack).
  // Required for Prisma (native binary) and googleapis on Vercel's Node.js runtime.
  serverExternalPackages: ["@prisma/client", "prisma", "googleapis", "cheerio"],

  // Expose the spreadsheet ID to the browser
  env: {
    NEXT_PUBLIC_GOOGLE_SHEETS_SPREADSHEET_ID: process.env.GOOGLE_SHEETS_SPREADSHEET_ID || "",
  },
};

export default nextConfig;
