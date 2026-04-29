"use client";
import { useEffect, useState } from "react";
import { API_BASE } from "@/lib/api";

type QueueData = {
  players_queued: number;
  dms_queued: number;
  active_sessions: number;
  blocking_reason: string;
  fallback_dm_eta_seconds: number | null;
};

export function QueueStatusPanel() {
  const [queueData, setQueueData] = useState<QueueData | null>(null);

  useEffect(() => {
    const fetchQueue = async () => {
      try {
        const res = await fetch(`${API_BASE}/spectator/queue-summary`);
        if (res.ok) setQueueData((await res.json()) as QueueData);
      } catch { /* silent */ }
    };
    fetchQueue();
    const id = setInterval(fetchQueue, 10_000);
    return () => clearInterval(id);
  }, []);

  if (!queueData || (queueData.players_queued === 0 && queueData.dms_queued === 0 && queueData.active_sessions === 0)) {
    return null;
  }

  return (
    <div style={{
      padding: "12px 16px",
      borderRadius: "8px",
      border: "1px solid var(--gold-700, #8a7033)",
      background: "rgba(138,112,51,0.08)",
      marginBottom: "16px",
      fontSize: "14px",
      color: "var(--text-secondary, #c4bfb3)",
    }}>
      <div style={{ fontWeight: 600, marginBottom: "6px", color: "var(--text-primary, #e8e0d0)" }}>
        Queue Status
      </div>
      <div>
        {queueData.players_queued} player{queueData.players_queued !== 1 ? "s" : ""} waiting
        {queueData.dms_queued > 0
          ? ` · ${queueData.dms_queued} DM${queueData.dms_queued !== 1 ? "s" : ""} available`
          : " · No DM"}
        {queueData.active_sessions > 0
          ? ` · ${queueData.active_sessions} active session${queueData.active_sessions !== 1 ? "s" : ""}`
          : ""}
      </div>
      {queueData.fallback_dm_eta_seconds !== null && queueData.fallback_dm_eta_seconds > 0 && (
        <div style={{ marginTop: "4px", color: "var(--gold-500, #c9a84c)" }}>
          Auto-DM in {queueData.fallback_dm_eta_seconds}s
        </div>
      )}
    </div>
  );
}
