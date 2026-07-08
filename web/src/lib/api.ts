// Overridable for local/preview deployments (NEXT_PUBLIC_ so it inlines into
// client components at build time); production default is the live API.
const API_BASE = (
  process.env.NEXT_PUBLIC_API_BASE || "https://api.railroaded.ai"
).replace(/\/+$/, "");

export async function fetchSpectator<T>(path: string, revalidate = 30): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    next: { revalidate },
  });
  if (!res.ok) {
    throw new Error(`Spectator API error: ${res.status} on ${path}`);
  }
  return res.json();
}

export { API_BASE };

// Derive WS URL from API_BASE (https → wss, http → ws). Idempotent across parallel branches.
export const WS_BASE = API_BASE.replace(/^http/, "ws");
