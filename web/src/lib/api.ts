const API_BASE = "https://api.railroaded.ai";

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
