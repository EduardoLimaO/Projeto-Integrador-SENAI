import { beforeEach, describe, expect, it } from "vitest";
import { calculateAvailability, getPortDistribution, useSolarStore } from "./store";

describe("Solar Totem demo store", () => {
  beforeEach(() => useSolarStore.getState().reset());

  it("calculates availability using merged outages inside the requested window", () => {
    const result = calculateAvailability([
      { stationId: "TOT-001", startedAt: 20, endedAt: 50 },
      { stationId: "TOT-001", startedAt: 40, endedAt: 70 },
      { stationId: "TOT-002", startedAt: 0, endedAt: 100 }
    ], 0, 100, "TOT-001");
    expect(result).toBe(50);
  });

  it("calculates the port distribution from sessions and totals 100 percent", () => {
    const state = useSolarStore.getState();
    const distribution = getPortDistribution(state.sessions, "TOT-001");
    expect(distribution).toEqual([34, 28, 31, 7]);
    expect(distribution.reduce((sum, value) => sum + value, 0)).toBe(100);
  });

  it("releases a maintenance port and resolves its open alert", () => {
    const state = useSolarStore.getState();
    state.releasePort("PORT-004", "Inspeção concluída");
    const updated = useSolarStore.getState();
    expect(updated.ports.find((port) => port.stationId === "TOT-001" && port.id === "PORT-004")?.status).toBe("disponivel");
    expect(updated.alerts.find((alert) => alert.origin === "PORT-004")?.status).toBe("resolvido");
    expect(updated.events[0].message).toContain("Porta 04 liberada");
    expect(updated.logs[0].level).toBe("INFO");
  });

  it("starts and finishes a session while updating the port and event feed", () => {
    const state = useSolarStore.getState();
    const sessionId = state.startSession("PORT-001", state.users[10].id, 0.5);
    let updated = useSolarStore.getState();
    expect(updated.ports.find((port) => port.id === "PORT-001" && port.stationId === "TOT-001")?.status).toBe("em_utilizacao");
    expect(updated.sessions.find((session) => session.id === sessionId)?.status).toBe("ativa");
    updated.finishSession(sessionId);
    updated = useSolarStore.getState();
    expect(updated.ports.find((port) => port.id === "PORT-001" && port.stationId === "TOT-001")?.status).toBe("disponivel");
    expect(updated.sessions.find((session) => session.id === sessionId)?.status).toBe("concluida");
    expect(updated.events[0].message).toContain("liberada");
  });

  it("blocks duplicate user sessions and prevents starts while the ESP32 is offline", () => {
    const state = useSolarStore.getState();
    expect(() => state.startSession("PORT-001", state.users[863].id, 0.5)).toThrow("já possui uma sessão ativa");
    state.toggleDevice();
    expect(() => useSolarStore.getState().startSession("PORT-001", state.users[10].id, 0.5)).toThrow("ESP32 está offline");
  });
});
