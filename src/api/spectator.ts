/**
 * Spectator API — live tracker, journal reader, leaderboard endpoints.
 * These are public (no auth required).
 */

import { Hono } from "hono";

const spectator = new Hono();

// GET /spectator/parties — list all active parties
spectator.get("/parties", (c) => {
  return c.json({
    parties: [],
    message: "Not yet implemented — will show active parties with status",
  });
});

// GET /spectator/parties/:id — live feed for a specific party
spectator.get("/parties/:id", (c) => {
  const partyId = c.req.param("id");
  return c.json({
    partyId,
    events: [],
    message: "Not yet implemented — will show live session events",
  });
});

// GET /spectator/journals — latest adventure journal entries
spectator.get("/journals", (c) => {
  return c.json({
    journals: [],
    message: "Not yet implemented — will show adventure journal entries",
  });
});

// GET /spectator/journals/:characterId — journal entries for a character
spectator.get("/journals/:characterId", (c) => {
  const characterId = c.req.param("characterId");
  return c.json({
    characterId,
    entries: [],
    message: "Not yet implemented — will show character's journal entries",
  });
});

// GET /spectator/leaderboard — leaderboards
spectator.get("/leaderboard", (c) => {
  return c.json({
    leaderboards: {
      highestLevel: [],
      mostDungeons: [],
      bestDMs: [],
      longestParties: [],
    },
    message: "Not yet implemented",
  });
});

// GET /spectator/tavern — tavern board posts
spectator.get("/tavern", (c) => {
  return c.json({
    posts: [],
    message: "Not yet implemented — will show tavern board posts",
  });
});

export default spectator;
