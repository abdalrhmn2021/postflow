// Prisma 7 reads the database address from here, not from schema.prisma.
import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  // Not env("DATABASE_URL"): that throws when the variable is missing, and `prisma generate`
  // runs on every `npm install` (postinstall) - also on a fresh clone with no .env yet.
  // Generating needs no database; migrate commands do, and they say so if it's missing.
  datasource: { url: process.env.DATABASE_URL },
});
