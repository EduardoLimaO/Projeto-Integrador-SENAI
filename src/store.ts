import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { Alert, EventEntry, LogEntry, Port, PortStatus, Session, SolarState, Station, User } from "./types";

const mainStation = "TOT-001";
const noOpStorage = {
  getItem: (_name: string) => null,
  setItem: (_name: string, _value: string) => undefined,
  removeItem: (_name: string) => undefined
};
const names = ["Ana Souza", "Bruno Lima", "Camila Rocha", "Diego Alves", "Eduarda Santos", "Felipe Costa", "Giovana Martins", "Heitor Oliveira"];
const newId = (prefix: string) => `${prefix}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
const stationSeeds: Station[] = [
  { id: "TOT-001", name: "Entrada", location: "Bloco principal", online: true },
  { id: "TOT-002", name: "Pátio", location: "Pátio central", online: true },
  { id: "TOT-003", name: "Biblioteca", location: "Biblioteca", online: true }
];

function seedUsers(): User[] {
  return Array.from({ length: 864 }, (_, index) => ({
    id: `USR-${String(index + 1).padStart(4, "0")}`,
    name: names[index % names.length],
    registration: String(100000 + index),
    active: true
  }));
}

function seedPorts(now: number): Port[] {
  return stationSeeds.flatMap((station, stationIndex) => Array.from({ length: 4 }, (_, index) => {
    const mainStatus: PortStatus[] = ["disponivel", "em_utilizacao", "disponivel", "manutencao"];
    const status = stationIndex === 0 ? mainStatus[index] : "disponivel";
    return {
      id: `PORT-00${index + 1}`,
      stationId: station.id,
      label: `Porta 0${index + 1}`,
      status,
      online: true,
      lastUsedAt: now - (index + 1) * 3600000,
      currentSessionId: null,
      maintenanceReason: status === "manutencao" ? "Inspeção preventiva" : null,
      blockedReason: null
    };
  }));
}

function seedSessions(users: User[], now: number): Session[] {
  const counts = [[424, 349, 387, 88], [18, 14, 16, 4], [18, 14, 16, 4]];
  return stationSeeds.flatMap((station, stationIndex) => counts[stationIndex].flatMap((count, portIndex) =>
    Array.from({ length: count }, (_, index) => {
      const age = (index * 7919 + portIndex * 1703 + stationIndex * 311) % (30 * 24 * 60);
      const startedAt = now - age * 60000;
      const endedAt = Math.min(now, startedAt + (18 + ((index * 13) % 70)) * 60000);
      return {
        id: `HST-${station.id}-${portIndex + 1}-${index + 1}`,
        stationId: station.id,
        portId: `PORT-00${portIndex + 1}`,
        userId: users[(index * 7 + portIndex * 31 + stationIndex * 43) % users.length].id,
        startedAt,
        endedAt,
        kWh: Number((0.08 + ((index * 19) % 90) / 100).toFixed(2)),
        status: "concluida" as const,
        targetKwh: 1
      };
    })
  ));
}

function initialState(): SolarState {
  const now = Date.now();
  const users = seedUsers();
  const ports = seedPorts(now);
  const sessions = seedSessions(users, now);
  const active = {
    id: "SES-ACTIVE-1", stationId: mainStation, portId: "PORT-002", userId: users[863].id,
    startedAt: now - 14 * 60000, endedAt: null, kWh: 0.19, status: "ativa" as const, targetKwh: 1
  };
  ports.find((port) => port.id === active.portId && port.stationId === mainStation)!.currentSessionId = active.id;
  sessions.unshift(active);
  return {
    stations: stationSeeds, selectedStationId: mainStation, ports, sessions, users, alerts: [{
      id: "ALT-SEED-1", stationId: mainStation, title: "Porta 04 necessita de manutenção",
      origin: "PORT-004", severity: "atencao", status: "aberto", openedAt: now - 28 * 60000,
      acknowledgedAt: null, acknowledgedBy: null, resolvedAt: null
    }],
    logs: [{ id: "LOG-SEED", stationId: mainStation, timestamp: now, level: "INFO", message: "Heartbeat recebido", origin: "ESP32-001" }],
    events: [{ id: "EV-SEED", stationId: mainStation, type: "device", message: "Estação TOT-001 conectada", timestamp: now }],
    readings: stationSeeds.flatMap((station, stationIndex) => Array.from({ length: 720 }, (_, i) => {
      const timestamp = now - (719 - i) * 3600000;
      const hour = new Date(timestamp).getHours();
      const powerKw = Math.max(0, 2.2 * Math.sin(((hour - 6) / 12) * Math.PI)) * (1 + stationIndex * 0.08);
      return {
        stationId: station.id,
        timestamp,
        generatedKwh: Number((powerKw * 0.72).toFixed(2)),
        consumedKwh: Number((0.35 + (i % 5) * 0.08 + stationIndex * 0.05).toFixed(2)),
        powerKw: Number(powerKw.toFixed(2))
      };
    })),
    device: { firmware: "v2.4.1", ip: "192.168.1.42", rssi: -58, uptimeSeconds: 12 * 86400 + 4 * 3600, lastHeartbeatAt: now },
    outages: [], simulator: { paused: false, lastHeartbeatLogAt: now }, lastTickAt: now
  };
}

interface SolarActions {
  selectStation: (id: string) => void;
  startSession: (portId: string, userId: string, targetKwh: number) => string;
  finishSession: (sessionId: string, cancelled?: boolean) => void;
  setMaintenance: (portId: string, reason: string) => void;
  releasePort: (portId: string, note?: string) => void;
  toggleBlock: (portId: string) => void;
  acknowledgeAlert: (alertId: string) => void;
  resolveAlert: (alertId: string, note: string) => void;
  toggleDevice: () => void;
  restartDevice: () => void;
  restartPort: (portId: string) => void;
  forcePortFailure: () => void;
  demandSpike: () => void;
  tick: () => void;
  toggleSimulation: () => void;
  reset: () => void;
}

function appendLog(logs: LogEntry[], level: LogEntry["level"], message: string, origin: string, stationId = mainStation): LogEntry[] {
  return [{ id: newId("LOG"), stationId, timestamp: Date.now(), level, message, origin }, ...logs].slice(0, 500);
}
function appendEvent(events: EventEntry[], type: EventEntry["type"], message: string, portId?: string, stationId = mainStation): EventEntry[] {
  return [{ id: newId("EV"), stationId, type, message, portId, timestamp: Date.now() }, ...events].slice(0, 200);
}
function createAlert(state: SolarState, title: string, origin: string, severity: Alert["severity"]): Alert[] {
  if (state.alerts.some((alert) => alert.stationId === state.selectedStationId && alert.origin === origin && alert.status !== "resolvido")) return state.alerts;
  return [{ id: newId("ALT"), stationId: state.selectedStationId, title, origin, severity, status: "aberto", openedAt: Date.now(), acknowledgedAt: null, acknowledgedBy: null, resolvedAt: null }, ...state.alerts];
}
function connectionUpdate(state: SolarState, stationId: string, online: boolean): Partial<SolarState> {
  const station = state.stations.find((item) => item.id === stationId);
  if (!station || station.online === online) return state;
  const outages = online
    ? state.outages.map((outage) => outage.stationId === stationId && !outage.endedAt ? { ...outage, endedAt: Date.now() } : outage)
    : state.outages.some((outage) => outage.stationId === stationId && !outage.endedAt) ? state.outages : [...state.outages, { stationId, startedAt: Date.now(), endedAt: null }];
  const stationState = { ...state, selectedStationId: stationId };
  return {
    stations: state.stations.map((item) => item.id === stationId ? { ...item, online } : item),
    ports: state.ports.map((port) => port.stationId === stationId ? { ...port, online } : port),
    outages,
    alerts: online ? state.alerts : createAlert(stationState, "ESP32 sem comunicação", "ESP32-001", "critico"),
    logs: appendLog(state.logs, online ? "INFO" : "ERROR", online ? "Comunicação ESP32 restaurada" : "ESP32 desconectado", "ESP32-001", stationId),
    events: appendEvent(state.events, "device", online ? "Comunicação restaurada" : "ESP32 offline", undefined, stationId)
  };
}

export const useSolarStore = create<SolarState & SolarActions>()(persist((set, get) => ({
  ...initialState(),
  selectStation: (id) => set({ selectedStationId: id }),
  startSession: (portId, userId, targetKwh) => {
    const state = get();
    if (!state.stations.find((station) => station.id === state.selectedStationId)?.online) throw new Error("O ESP32 está offline.");
    const port = state.ports.find((item) => item.stationId === state.selectedStationId && item.id === portId);
    if (!port || port.status !== "disponivel" || !port.online) throw new Error("Esta porta não está disponível ou está offline.");
    if (!state.users.some((user) => user.id === userId && user.active)) throw new Error("Selecione um usuário ativo.");
    if (!Number.isFinite(targetKwh) || targetKwh <= 0) throw new Error("A meta da sessão deve ser maior que zero.");
    if (state.sessions.some((session) => session.stationId === state.selectedStationId && session.userId === userId && session.status === "ativa")) throw new Error("Este usuário já possui uma sessão ativa.");
    if (state.sessions.some((session) => session.portId === portId && session.stationId === state.selectedStationId && session.status === "ativa")) throw new Error("Esta porta já possui uma sessão ativa.");
    const session: Session = { id: newId("SES"), stationId: state.selectedStationId, portId, userId, startedAt: Date.now(), endedAt: null, kWh: 0, status: "ativa", targetKwh };
    set((s) => ({
      sessions: [session, ...s.sessions],
      ports: s.ports.map((item) => item.id === portId && item.stationId === s.selectedStationId ? { ...item, status: "em_utilizacao", currentSessionId: session.id } : item),
      logs: appendLog(s.logs, "INFO", `Nova sessão iniciada · ${port.label}`, portId, s.selectedStationId),
      events: appendEvent(s.events, "session", `Nova sessão iniciada · ${port.label}`, portId, s.selectedStationId)
    }));
    return session.id;
  },
  finishSession: (sessionId, cancelled = false) => set((s) => {
    const session = s.sessions.find((item) => item.id === sessionId && item.status === "ativa");
    if (!session) return s;
    const port = s.ports.find((item) => item.id === session.portId && item.stationId === session.stationId);
    return {
      sessions: s.sessions.map((item) => item.id === sessionId ? { ...item, status: cancelled ? "cancelada" : "concluida", endedAt: Date.now() } : item),
      ports: s.ports.map((item) => item.id === session.portId && item.stationId === session.stationId ? { ...item, status: "disponivel", currentSessionId: null, lastUsedAt: Date.now() } : item),
      logs: appendLog(s.logs, "INFO", `Sessão ${cancelled ? "cancelada" : "finalizada"} · ${port?.label ?? session.portId}`, session.portId, session.stationId),
      events: appendEvent(s.events, "port", `${port?.label ?? session.portId} liberada`, session.portId, session.stationId)
    };
  }),
  setMaintenance: (portId, reason) => set((s) => {
    const port = s.ports.find((item) => item.id === portId && item.stationId === s.selectedStationId);
    if (!port || !reason.trim()) return s;
    const next = { ...s, ports: s.ports.map((item) => item.id === portId && item.stationId === s.selectedStationId ? { ...item, status: "manutencao" as const, maintenanceReason: reason, currentSessionId: null } : item) };
    const sessions = s.sessions.map((session) => session.status === "ativa" && session.portId === portId && session.stationId === s.selectedStationId ? { ...session, status: "cancelada" as const, endedAt: Date.now() } : session);
    return { ...next, sessions, alerts: createAlert(s, `${port.label} necessita de manutenção`, portId, "atencao"), logs: appendLog(s.logs, "WARN", `${port.label} colocada em manutenção: ${reason}`, portId, s.selectedStationId), events: appendEvent(s.events, "alert", `${port.label} em manutenção`, portId, s.selectedStationId) };
  }),
  releasePort: (portId, note = "Inspeção concluída") => set((s) => {
    const port = s.ports.find((item) => item.id === portId && item.stationId === s.selectedStationId);
    if (!port) return s;
    return {
      ports: s.ports.map((item) => item.id === portId && item.stationId === s.selectedStationId ? { ...item, status: "disponivel", maintenanceReason: null, blockedReason: null } : item),
      alerts: s.alerts.map((alert) => alert.stationId === s.selectedStationId && alert.origin === portId && alert.status !== "resolvido" ? { ...alert, status: "resolvido", resolvedAt: Date.now(), note } : alert),
      logs: appendLog(s.logs, "INFO", `${port.label} liberada: ${note}`, portId, s.selectedStationId),
      events: appendEvent(s.events, "port", `${port.label} liberada`, portId, s.selectedStationId)
    };
  }),
  toggleBlock: (portId) => set((s) => ({
    ports: s.ports.map((port) => port.id === portId && port.stationId === s.selectedStationId && port.status !== "em_utilizacao"
      ? { ...port, status: port.status === "bloqueada" ? "disponivel" : "bloqueada", blockedReason: port.status === "bloqueada" ? null : "Bloqueada pelo administrador" } : port),
    logs: appendLog(s.logs, "WARN", `Estado de bloqueio alterado em ${portId}`, portId, s.selectedStationId),
    events: appendEvent(s.events, "port", `Estado de bloqueio alterado em ${portId}`, portId, s.selectedStationId)
  })),
  acknowledgeAlert: (alertId) => set((s) => ({
    alerts: s.alerts.map((alert) => alert.id === alertId && alert.status === "aberto" ? { ...alert, status: "reconhecido", acknowledgedAt: Date.now(), acknowledgedBy: "Eduardo Silva" } : alert),
    logs: appendLog(s.logs, "INFO", `Alerta ${alertId} reconhecido`, "Central de alertas", s.selectedStationId)
  })),
  resolveAlert: (alertId, note) => set((s) => ({
    alerts: s.alerts.map((alert) => alert.id === alertId && alert.status !== "resolvido" ? { ...alert, status: "resolvido", resolvedAt: Date.now(), note } : alert),
    logs: appendLog(s.logs, "INFO", `Alerta ${alertId} resolvido`, "Central de alertas", s.selectedStationId)
  })),
  toggleDevice: () => set((s) => {
    const station = s.stations.find((item) => item.id === s.selectedStationId);
    return station ? connectionUpdate(s, station.id, !station.online) : s;
  }),
  restartDevice: () => {
    const state = get();
    const stationId = state.selectedStationId;
    const station = state.stations.find((item) => item.id === stationId);
    if (!station?.online) return;
    set((s) => connectionUpdate(s, stationId, false));
    window.setTimeout(() => {
      set((s) => connectionUpdate(s, stationId, true));
    }, 8000);
  },
  restartPort: (portId) => {
    const state = get();
    const port = state.ports.find((item) => item.id === portId && item.stationId === state.selectedStationId);
    if (!port || !port.online) return;
    set((s) => ({ ports: s.ports.map((item) => item.id === portId && item.stationId === s.selectedStationId ? { ...item, online: false } : item), logs: appendLog(s.logs, "WARN", `Reinicialização de ${port.label} iniciada`, portId, state.selectedStationId) }));
    window.setTimeout(() => set((s) => ({
      ports: s.ports.map((item) => item.id === portId && item.stationId === state.selectedStationId ? { ...item, online: true } : item),
      logs: appendLog(s.logs, "INFO", `Reinicialização de ${port.label} concluída`, portId, state.selectedStationId),
      events: appendEvent(s.events, "port", `${port.label} reiniciada`, portId, state.selectedStationId)
    })), 3000);
  },
  forcePortFailure: () => {
    const port = get().ports.find((item) => item.stationId === get().selectedStationId && item.status === "disponivel");
    if (!port) return;
    get().setMaintenance(port.id, "Falha simulada");
  },
  demandSpike: () => {
    const state = get();
    const available = state.ports.find((item) => item.stationId === state.selectedStationId && item.status === "disponivel");
    if (!available) {
      set((s) => ({ alerts: createAlert(s, "Pico de demanda: todas as portas ocupadas", "TOT-001", "atencao"), logs: appendLog(s.logs, "WARN", "Pico de demanda sem portas livres", "Simulador", state.selectedStationId) }));
      return;
    }
    get().startSession(available.id, get().users[1].id, 0.6);
  },
  tick: () => set((s) => {
    const currentTime = Date.now();
    if (s.simulator.paused) return { ...s, lastTickAt: currentTime };
    const hours = new Date(currentTime).getHours() + new Date(currentTime).getMinutes() / 60;
    const powerKw = Math.max(0, 2.2 * Math.sin(((hours - 6) / 12) * Math.PI));
    const elapsed = Math.max(0, (currentTime - s.lastTickAt) / 3600000);
    const deviceOnline = s.stations.find((station) => station.id === s.selectedStationId)?.online ?? false;
    const sessions = s.sessions.map((session) => session.status === "ativa" && deviceOnline ? { ...session, kWh: Number((session.kWh + 0.45 * elapsed).toFixed(4)) } : session);
    let updated = { ...s, sessions, lastTickAt: currentTime, device: { ...s.device, uptimeSeconds: s.device.uptimeSeconds + (deviceOnline ? Math.round((currentTime - s.lastTickAt) / 1000) : 0), rssi: deviceOnline ? Math.round(Math.max(-72, Math.min(-42, s.device.rssi + (Math.random() * 6 - 3)))) : s.device.rssi } };
    for (const session of sessions) if (session.status === "ativa" && session.kWh >= session.targetKwh) {
      const current = updated.sessions.find((item) => item.id === session.id && item.status === "ativa");
      if (current) {
        updated = { ...updated, sessions: updated.sessions.map((item) => item.id === session.id ? { ...item, status: "concluida", endedAt: currentTime } : item), ports: updated.ports.map((port) => port.id === session.portId && port.stationId === session.stationId ? { ...port, status: "disponivel", currentSessionId: null, lastUsedAt: currentTime } : port), events: appendEvent(updated.events, "port", `${session.portId} liberada após sessão`, session.portId, session.stationId), logs: appendLog(updated.logs, "INFO", `Sessão ${session.id} concluída`, session.portId, session.stationId) };
      }
    }
    const heartbeat = deviceOnline && currentTime - s.simulator.lastHeartbeatLogAt >= 30000;
    return {
      ...updated,
      readings: deviceOnline ? [
        ...s.readings.filter((reading) => reading.stationId !== s.selectedStationId),
        ...s.readings.filter((reading) => reading.stationId === s.selectedStationId).slice(-719),
        { stationId: s.selectedStationId, timestamp: currentTime, generatedKwh: Number((powerKw * elapsed).toFixed(4)), consumedKwh: Number((0.4 * elapsed).toFixed(4)), powerKw }
      ] : s.readings,
      device: { ...updated.device, lastHeartbeatAt: heartbeat ? currentTime : s.device.lastHeartbeatAt },
      simulator: { ...s.simulator, lastHeartbeatLogAt: heartbeat ? currentTime : s.simulator.lastHeartbeatLogAt },
      logs: heartbeat ? appendLog(updated.logs, "INFO", "Heartbeat recebido", "ESP32-001", s.selectedStationId) : updated.logs
    };
  }),
  toggleSimulation: () => set((s) => ({ simulator: { ...s.simulator, paused: !s.simulator.paused }, lastTickAt: Date.now() })),
  reset: () => set(initialState())
}), {
  name: "solar-totem-demo",
  storage: createJSONStorage(() => typeof localStorage === "undefined" ? noOpStorage : localStorage),
  version: 2,
  migrate: () => initialState()
}));

export function getPortDistribution(sessions: Session[], stationId: string) {
  const counts = Array.from({ length: 4 }, (_, index) => sessions.filter((session) => session.stationId === stationId && session.portId === `PORT-00${index + 1}` && session.status === "concluida").length);
  const total = counts.reduce((sum, count) => sum + count, 0);
  if (!total) return counts.map(() => 0);
  const percentages = counts.map((count) => Math.floor(count / total * 100));
  let remainder = 100 - percentages.reduce((sum, value) => sum + value, 0);
  for (let i = 0; remainder > 0; i = (i + 1) % percentages.length) {
    percentages[i] += 1;
    remainder -= 1;
  }
  return percentages;
}

export function calculateAvailability(outages: SolarState["outages"], start: number, end: number, stationId?: string) {
  const total = Math.max(0, end - start);
  if (!total) return 100;
  const intervals = outages
    .filter((outage) => !stationId || outage.stationId === stationId)
    .map((outage) => [Math.max(start, outage.startedAt), Math.min(end, outage.endedAt ?? end)] as const)
    .filter(([outageStart, outageEnd]) => outageEnd > outageStart)
    .sort(([a], [b]) => a - b);
  let downtime = 0;
  let currentStart = -1;
  let currentEnd = -1;
  for (const [outageStart, outageEnd] of intervals) {
    if (outageStart > currentEnd) {
      if (currentStart >= 0) downtime += currentEnd - currentStart;
      currentStart = outageStart;
      currentEnd = outageEnd;
    } else currentEnd = Math.max(currentEnd, outageEnd);
  }
  if (currentStart >= 0) downtime += currentEnd - currentStart;
  return Math.max(0, Number(((total - downtime) / total * 100).toFixed(1)));
}
