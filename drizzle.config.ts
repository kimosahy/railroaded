import { defineConfig } from "drizzle-kit";
import { config } from "./src/config.ts";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: config.databaseUrl,
  },
});
