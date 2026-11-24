import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { UID_TO_CABIN } from "./hardware.config";
import { parseLine } from "./serial/parseLine";
import type { AccessRecord, CabinNumber, FirmwareActions, FirmwareAlert, FirmwareState, LdrPoint, SerialLog } from "./types";

const cabins = (): FirmwareState["cabines"] => ({
  1: { estado: "sem dados", ultimaLiberacao: null, totalLiberacoes: 0 },
  2: { estado: "sem dados", ultimaLiberacao: null, totalLiberacoes: 0 },
  3: { estado: "sem dados", ultimaLiberacao: null, totalLiberacoes: 0 },
  4: { estado: "sem dados", ultimaLiberacao: null, totalLiberacoes: 0 }
});

function initialState(): FirmwareState {
  return {
    connection: "desconectado",
    source: "demo",
    connectionInfo: { vendorId: null, productId: null },
    connectedAt: null,
    lastDataAt: null,
    linesReceived: 0,
    lineTimestamps: [],
    ldrEsq: null,
    ldrDir: null,
    diferenca: null,
    angulo: null,
    motor: null,
    cabines: cabins(),
    acessos: [],
    logs: [],
    alertas: [],
    rfid: { estado: "sem_dados", falhas: null, versao: null },
    historicoLdr: []
  };
}

