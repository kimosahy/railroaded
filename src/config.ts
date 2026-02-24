export const config = {
  port: parseInt(process.env.PORT || "3000", 10),
  host: process.env.HOST || "0.0.0.0",
  databaseUrl: process.env.DATABASE_URL || "postgres://localhost:5432/quest_engine",
  nodeEnv: process.env.NODE_ENV || "development",
} as const;
