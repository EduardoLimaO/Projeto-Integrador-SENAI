import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getAccessDistribution, useFirmwareStore } from "./store";

describe("ESP32 serial store", () => {
  beforeEach(() => useFirmwareStore.getState().reset());
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("records permitted and denied accesses from parsed lines", () => {
    useFirmwareStore.getState().processLine("TAG LIDA: 13 49 6A 09 -> ACESSO PERMITIDO - CABINE 1", 1000);
    useFirmwareStore.getState().processLine("TAG LIDA: FF FF FF FF -> ACESSO NEGADO", 2000);
    const state = useFirmwareStore.getState();
    expect(state.acessos).toHaveLength(2);
    expect(state.acessos[1]).toMatchObject({ resultado: "liberado", cabine: 1, uid: "13 49 6A 09" });
    expect(state.acessos[0].resultado).toBe("negado");
    expect(state.cabines[1]).toMatchObject({ totalLiberacoes: 1, ultimaLiberacao: 1000 });
    useFirmwareStore.getState().processLine("TRAVA DA CABINE 1 ABERTA POR 4 SEGUNDOS", 2500);
    expect(useFirmwareStore.getState().cabines[1].totalLiberacoes).toBe(1);
    expect(state.alertas[0]).toMatchObject({ title: "ACESSO NEGADO", severity: "informacao" });
  });

  it("updates a cabin on the real open and locked lines", () => {
    const store = useFirmwareStore.getState();
    store.processLine("TRAVA DA CABINE 1 ABERTA POR 4 SEGUNDOS", 1000);
    expect(useFirmwareStore.getState().cabines[1]).toMatchObject({ estado: "liberada", totalLiberacoes: 1, ultimaLiberacao: 1000 });
    useFirmwareStore.getState().processLine("TRAVA DA CABINE 1 TRANCADA", 5000);
    expect(useFirmwareStore.getState().cabines[1].estado).toBe("trancada");
  });

  it("opens an RFID alert and resolves it after reset recovery", () => {
    const store = useFirmwareStore.getState();
    store.processLine("[RFID] Leitor sem resposta. Falha consecutiva: 1", 1000);
    store.processLine("[RFID] Iniciando reset do RC522: duas verificacoes consecutivas falharam", 2000);
    useFirmwareStore.getState().processLine("[RFID] RC522 recuperado. Versao: 0x92", 3000);
    const state = useFirmwareStore.getState();
    expect(state.rfid).toMatchObject({ estado: "operacional", falhas: 0, versao: "0x92" });
    expect(state.alertas[0]).toMatchObject({ origin: "rfid", status: "resolvido" });
  });

  it("creates a critical disconnection alert and resolves it on serial data", () => {
    useFirmwareStore.getState().setConnection("conectado", "usb");
    useFirmwareStore.getState().disconnect(1000);
    expect(useFirmwareStore.getState().alertas[0]).toMatchObject({ origin: "conexao", severity: "critico", status: "aberto" });
    useFirmwareStore.getState().setConnection("conectado", "usb");
    useFirmwareStore.getState().processLine("RC522 detectado. Aproxime uma tag.", 2000);
    expect(useFirmwareStore.getState().alertas[0]).toMatchObject({ origin: "conexao", status: "resolvido" });
  });

  it("raises a critical alert when serial lines stop arriving for more than five seconds", () => {
    useFirmwareStore.getState().setConnection("conectado", "usb");
    const now = Date.now();
    useFirmwareStore.getState().checkStaleConnection(now + 5001);
    expect(useFirmwareStore.getState().alertas[0]).toMatchObject({ origin: "conexao", severity: "critico", status: "aberto" });
    useFirmwareStore.getState().processLine("RC522 detectado. Aproxime uma tag.", now + 5100);
    expect(useFirmwareStore.getState().alertas[0]).toMatchObject({ origin: "conexao", status: "resolvido" });
  });

  it("keeps demo and USB records from being mixed", () => {
    useFirmwareStore.getState().processLine("TAG LIDA: 13 49 6A 09 -> ACESSO PERMITIDO - CABINE 1", 1000);
    expect(useFirmwareStore.getState().acessos[0].dataSource).toBe("demo");
    useFirmwareStore.getState().setConnection("conectando", "usb");
    expect(useFirmwareStore.getState().acessos).toHaveLength(0);
    useFirmwareStore.getState().processLine("TAG LIDA: A3 1A 78 09 -> ACESSO PERMITIDO - CABINE 2", 2000);
    expect(useFirmwareStore.getState().acessos[0]).toMatchObject({ dataSource: "usb", cabine: 2 });
  });

  it("throttles localStorage writes to one per ten seconds and persists only record arrays", () => {
    const setItem = vi.fn();
    vi.stubGlobal("localStorage", {
      getItem: vi.fn(() => null),
      setItem,
      removeItem: vi.fn()
    });
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-24T12:00:00"));
    useFirmwareStore.getState().reset();
    useFirmwareStore.getState().processLine("TAG LIDA: 13 49 6A 09 -> ACESSO PERMITIDO - CABINE 1", 1000);
    useFirmwareStore.getState().processLine("TAG LIDA: FF FF FF FF -> ACESSO NEGADO", 2000);
    expect(setItem).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(10_000);
    expect(setItem).toHaveBeenCalledTimes(2);
    const saved = JSON.parse(setItem.mock.calls[1][1]) as { state: Record<string, unknown> };
    expect(Object.keys(saved.state).sort()).toEqual(["acessos", "alertas", "logs"]);
  });

  it("allocates cabin distribution percentages summing to one hundred", () => {
    for (let index = 0; index < 7; index += 1) {
      useFirmwareStore.getState().processLine(`TAG LIDA: 13 49 6A 09 -> ACESSO PERMITIDO - CABINE 1`, index);
    }
    for (let index = 0; index < 3; index += 1) {
      useFirmwareStore.getState().processLine("TAG LIDA: A3 1A 78 09 -> ACESSO PERMITIDO - CABINE 2", index);
    }
    const distribution = getAccessDistribution(useFirmwareStore.getState().acessos);
    expect(distribution.reduce((sum, value) => sum + value, 0)).toBe(100);
    expect(distribution).toEqual([70, 30, 0, 0]);
  });

  it("samples LDR at five-second intervals and retains recent history after ten thousand lines", () => {
    const store = useFirmwareStore.getState();
    const line = "LDR E:1800 D:2100 | Dif:300 | Angulo:90 | Motor:DIREITA/OESTE";
    for (let index = 0; index < 100; index += 1) store.processLine(line, index * 100);
    const before = useFirmwareStore.getState().historicoLdr.length;
    for (let index = 100; index < 10_000; index += 1) {
      useFirmwareStore.getState().processLine(line, index * 100);
    }
    const history = useFirmwareStore.getState().historicoLdr;
    expect(history.length).toBeGreaterThan(before);
    expect(history.length).toBeLessThanOrEqual(1441);
    expect(999_900 - history[history.length - 1].ts).toBeLessThan(5000);
  });
});