let idSequence = 0;
const id = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${(++idSequence).toString(36)}`;

function logLevel(raw: string): "INFO" | "WARN" | "ERROR" {
  if (/^ERRO:/i.test(raw)) return "ERROR";
  if (/ACESSO NEGADO|\[RFID\].*(Leitor sem resposta|nova tentativa)/i.test(raw)) return "WARN";
  return "INFO";
}

function appendAlert(alertas: FirmwareAlert[], alert: Omit<FirmwareAlert, "id" | "status" | "resolvedAt" | "seenAt">): FirmwareAlert[] {
  if ((alert.origin === "rfid" || alert.origin === "conexao")
    && alertas.some((item) => item.origin === alert.origin && item.status !== "resolvido")) return alertas;
  return [{
    ...alert,
    id: id("alerta"),
    status: "aberto",
    resolvedAt: null,
    seenAt: null
  }, ...alertas];
}

function resolveAlerts(alertas: FirmwareAlert[], origin: FirmwareAlert["origin"], now: number, note: string): FirmwareAlert[] {
  return alertas.map((alert) => alert.origin === origin && alert.status !== "resolvido"
    ? { ...alert, status: "resolvido", resolvedAt: now, note }
    : alert);
}

function cabinNumber(value: number): CabinNumber | null {
  return value >= 1 && value <= 4 ? value as CabinNumber : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isAccessRecord(value: unknown): value is AccessRecord {
  if (!isRecord(value)) return false;
  return typeof value.id === "string" && typeof value.ts === "number" && typeof value.uid === "string"
    && (value.resultado === "liberado" || value.resultado === "negado")
    && (value.cabine === undefined || (typeof value.cabine === "number" && value.cabine >= 1 && value.cabine <= 4))
    && (value.dataSource === "demo" || value.dataSource === "usb");
}

function isSerialLog(value: unknown): value is SerialLog {
  if (!isRecord(value)) return false;
  return typeof value.id === "string" && typeof value.timestamp === "number" && typeof value.raw === "string"
    && (value.level === "INFO" || value.level === "WARN" || value.level === "ERROR")
    && (value.dataSource === "demo" || value.dataSource === "usb");
}

function isFirmwareAlert(value: unknown): value is FirmwareAlert {
  if (!isRecord(value)) return false;
  return typeof value.id === "string" && typeof value.title === "string" && typeof value.openedAt === "number"
    && (value.status === "aberto" || value.status === "reconhecido" || value.status === "resolvido")
    && (value.dataSource === "demo" || value.dataSource === "usb");
}

function createThrottledStorage() {
  const intervalMs = 10_000;
  let lastWrite = 0;
  let pending: { name: string; value: string } | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  return {
    getItem: (name: string) => typeof localStorage === "undefined" ? null : localStorage.getItem(name),
    setItem: (name: string, value: string) => {
      if (typeof localStorage === "undefined") return;
      const now = Date.now();
      if (now - lastWrite >= intervalMs) {
        if (timer !== null) clearTimeout(timer);
        timer = null;
        pending = null;
        localStorage.setItem(name, value);
        lastWrite = now;
        return;
      }
      pending = { name, value };
      if (timer !== null) return;
      timer = setTimeout(() => {
        if (pending) localStorage.setItem(pending.name, pending.value);
        pending = null;
        timer = null;
        lastWrite = Date.now();
      }, intervalMs - (now - lastWrite));
    },
    removeItem: (name: string) => {
      if (typeof localStorage !== "undefined") localStorage.removeItem(name);
    }
  };
}

const storage = createThrottledStorage();

export const useFirmwareStore = create<FirmwareState & FirmwareActions>()(persist((set) => ({
  ...initialState(),
  setConnection: (connection, source, info) => set((state) => {
    const nextSource = source ?? state.source;
    const sourceChanged = nextSource !== state.source;
    const records = sourceChanged ? {
      acessos: state.acessos.filter((record) => record.dataSource === nextSource),
      logs: state.logs.filter((record) => record.dataSource === nextSource),
      alertas: state.alertas.filter((record) => record.dataSource === nextSource)
    } : { acessos: state.acessos, logs: state.logs, alertas: state.alertas };
    return {
      ...(sourceChanged ? initialState() : {}),
      source: nextSource,
      ...records,
      connection,
      connectedAt: connection === "conectado" ? Date.now() : null,
      connectionInfo: {
        vendorId: info?.vendorId !== undefined ? info.vendorId : (sourceChanged ? null : state.connectionInfo.vendorId),
        productId: info?.productId !== undefined ? info.productId : (sourceChanged ? null : state.connectionInfo.productId)
      }
    };
  }),
  disconnect: (now = Date.now()) => set((state) => ({
    connection: "desconectado",
    connectedAt: null,
    alertas: state.source === "usb"
      ? appendAlert(state.alertas, { dataSource: state.source, origin: "conexao", title: "Cabo USB removido ou conexão serial encerrada", severity: "critico", openedAt: now })
      : state.alertas
  })),
  processLine: (line, now = Date.now()) => {
    const event = parseLine(line, now);
    set((state) => {
      let next: Partial<FirmwareState> = {
        lastDataAt: now,
        linesReceived: state.linesReceived + 1,
        lineTimestamps: [...state.lineTimestamps, now].slice(-1000),
        logs: [{ id: id("linha"), timestamp: now, level: logLevel(line), raw: line, dataSource: state.source }, ...state.logs].slice(0, 500),
        alertas: resolveAlerts(state.alertas, "conexao", now, "Dados recebidos do ESP32")
      };

      switch (event.type) {
        case "ldr": {
          const point: LdrPoint = { ts: now, ldrEsq: event.ldrEsq, ldrDir: event.ldrDir, diferenca: event.diferenca, angulo: event.angulo, motor: event.motor };
          const lastPoint = state.historicoLdr[state.historicoLdr.length - 1];
          const shouldSample = !lastPoint || now - lastPoint.ts >= 5000;
          next = {
            ...next,
            ldrEsq: event.ldrEsq,
            ldrDir: event.ldrDir,
            diferenca: event.diferenca,
            angulo: event.angulo,
            motor: event.motor,
            historicoLdr: shouldSample
              ? [...state.historicoLdr, point].filter((item) => item.ts >= now - 120 * 60_000)
              : state.historicoLdr
          };
          break;
        }
        case "acessoPermitido":
        case "acessoNegado": {
          const allowed = event.type === "acessoPermitido";
          const cabin = allowed ? cabinNumber(event.cabine ?? (UID_TO_CABIN[event.uid] ?? 0)) : null;
          const access = {
            id: id("acesso"),
            ts: now,
            uid: event.uid,
            dataSource: state.source,
            resultado: allowed ? "liberado" as const : "negado" as const,
            ...(cabin ? { cabine: cabin } : {})
          };
          next = {
            ...next,
            acessos: [access, ...state.acessos],
            ...(allowed && cabin ? {
              cabines: {
                ...state.cabines,
                [cabin]: {
                  ...state.cabines[cabin],
                  ultimaLiberacao: now,
                  totalLiberacoes: state.cabines[cabin].totalLiberacoes + 1
                }
              }
            } : {}),
            alertas: allowed ? next.alertas : appendAlert(next.alertas ?? state.alertas, {
              dataSource: state.source, origin: "acesso", title: "ACESSO NEGADO", severity: "informacao", openedAt: now
            })
          };
          break;
        }
        case "travaAberta": {
          const cabin = cabinNumber(event.cabine);
          if (cabin) {
            const hasRecentPermit = state.acessos.some((access) => access.resultado === "liberado"
              && access.cabine === cabin && now >= access.ts && now - access.ts <= 5000);
            next = {
              ...next,
              cabines: {
                ...state.cabines,
                [cabin]: {
                  ...state.cabines[cabin],
                  estado: "liberada",
                  ultimaLiberacao: now,
                  totalLiberacoes: state.cabines[cabin].totalLiberacoes + (hasRecentPermit ? 0 : 1)
                }
              }
            };
          }
          break;
        }
        case "travaTrancada": {
          const cabin = cabinNumber(event.cabine);
          if (cabin) next = { ...next, cabines: { ...state.cabines, [cabin]: { ...state.cabines[cabin], estado: "trancada" } } };
          break;
        }
        case "rfidFalha":
          next = {
            ...next,
            rfid: { ...state.rfid, estado: "sem_resposta", falhas: event.falhas },
            alertas: appendAlert(next.alertas ?? state.alertas, { dataSource: state.source, origin: "rfid", title: "Leitor RFID sem resposta", severity: "atencao", openedAt: now })
          };
          break;
        case "rfidReset":
          next = {
            ...next,
            rfid: { ...state.rfid, estado: "em_recuperacao" },
            alertas: appendAlert(next.alertas ?? state.alertas, { dataSource: state.source, origin: "rfid", title: "Reset do leitor RFID iniciado", severity: "atencao", openedAt: now })
          };
          break;
        case "rfidRecuperado":
          next = {
            ...next,
            rfid: { estado: "operacional", falhas: 0, versao: event.versao },
            alertas: resolveAlerts(next.alertas ?? state.alertas, "rfid", now, "Leitor RFID recuperado")
          };
          break;
        case "erro":
          next = {
            ...next,
            alertas: appendAlert(next.alertas ?? state.alertas, { dataSource: state.source, origin: "erro", title: line.trim(), severity: "critico", openedAt: now })
          };
          break;
        case "desconhecida":
          if (/^RC522 detectado\./i.test(line.trim())) next = { ...next, rfid: { ...state.rfid, estado: "operacional" } };
          if (/\[RFID\].*(nova tentativa|ainda sem resposta)/i.test(line)) {
            next = { ...next, rfid: { ...state.rfid, estado: "em_recuperacao" } };
          }
          break;
        case "boot":
          next = {
            ...next,
            angulo: event.angulo,
            cabines: {
              1: { ...state.cabines[1], estado: "sem dados" },
              2: { ...state.cabines[2], estado: "sem dados" },
              3: { ...state.cabines[3], estado: "sem dados" },
              4: { ...state.cabines[4], estado: "sem dados" }
            },
            ldrEsq: null,
            ldrDir: null,
            diferenca: null,
            motor: null,
            rfid: { estado: "sem_dados", falhas: null, versao: null }
          };
          break;
      }
      return next;
    });
    return event;
  },
  checkStaleConnection: (now = Date.now()) => set((state) => {
    const reference = state.lastDataAt ?? state.connectedAt;
    if (state.source !== "usb" || state.connection !== "conectado" || reference === null || now - reference <= 5000) return {};
    return {
      alertas: appendAlert(state.alertas, {
        dataSource: state.source, origin: "conexao", title: "Sem dados do ESP32 há mais de 5 segundos", severity: "critico", openedAt: now
      })
    };
  }),
  markAlertSeen: (alertId, now = Date.now()) => set((state) => ({
    alertas: state.alertas.map((alert) => alert.id === alertId && alert.seenAt === null ? { ...alert, seenAt: now } : alert)
  })),
  acknowledgeAlert: (alertId) => set((state) => ({
    alertas: state.alertas.map((alert) => alert.id === alertId && alert.status === "aberto" ? { ...alert, status: "reconhecido" } : alert)
  })),
  resolveAlert: (alertId, note) => set((state) => ({
    alertas: state.alertas.map((alert) => alert.id === alertId && alert.status !== "resolvido"
      ? { ...alert, status: "resolvido", resolvedAt: Date.now(), note }
      : alert)
  })),
  reset: () => set(initialState())
}), {
  name: "solar-totem-firmware",
  storage: createJSONStorage(() => storage),
  partialize: (state) => ({ acessos: state.acessos, logs: state.logs, alertas: state.alertas }),
  merge: (persistedState, currentState) => {
    const saved = isRecord(persistedState) ? persistedState : {};
    const savedAccesses = Array.isArray(saved.acessos) ? saved.acessos.filter(isAccessRecord) : [];
    const savedLogs = Array.isArray(saved.logs) ? saved.logs.filter(isSerialLog).slice(0, 500) : [];
    const savedAlerts = Array.isArray(saved.alertas) ? saved.alertas.filter(isFirmwareAlert) : [];
    const dataSource = savedAccesses[0]?.dataSource ?? savedLogs[0]?.dataSource ?? savedAlerts[0]?.dataSource ?? currentState.source;
    const acessos = savedAccesses.filter((record) => record.dataSource === dataSource);
    const logs = savedLogs.filter((record) => record.dataSource === dataSource);
    const alertas = savedAlerts.filter((record) => record.dataSource === dataSource);
    const restoredCabins = cabins();
    for (const access of acessos) {
      if (access.resultado !== "liberado" || !access.cabine) continue;
      const cabin = cabinNumber(access.cabine);
      if (!cabin) continue;
      restoredCabins[cabin].totalLiberacoes += 1;
      const lastRelease = restoredCabins[cabin].ultimaLiberacao;
      if (lastRelease === null || access.ts > lastRelease) {
        restoredCabins[cabin].ultimaLiberacao = access.ts;
      }
    }
    return { ...currentState, source: dataSource, acessos, logs, alertas, cabines: restoredCabins };
  }
}));

export function getAccessDistribution(acessos: FirmwareState["acessos"], cabinFilter?: CabinNumber) {
  const counts = [1, 2, 3, 4].map((cabin) => acessos.filter((access) => access.resultado === "liberado" && access.cabine === cabin && (!cabinFilter || cabinFilter === cabin)).length);
  const total = counts.reduce((sum, count) => sum + count, 0);
  if (!total) return counts.map(() => 0);
  const exact = counts.map((count) => count * 100 / total);
  const rounded = exact.map(Math.floor);
  let remaining = 100 - rounded.reduce((sum, value) => sum + value, 0);
  const order = exact.map((value, index) => ({ index, fraction: value - rounded[index] })).sort((a, b) => b.fraction - a.fraction);
  for (let index = 0; index < remaining; index += 1) rounded[order[index].index] += 1;
  return rounded;
}
