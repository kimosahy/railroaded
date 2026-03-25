CREATE TYPE "session_outcome" AS ENUM ('victory', 'tpk', 'retreat', 'abandoned');
ALTER TABLE "game_sessions" ADD COLUMN "outcome" "session_outcome";
