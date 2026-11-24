import { describe, expect, it } from "vitest";
import { parseLine } from "./parseLine";

describe("parseLine", () => {
  const now = 1764000000000;

  it("parses an LDR reading and motor direction", () => {
    expect(parseLine("LDR E:1800 D:2100 | Dif:300 | Angulo:90 | Motor:DIREITA/OESTE", now)).toMatchObject({
      type: "ldr", ldrEsq: 1800, ldrDir: 2100, diferenca: 300, angulo: 90, motor: "DIREITA/OESTE", timestamp: now
    });
  });

  it("maps allowed UIDs and preserves denied UIDs", () => {
    expect(parseLine("TAG LIDA: 13 49 6A 09 -> ACESSO PERMITIDO - CABINE 1", now)).toMatchObject({
      type: "acessoPermitido", uid: "13 49 6A 09", cabine: 1
    });
    expect(parseLine("TAG LIDA: FF FF FF FF -> ACESSO NEGADO", now)).toMatchObject({
      type: "acessoNegado", uid: "FF FF FF FF"
    });
  });

  it.each([
    ["TRAVA DA CABINE 1 ABERTA POR 4 SEGUNDOS", "travaAberta"],
    ["TRAVA DA CABINE 1 TRANCADA", "travaTrancada"],
    ["[RFID] Leitor sem resposta. Falha consecutiva: 1", "rfidFalha"],
    ["[RFID] Iniciando reset do RC522: duas verificacoes consecutivas falharam", "rfidReset"],
    ["[RFID] RC522 ainda sem resposta. Nova tentativa em 3 segundos.", "desconhecida"],
    ["[RFID] RC522 recuperado. Versao: 0x92", "rfidRecuperado"],
    ["Angulo inicial assumido: 90 graus", "boot"],
    ["RC522 detectado. Aproxime uma tag.", "desconhecida"],
    ["ERRO: RC522 nao detectado.", "erro"],
    ["LDR E:18 D:", "desconhecida"],
    ["lixo serial inesperado", "desconhecida"]
  ])("returns %s as %s", (line, type) => {
    expect(parseLine(line, now).type).toBe(type);
    expect(parseLine(line, now).raw).toBe(line);
  });

  it("maps a UID when the permit line omits the cabin number", () => {
    expect(parseLine("TAG LIDA: A3 1A 78 09 -> ACESSO PERMITIDO", now)).toMatchObject({
      type: "acessoPermitido", cabine: 2
    });
  });
});
