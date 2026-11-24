export type PortStatus = "disponivel" | "em_utilizacao" | "manutencao" | "bloqueada";
export type AlertStatus = "aberto" | "reconhecido" | "resolvido";
export type Severity = "critico" | "atencao" | "informacao";
export type LogLevel = "INFO" | "WARN" | "ERROR";

export interface Station {
  id: string;
  name: string;
  location: string;
  online: boolean;
}

export interface Port {
  id: string;
  stationId: string;
  label: string;
  status: PortStatus;
  online: boolean;
  lastUsedAt: number;
  currentSessionId: string | null;
  maintenanceReason: string | null;
  blockedReason: string | null;
}

export interface User {
  id: string;
  name: string;
  registration: string;
  active: boolean;
}

export interface Session {
  id: string;
  stationId: string;
  portId: string;
  userId: string;
  startedAt: number;
  endedAt: number | null;
  kWh: number;
  status: "ativa" | "concluida" | "cancelada";
  targetKwh: number;
}

export interface Alert {
  id: string;
  stationId: string;
  title: string;
  origin: string;
  severity: Severity;
  status: AlertStatus;
  openedAt: number;
  acknowledgedAt: number | null;
  acknowledgedBy: string | null;
  resolvedAt: number | null;
  note?: string;
}

export interface LogEntry {
  id: string;
  stationId: string;
  timestamp: number;
  level: LogLevel;
  message: string;
  origin: string;
}

export interface EventEntry {
  id: string;
  stationId: string;
  type: "session" | "port" | "device" | "alert" | "energy";
  message: string;
  portId?: string;
  timestamp: number;
}

export interface EnergyReading {
  stationId: string;
  timestamp: number;
  generatedKwh: number;
  consumedKwh: number;
  powerKw: number;
}

export interface Device {
  firmware: string;
  ip: string;
  rssi: number;
  uptimeSeconds: number;
  lastHeartbeatAt: number;
}

export interface Outage {
  stationId: string;
  startedAt: number;
  endedAt: number | null;
}

export interface SolarState {
  stations: Station[];
  selectedStationId: string;
  ports: Port[];
  sessions: Session[];
  users: User[];
  alerts: Alert[];
  logs: LogEntry[];
  events: EventEntry[];
  readings: EnergyReading[];
  device: Device;
  outages: Outage[];
  simulator: { paused: boolean; lastHeartbeatLogAt: number };
  lastTickAt: number;
}
