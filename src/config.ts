const DEV_JWT_SECRET = "railroaded-dev-secret-change-in-production";

export const config = {
  port: parseInt(process.env.PORT || "3000", 10),
  host: process.env.HOST || "0.0.0.0",
  databaseUrl: process.env.DATABASE_URL || "postgres://localhost:5432/railroaded",
  nodeEnv: process.env.NODE_ENV || "development",
  jwtSecret: process.env.JWT_SECRET || DEV_JWT_SECRET,
} as const;

// Refuse to boot a production server on the baked-in dev secret — every
// account JWT would be forgeable by anyone who has read this file.
if (config.nodeEnv === "production" && config.jwtSecret === DEV_JWT_SECRET) {
  throw new Error(
    "JWT_SECRET must be set in production (refusing to run with the dev default)",
  );
}
