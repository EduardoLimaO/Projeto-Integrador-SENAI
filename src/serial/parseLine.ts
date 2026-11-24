import { UID_TO_CABIN } from "../hardware.config";

type EventBase = { timestamp: number; raw: string };

export type ParsedLineEvent =
  | (EventBase & { type: "ldr"; ldrEsq: number; ldrDir: number; diferenca: number; angulo: number; motor: "ESQUERDA/LESTE" | "DIREITA/OESTE" | "PARADO" })
  | (EventBase & { type: "acessoPermitido"; uid: string; cabine: number | null })
  | (EventBase & { type: "acessoNegado"; uid: string })
  | (EventBase & { type: "travaAberta"; cabine: number; segundos: number })
  | (EventBase & { type: "travaTrancada"; cabine: number })
  | (EventBase & { type: "rfidFalha"; falhas: number })
  | (EventBase & { type: "rfidReset" })
  | (EventBase & { type: "rfidRecuperado"; versao: string })
  | (EventBase & { type: "boot"; angulo: number })
  | (EventBase & { type: "erro" })
  | (EventBase & { type: "desconhecida" });

const uidPattern = "[0-9A-Fa-f]{2}(?:\\s+[0-9A-Fa-f]{2}){3}";

export function parseLine(line: string, now: number): ParsedLineEvent {
  const text = line.trim();
  const base = { timestamp: now, raw: line };

  const ldr = text.match(/^LDR\s+E:(\d+)\s+D:(\d+)\s*\|\s*Dif:(-?\d+)\s*\|\s*Angulo:(\d+)\s*\|\s*Motor:(ESQUERDA\/LESTE|DIREITA\/OESTE|PARADO)$/i);
  if (ldr) {
    return {
      ...base,
      type: "ldr",
      ldrEsq: Number(ldr[1]),
      ldrDir: Number(ldr[2]),
      diferenca: Number(ldr[3]),
      angulo: Number(ldr[4]),
      motor: ldr[5].toUpperCase() as "ESQUERDA/LESTE" | "DIREITA/OESTE" | "PARADO"
    };
  }

  const allowed = text.match(new RegExp(`^TAG LIDA:\\s*(${uidPattern})\\s*->\\s*ACESSO PERMITIDO(?:\\s*-\\s*CABINE\\s+(\\d+))?$`, "i"));
  if (allowed) {
    const uid = normalizeUid(allowed[1]);
    return { ...base, type: "acessoPermitido", uid, cabine: allowed[2] ? Number(allowed[2]) : UID_TO_CABIN[uid] ?? null };
  }

  const denied = text.match(new RegExp(`^TAG LIDA:\\s*(${uidPattern})\\s*->\\s*ACESSO NEGADO$`, "i"));
  if (denied) return { ...base, type: "acessoNegado", uid: normalizeUid(denied[1]) };

  const opened = text.match(/^TRAVA DA CABINE (\d+) ABERTA POR (\d+) SEGUNDOS$/i);
  if (opened) return { ...base, type: "travaAberta", cabine: Number(opened[1]), segundos: Number(opened[2]) };

  const locked = text.match(/^TRAVA DA CABINE (\d+) TRANCADA$/i);
  if (locked) return { ...base, type: "travaTrancada", cabine: Number(locked[1]) };

  const failure = text.match(/^\[RFID\]\s*Leitor sem resposta\.\s*Falha consecutiva:\s*(\d+)$/i);
  if (failure) return { ...base, type: "rfidFalha", falhas: Number(failure[1]) };

  if (/^\[RFID\]\s*Iniciando reset do RC522:/i.test(text)) return { ...base, type: "rfidReset" };

  const recovered = text.match(/^\[RFID\]\s*RC522 recuperado\.\s*Versao:\s*(.+)$/i);
  if (recovered) return { ...base, type: "rfidRecuperado", versao: recovered[1].trim() };

  const boot = text.match(/^Angulo inicial assumido:\s*(\d+)\s*graus$/i);
  if (boot) return { ...base, type: "boot", angulo: Number(boot[1]) };

  if (/^ERRO:/i.test(text)) return { ...base, type: "erro" };
  return { ...base, type: "desconhecida" };
}

function normalizeUid(uid: string): string {
  return uid.toUpperCase().replace(/\s+/g, " ").trim();
}
