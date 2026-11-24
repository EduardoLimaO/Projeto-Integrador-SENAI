export interface SerialPortInfo {
  vendorId: number | null;
  productId: number | null;
}

interface BrowserSerialPort extends EventTarget {
  readable: ReadableStream<BufferSource> | null;
  writable: WritableStream<Uint8Array> | null;
  open: (options: { baudRate: number }) => Promise<void>;
  close: () => Promise<void>;
  getInfo: () => { usbVendorId?: number; usbProductId?: number };
}

interface BrowserSerialApi extends EventTarget {
  requestPort: () => Promise<BrowserSerialPort>;
  getPorts: () => Promise<BrowserSerialPort[]>;
}

interface SerialCallbacks {
  onLine: (line: string) => void;
  onConnected: (info: SerialPortInfo) => void;
  onDisconnect: (message: string) => void;
  onError: (message: string) => void;
}

interface ActiveConnection {
  api: BrowserSerialApi;
  port: BrowserSerialPort;
  reader: ReadableStreamDefaultReader<string> | null;
  callbacks: SerialCallbacks;
  stopped: boolean;
  disconnectNotified: boolean;
  disconnectHandler: EventListener | null;
}

let active: ActiveConnection | null = null;

function getSerialApi(): BrowserSerialApi | null {
  return (navigator as Navigator & { serial?: BrowserSerialApi }).serial ?? null;
}

function serialErrorMessage(error: unknown): string {
  const name = error instanceof DOMException ? error.name : "";
  if (name === "NetworkError" || name === "InvalidStateError") return "Feche o Serial Monitor da Arduino IDE e tente novamente.";
  if (name === "NotFoundError") return "Nenhuma porta USB compatível foi encontrada.";
  return error instanceof Error ? error.message : "Não foi possível abrir a porta serial.";
}

export function consumeSerialChunk(buffer: string, chunk: string): { lines: string[]; remainder: string } {
  let combined = buffer + chunk;
  if (combined.length > 8192) combined = combined.slice(-4096);
  const parts = combined.split("\n");
  const remainder = parts.pop() ?? "";
  return {
    lines: parts.map((line) => line.replace(/\r$/, "")).filter((line) => line.trim().length > 0),
    remainder
  };
}

function notifyDisconnect(connection: ActiveConnection, message: string) {
  if (connection.disconnectNotified) return;
  connection.disconnectNotified = true;
  connection.callbacks.onDisconnect(message);
}

async function readPort(connection: ActiveConnection) {
  let buffer = "";
  let pipeCompletion: Promise<void> | null = null;
  try {
    if (!connection.port.readable) throw new Error("A porta serial não disponibilizou um fluxo de leitura.");
    const decoder = new TextDecoderStream();
    pipeCompletion = connection.port.readable.pipeTo(decoder.writable);
    connection.reader = decoder.readable.getReader();
    while (!connection.stopped) {
      const { value, done } = await connection.reader.read();
      if (done) break;
      const result = consumeSerialChunk(buffer, value ?? "");
      buffer = result.remainder;
      result.lines.forEach(connection.callbacks.onLine);
    }
    if (!connection.stopped) notifyDisconnect(connection, "Conexão serial encerrada.");
  } catch (error) {
    if (!connection.stopped) {
      connection.callbacks.onError(serialErrorMessage(error));
      notifyDisconnect(connection, "Cabo USB removido ou conexão serial encerrada.");
    }
  } finally {
    await pipeCompletion?.catch(() => undefined);
    connection.reader?.releaseLock();
    connection.reader = null;
  }
}

async function openPort(api: BrowserSerialApi, port: BrowserSerialPort, callbacks: SerialCallbacks): Promise<SerialPortInfo> {
  if (active) await disconnectSerial(false);
  try {
    await port.open({ baudRate: 115200 });
    const connection: ActiveConnection = { api, port, reader: null, callbacks, stopped: false, disconnectNotified: false, disconnectHandler: null };
    active = connection;
    const info = port.getInfo();
    const serialInfo = { vendorId: info.usbVendorId ?? null, productId: info.usbProductId ?? null };
    callbacks.onConnected(serialInfo);
    connection.disconnectHandler = (event) => {
      if (active === connection && (event.target === port || !event.target)) {
        connection.stopped = true;
        active = null;
        notifyDisconnect(connection, "Cabo USB removido.");
      }
    };
    api.addEventListener("disconnect", connection.disconnectHandler, { once: true });
    void readPort(connection);
    return serialInfo;
  } catch (error) {
    callbacks.onError(serialErrorMessage(error));
    throw error;
  }
}

export async function connectWebSerial(callbacks: SerialCallbacks): Promise<boolean> {
  const api = getSerialApi();
  if (!api) {
    callbacks.onError("Use Chrome ou Edge no computador.");
    return false;
  }
  try {
    const port = await api.requestPort();
    await openPort(api, port, callbacks);
    return true;
  } catch (error) {
    if (error instanceof DOMException && (error.name === "AbortError" || error.name === "NotFoundError")) return false;
    throw error;
  }
}

export async function reconnectAuthorizedPort(callbacks: SerialCallbacks): Promise<boolean> {
  const api = getSerialApi();
  if (!api) return false;
  const ports = await api.getPorts();
  for (const port of ports) {
    try {
      await openPort(api, port, callbacks);
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

export async function disconnectSerial(notify = true): Promise<void> {
  const connection = active;
  if (!connection) return;
  active = null;
  connection.stopped = true;
  if (connection.disconnectHandler) connection.api.removeEventListener("disconnect", connection.disconnectHandler);
  try {
    await connection.reader?.cancel();
  } catch {
    connection.reader?.releaseLock();
  }
  try {
    await connection.port.close();
  } catch (error) {
    if (notify) connection.callbacks.onError(serialErrorMessage(error));
  }
  if (notify) notifyDisconnect(connection, "Conexão serial desconectada.");
}

export async function sendCabinOpenCommand(cabin: number): Promise<void> {
  const connection = active;
  if (!connection?.port.writable) throw new Error("Não há conexão serial ativa.");
  const writer = connection.port.writable.getWriter();
  try {
    await writer.write(new TextEncoder().encode(`ABRIR ${cabin}\n`));
  } finally {
    writer.releaseLock();
  }
}
