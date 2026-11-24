import type { ParsedLineEvent } from "./serial/parseLine";

export type CabinNumber = 1 | 2 | 3 | 4;
export type CabinState = "trancada" | "liberada" | "sem dados";
export type ConnectionStatus = "conectando" | "conectado" | "desconectado";
export type DataSource = "demo" | "usb";
export type LogLevel = "INFO" | "WARN" | "ERROR";
export type AlertSeverity = "critico" | "atencao" | "informacao";
export type AlertStatus = "aberto" | "reconhecido" | "resolvido";

export interface Cabin {
  estado: CabinState;
  ultimaLiberacao: number | null;
  totalLiberacoes: number;
}

export interface AccessRecord {
  id: string;
  ts: number;
  uid: string;
  dataSource: DataSource;
  resultado: "liberado" | "negado";
  cabine?: CabinNumber;
}

export interface SerialLog {
  id: string;
  timestamp: number;
  level: LogLevel;
  raw: string;
  dataSource: DataSource;
}

export interface FirmwareAlert {
  id: string;
  dataSource: DataSource;
  origin: "acesso" | "rfid" | "erro" | "conexao";
  title: string;
  severity: AlertSeverity;
  status: AlertStatus;
  openedAt: number;
  resolvedAt: number | null;
  note?: string;
  seenAt: number | null;
  cabine?: CabinNumber;
}

export interface LdrPoint {
  ts: number;
  ldrEsq: number;
  ldrDir: number;
  diferenca: number;
  angulo: number;
  motor: "ESQUERDA/LESTE" | "DIREITA/OESTE" | "PARADO";
}

export interface FirmwareState {
  connection: ConnectionStatus;
  source: DataSource;
  connectionInfo: { vendorId: number | null; productId: number | null };
  connectedAt: number | null;
  lastDataAt: number | null;
  linesReceived: number;
  lineTimestamps: number[];
  ldrEsq: number | null;
  ldrDir: number | null;
  diferenca: number | null;
  angulo: number | null;
  motor: LdrPoint["motor"] | null;
  cabines: Record<CabinNumber, Cabin>;
  acessos: AccessRecord[];
  logs: SerialLog[];
  alertas: FirmwareAlert[];
  rfid: {
    estado: "sem_dados" | "operacional" | "em_recuperacao" | "sem_resposta";
    falhas: number | null;
    versao: string | null;
  };
  historicoLdr: LdrPoint[];
}

export interface FirmwareActions {
  setConnection: (connection: ConnectionStatus, source?: DataSource, info?: { vendorId?: number | null; productId?: number | null }) => void;
  disconnect: (now?: number) => void;
  processLine: (line: string, now?: number) => ParsedLineEvent;
  checkStaleConnection: (now?: number) => void;
  markAlertSeen: (id: string, now?: number) => void;
  acknowledgeAlert: (id: string) => void;
  resolveAlert: (id: string, note: string) => void;
  reset: () => void;
}
