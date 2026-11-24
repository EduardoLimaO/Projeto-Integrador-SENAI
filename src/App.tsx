import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, NavLink, Route, Routes } from "react-router-dom";
import { format, formatDistance, startOfDay, subDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { ReactNode } from "react";
import { getAccessDistribution, useFirmwareStore } from "./store";
import { SUPPORTS_OPEN_COMMAND, UID_TO_CABIN } from "./hardware.config";
import type { AccessRecord, CabinNumber, FirmwareAlert, SerialLog } from "./types";
import { startDemoSource } from "./serial/demoSource";
import { parseLine } from "./serial/parseLine";
import { connectWebSerial, disconnectSerial, reconnectAuthorizedPort, sendCabinOpenCommand } from "./serial/webSerial";

const cabins: CabinNumber[] = [1, 2, 3, 4];
const cabinColors = ["#1f6f78", "#4c9297", "#89b9b8", "#f4b942"];
const uidForCabin = (cabin: CabinNumber) => Object.entries(UID_TO_CABIN).find(([, assigned]) => assigned === cabin)?.[0] ?? null;
const timestampLabel = (timestamp: number) => format(timestamp, "dd/MM/yyyy HH:mm:ss", { locale: ptBR });
const relativeTime = (timestamp: number | null, now: number) => timestamp === null ? "—" : formatDistance(timestamp, now, { addSuffix: true, locale: ptBR, includeSeconds: true });

function App() {
  const setConnection = useFirmwareStore((state) => state.setConnection);
  const processLine = useFirmwareStore((state) => state.processLine);
  const connection = useFirmwareStore((state) => state.connection);
  const demoStop = useRef<(() => void) | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [serialError, setSerialError] = useState("");
  const [dark, setDark] = useState(false);
  const [clock, setClock] = useState(Date.now());

  const serialCallbacks = useMemo(() => ({
    onLine: (line: string) => processLine(line),
    onConnected: (info: { vendorId: number | null; productId: number | null }) => {
      demoStop.current?.();
      demoStop.current = null;
      setSerialError("");
      setConnection("conectado", "usb", info);
    },
    onDisconnect: () => useFirmwareStore.getState().disconnect(),
    onError: (message: string) => setSerialError(message)
  }), [processLine, setConnection]);

  useEffect(() => {
    let mounted = true;
    reconnectAuthorizedPort(serialCallbacks).then((connected) => {
      if (!mounted || connected || useFirmwareStore.getState().source !== "demo") return;
      demoStop.current = startDemoSource((line) => useFirmwareStore.getState().processLine(line));
    }).catch((error: unknown) => {
      if (!mounted) return;
      setSerialError(error instanceof Error ? error.message : "Não foi possível verificar portas USB autorizadas.");
      demoStop.current = startDemoSource((line) => useFirmwareStore.getState().processLine(line));
    });
    const staleTimer = window.setInterval(() => useFirmwareStore.getState().checkStaleConnection(), 500);
    const clockTimer = window.setInterval(() => setClock(Date.now()), 1000);
    return () => {
      mounted = false;
      window.clearInterval(staleTimer);
      window.clearInterval(clockTimer);
      demoStop.current?.();
      demoStop.current = null;
      void disconnectSerial(false);
    };
  }, [serialCallbacks]);

  const connect = useCallback(async () => {
    demoStop.current?.();
    demoStop.current = null;
    setSerialError("");
    setConnection("conectando", "usb");
    try {
      const connected = await connectWebSerial(serialCallbacks);
      if (!connected && useFirmwareStore.getState().connection === "conectando") setConnection("desconectado", "usb");
    } catch (error) {
      setConnection("desconectado", "usb");
      setSerialError(error instanceof Error ? error.message : "Não foi possível conectar à porta USB.");
    }
  }, [serialCallbacks, setConnection]);

  const alerts = useFirmwareStore((state) => state.alertas);
  const unseenAlerts = alerts.some((alert) => alert.seenAt === null);
  const markAlertSeen = useFirmwareStore((state) => state.markAlertSeen);

  return <div className={dark ? "app dark firmware-app" : "app firmware-app"}>
    <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
    <main className="main-area">
      <header className="topbar">
        <button className="mobile-menu" onClick={() => setSidebarOpen((open) => !open)} aria-label="Abrir menu">☰</button>
        <div className="serial-status"><i className={`state-dot ${connection === "conectado" ? "online" : "offline"}`} />
          <span><small>Conexão do totem</small><b>{connectionName(connection)}</b></span>
        </div>
        <div className="top-actions">
          <button className="firmware-theme-toggle" onClick={() => setDark((value) => !value)} aria-label="Alternar tema claro/escuro">◐</button>
          <button className={`icon-button ${notificationOpen ? "pressed" : ""}`} aria-label="Notificações" onClick={() => {
            const opening = !notificationOpen;
            setNotificationOpen(opening);
            if (opening) alerts.forEach((alert) => { if (alert.seenAt === null) markAlertSeen(alert.id); });
          }}>♢{unseenAlerts && <i className="notification-dot" />}</button>
          {connection === "conectado"
            ? <button className="button-secondary" onClick={() => { void disconnectSerial(); }}>Desconectar</button>
            : <button className="button-primary" onClick={() => { void connect(); }} disabled={connection === "conectando"}>＋ <span>Conectar ao totem (USB)</span></button>}
        </div>
      </header>
      {notificationOpen && <NotificationPopover onClose={() => setNotificationOpen(false)} now={clock} />}
      {serialError && <div className="serial-error" role="status"><span>{serialError}</span><button aria-label="Fechar mensagem" onClick={() => setSerialError("")}>×</button></div>}
      <div className="page-content">
        <Routes>
          <Route path="/" element={<Overview now={clock} />} />
          <Route path="/portas" element={<CabinsPage now={clock} />} />
          <Route path="/seguidor" element={<TrackerPage />} />
          <Route path="/energia" element={<Navigate to="/seguidor" replace />} />
          <Route path="/executivo" element={<AccessesPage now={clock} />} />
          <Route path="/tecnico" element={<TechnicalPage now={clock} />} />
          <Route path="/alertas" element={<AlertsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </main>
  </div>;
}

function connectionName(connection: "conectando" | "conectado" | "desconectado") {
  return connection === "conectado" ? "USB conectado" : connection === "conectando" ? "Conectando…" : "USB desconectado";
}

function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const alerts = useFirmwareStore((state) => state.alertas);
  const openCount = alerts.filter((alert) => alert.status === "aberto").length;
  const connection = useFirmwareStore((state) => state.connection);
  const lastDataAt = useFirmwareStore((state) => state.lastDataAt);
  const [clock, setClock] = useState(Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const nav = [["/", "⌂", "Visão geral"], ["/portas", "▦", "Cabines"], ["/seguidor", "ϟ", "Seguidor solar"], ["/executivo", "◫", "Acessos"], ["/tecnico", "⌁", "Central técnica"], ["/alertas", "◌", "Alertas"]];
  return <>
    {open && <button className="mobile-backdrop" onClick={onClose} aria-label="Fechar menu" />}
    <aside className={`sidebar ${open ? "sidebar-open" : ""}`}>
      <Link to="/" className="brand"><span className="brand-symbol">☼</span><span><b>Solar Totem</b><small>SENAI</small></span></Link>
      <nav className="nav-groups" aria-label="Navegação principal">
        <div className="nav-caption">MONITORAMENTO</div>
        {nav.map(([to, icon, label]) => <NavLink key={to} to={to} end={to === "/"} onClick={onClose} className={({ isActive }) => `nav-link ${isActive ? "selected" : ""}`}>
          <span className="nav-icon">{icon}</span>{label}{to === "/alertas" && openCount > 0 && <span className="nav-count">{openCount}</span>}
        </NavLink>)}
      </nav>
      <div className="sidebar-bottom">
        <div className="system-state"><i className={connection === "conectado" ? "online" : "offline"} /><span><b>{connection === "conectado" ? "Serial conectada" : "Serial desconectada"}</b><small>Último dado {relativeTime(lastDataAt, clock)}</small></span></div>
        <div className="sidebar-footer-note">Leitura serial · 115200 baud</div>
      </div>
    </aside>
  </>;
}

function PageHeading({ eyebrow, title, description, right }: { eyebrow: string; title: string; description: string; right?: ReactNode }) {
  return <div className="page-heading"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{description}</p></div>{right}</div>;
}

function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`card ${className}`}>{children}</section>;
}

function CardHead({ eyebrow, title, right }: { eyebrow?: string; title: string; right?: ReactNode }) {
  return <div className="card-head"><div>{eyebrow && <div className="eyebrow">{eyebrow}</div>}<h2>{title}</h2></div>{right}</div>;
}

function Badge({ children, tone = "ok" }: { children: ReactNode; tone?: string }) {
  return <span className={`badge ${tone}`}><i />{children}</span>;
}

function Metric({ label, value, unit, note, icon, tone }: { label: string; value: string; unit?: string; note: string; icon: string; tone: string }) {
  return <article className="metric-card"><span className={`metric-icon ${tone}`}>{icon}</span><span className="metric-copy"><small>{label}</small><strong>{value}<em>{unit}</em></strong><span className="metric-note">{note}</span></span></article>;
}

function Overview({ now }: { now: number }) {
  const accesses = useFirmwareStore((state) => state.acessos);
  const currentAngle = useFirmwareStore((state) => state.angulo);
  const ldrEsq = useFirmwareStore((state) => state.ldrEsq);
  const ldrDir = useFirmwareStore((state) => state.ldrDir);
  const cabines = useFirmwareStore((state) => state.cabines);
  const logs = useFirmwareStore((state) => state.logs);
  const connection = useFirmwareStore((state) => state.connection);
  const todayStart = startOfDay(now).getTime();
  const todayAccesses = accesses.filter((access) => access.ts >= todayStart && access.ts <= now);
  const allowedToday = todayAccesses.filter((access) => access.resultado === "liberado").length;
  const deniedToday = todayAccesses.filter((access) => access.resultado === "negado").length;
  const lightIndex = ldrEsq === null || ldrDir === null ? null : ((ldrEsq + ldrDir) / 2 / 4095) * 100;
  const recentEvents = logs.filter((log) => /^(TAG LIDA:|TRAVA DA CABINE )/.test(log.raw)).slice(0, 8);
  const weeklyCounts = Array.from({ length: 7 }, (_, index) => {
    const day = startOfDay(subDays(now, 6 - index)).getTime();
    const next = day + 86_400_000;
    return { day, count: accesses.filter((access) => access.ts >= day && access.ts < next).length };
  });
  const maxDaily = Math.max(...weeklyCounts.map((item) => item.count), 1);
  const released = Object.values(cabines).filter((cabin) => cabin.estado === "liberada").length;
  const angleTilt = currentAngle === null ? 0 : (currentAngle - 90) * 0.12;
  return <>
    <PageHeading eyebrow="MONITORAMENTO" title="Visão geral" description="Dados recebidos do controlador solar via serial." />
    <div className="metric-grid">
      <Metric label="Acessos liberados hoje" value={allowedToday.toLocaleString("pt-BR")} note="Linhas de acesso permitido" icon="✓" tone="green" />
      <Metric label="Acessos negados hoje" value={deniedToday.toLocaleString("pt-BR")} note="Linhas de acesso negado" icon="!" tone="gold" />
      <Metric label="Ângulo do painel" value={currentAngle === null ? "—" : String(currentAngle)} unit={currentAngle === null ? "" : "°"} note="Estimado pelo firmware" icon="⌁" tone="blue" />
      <Metric label="Luminosidade" value={lightIndex === null ? "—" : lightIndex.toFixed(1)} unit={lightIndex === null ? "" : "%"} note="Índice do sensor · média LDR ÷ 4095" icon="☼" tone="teal" />
    </div>
    <div className="content-grid overview-grid">
      <Card><CardHead eyebrow="TOTEM" title="Estado do totem" right={<Badge tone={connection === "conectado" ? "ok" : "critical"}>{connection === "conectado" ? "Conectado" : "Desconectado"}</Badge>} />
        <div className="station-visual firmware-visual">
          <div className="totem-art">
            <div className="solar-grid" style={{ transform: `perspective(120px) rotateX(${angleTilt}deg)` }}>{Array.from({ length: 6 }, (_, index) => <i key={index} />)}</div>
            <div className="totem-column"><div className="totem-display">ϟ</div><div className="connector-grid">{cabins.map((cabin) => <i key={cabin} className={`cabin-lock lock-${cabines[cabin].estado === "liberada" ? "released" : cabines[cabin].estado === "trancada" ? "locked" : "unknown"}`} />)}</div></div>
            <div className="totem-foot" />
          </div>
          <div className="station-summary"><small>Travas liberadas</small><b>{released > 0 ? `${released} de 4` : "—"}</b><div className="summary-stats"><span><strong>{currentAngle === null ? "—" : `${currentAngle}°`}</strong><small>Ângulo estimado</small></span><span><strong>{ldrEsq === null || ldrDir === null ? "—" : `${ldrEsq} / ${ldrDir}`}</strong><small>LDR esquerdo / direito</small></span></div><Link className="text-link" to="/portas">Ver cabines →</Link></div>
        </div>
      </Card>
      <Card><CardHead eyebrow="CABINES" title="Estado das travas" right={<Link className="text-link" to="/portas">Ver todas →</Link>} />
        <div className="port-list">{cabins.map((cabin) => <Link key={cabin} to="/portas" className="port-row">
          <span className={`port-icon cabin-icon ${cabines[cabin].estado === "liberada" ? "em_utilizacao" : cabines[cabin].estado === "sem dados" ? "unknown" : "disponivel"}`}>{cabin}</span>
          <span className="port-row-info"><b>Cabine {cabin}</b><small>{cabines[cabin].estado === "liberada" ? `Liberada (${lastOpenSeconds(logs, cabin) ?? "—"} s) · ${relativeTime(cabines[cabin].ultimaLiberacao, now)}` : cabines[cabin].estado === "trancada" ? `Trancada · última liberação ${relativeTime(cabines[cabin].ultimaLiberacao, now)}` : "—"}</small></span>
          <Badge tone={cabinTone(cabines[cabin].estado)}>{cabinLabel(cabines[cabin].estado)}</Badge>
        </Link>)}</div>
      </Card>
    </div>
    <div className="content-grid bottom-grid">
      <Card><CardHead eyebrow="ACESSOS" title="Acessos dos últimos 7 dias" />
        {accesses.length === 0 ? <EmptyState title="Sem acessos registrados" description="Os acessos aparecerão quando o firmware enviar linhas pelo serial." /> : <div className="bar-chart firmware-bars" aria-label="Acessos por dia">{weeklyCounts.map(({ day, count }) => <div className="bar-column" key={day}><span className="bar-value">{count}</span><div className="bar" style={{ height: `${Math.max(3, count / maxDaily * 120)}px` }} /><small>{format(day, "EEE", { locale: ptBR })}</small></div>)}</div>}
      </Card>
      <Card><CardHead eyebrow="AO VIVO" title="Eventos recentes" />
        {recentEvents.length ? <div className="event-feed">{recentEvents.map((log) => <EventRow key={log.id} log={log} now={now} />)}</div> : <EmptyState title="Aguardando eventos" description="Acessos e mudanças reais das travas serão listados aqui." />}
      </Card>
    </div>
  </>;
}

function lastOpenSeconds(logs: SerialLog[], cabin: CabinNumber): number | null {
  for (const log of logs) {
    const match = log.raw.match(new RegExp(`^TRAVA DA CABINE ${cabin} ABERTA POR (\\d+) SEGUNDOS$`));
    if (match) return Number(match[1]);
  }
  return null;
}

function cabinLabel(state: string) {
  return state === "trancada" ? "Trancada" : state === "liberada" ? "Liberada" : "—";
}

function cabinTone(state: string) {
  return state === "liberada" ? "warning" : state === "trancada" ? "ok" : "info";
}

function EventRow({ log, now }: { log: SerialLog; now: number }) {
  const denied = /ACESSO NEGADO/.test(log.raw);
  const isCabin = /^TRAVA/.test(log.raw);
  return <div className="event-row firmware-event"><i className={`event-dot ${denied ? "critical" : isCabin ? "port" : ""}`} /><span><b>{log.raw}</b><small>{relativeTime(log.timestamp, now)}</small></span></div>;
}

function CabinsPage({ now }: { now: number }) {
  const state = useFirmwareStore();
  const openCabin = async (cabin: CabinNumber) => {
    if (!SUPPORTS_OPEN_COMMAND) return;
    try {
      await sendCabinOpenCommand(cabin);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Não foi possível enviar o comando.");
    }
  };
  return <>
    <PageHeading eyebrow="HARDWARE" title="Cabines" description="Estado e liberações recebidos das travas do firmware." />
    <div className="management-grid cabin-grid">{cabins.map((cabin) => {
      const info = state.cabines[cabin];
      const uid = uidForCabin(cabin);
      return <Card key={cabin} className="manage-card cabin-card">
        <div className="manage-card-head"><div><div className="eyebrow">TRAVA {cabin}</div><h2>Cabine {cabin}</h2></div><Badge tone={cabinTone(info.estado)}>{cabinLabel(info.estado)}</Badge></div>
        <div className={`cabin-lock-visual ${info.estado}`}><span className="lock-symbol">{info.estado === "liberada" ? "↗" : info.estado === "trancada" ? "▣" : "—"}</span><small>{info.estado === "liberada" ? `Liberada (${lastOpenSeconds(state.logs, cabin) ?? "—"} s)` : cabinLabel(info.estado)}</small></div>
        <dl className="data-list"><dt>Última liberação</dt><dd>{info.ultimaLiberacao === null ? "—" : relativeTime(info.ultimaLiberacao, now)}</dd><dt>Total de liberações</dt><dd>{info.totalLiberacoes.toLocaleString("pt-BR")}</dd><dt>Tag associada</dt><dd className="mono">{uid ? maskUid(uid) : "—"}</dd></dl>
        <button className="button-secondary" disabled={!SUPPORTS_OPEN_COMMAND} title={SUPPORTS_OPEN_COMMAND ? undefined : "Requer comando no firmware"} onClick={() => { void openCabin(cabin); }}>Liberar cabine</button>
      </Card>;
    })}</div>
  </>;
}

function maskUid(uid: string): string {
  const parts = uid.split(" ");
  return parts.length === 4 ? `${parts[0]} ${parts[1]} •• ${parts[3]}` : "••";
}

function TrackerPage() {
  const history = useFirmwareStore((state) => state.historicoLdr);
  const ldrEsq = useFirmwareStore((state) => state.ldrEsq);
  const ldrDir = useFirmwareStore((state) => state.ldrDir);
  const difference = useFirmwareStore((state) => state.diferenca);
  const angle = useFirmwareStore((state) => state.angulo);
  const motor = useFirmwareStore((state) => state.motor);
  const [showLeft, setShowLeft] = useState(true);
  const [showRight, setShowRight] = useState(true);
  const sensorValid = (value: number | null) => value !== null && value >= 0 && value <= 4095;
  const values = history.flatMap((point) => [point.ldrEsq, point.ldrDir]);
  const min = values.length ? Math.min(...values) : 0;
  const max = values.length ? Math.max(...values) : 4095;
  const pathFor = (key: "ldrEsq" | "ldrDir") => {
    if (!history.length || max === min) return "";
    return history.map((point, index) => {
      const x = history.length === 1 ? 0 : index * 100 / (history.length - 1);
      const y = 95 - ((point[key] - min) / (max - min)) * 85;
      return `${index === 0 ? "M" : "L"}${x},${y}`;
    }).join(" ");
  };
  const needleRotation = angle === null ? 0 : angle - 90;
  return <>
    <PageHeading eyebrow="SENSORES" title="Seguidor solar" description="Leituras LDR e orientação enviadas pelo firmware." />
    <div className="metric-grid">
      <Metric label="LDR esquerdo" value={sensorValid(ldrEsq) ? String(ldrEsq) : "—"} note="Leitura ADC (0–4095)" icon="◉" tone="blue" />
      <Metric label="LDR direito" value={sensorValid(ldrDir) ? String(ldrDir) : "—"} note="Leitura ADC (0–4095)" icon="◉" tone="teal" />
      <Metric label="Diferença" value={difference === null ? "—" : String(difference)} note={difference === null ? "—" : Math.abs(difference) <= 100 ? "Dentro da tolerância ±100" : "Fora da tolerância ±100"} icon="↔" tone={difference === null || Math.abs(difference) <= 100 ? "green" : "gold"} />
      <Metric label="Direção do motor" value={motor ? motorDirection(motor) : "—"} note="Conforme linha do firmware" icon="↻" tone="gold" />
    </div>
    <div className="content-grid tracker-grid">
      <Card><CardHead eyebrow="LEITURAS AO VIVO" title="LDR esquerdo vs direito" right={<div className="legend-controls">
        <button className={`legend-control ${showLeft ? "legend-on" : ""}`} onClick={() => setShowLeft((show) => !show)}><i className="legend left" />Esquerdo</button>
        <button className={`legend-control ${showRight ? "legend-on" : ""}`} onClick={() => setShowRight((show) => !show)}><i className="legend right" />Direito</button>
      </div>} />
        {history.length ? <div className="line-chart firmware-line"><svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="Histórico de leituras LDR">
          <path className="grid-lines" d="M0 10H100 M0 50H100 M0 90H100" />
          {showLeft && <path className="line-generated" d={pathFor("ldrEsq")} />}
          {showRight && <path className="line-consumed" d={pathFor("ldrDir")} />}
        </svg><div className="axis-labels"><span>{format(history[0].ts, "HH:mm")}</span><span>{format(history[history.length - 1].ts, "HH:mm")}</span></div></div> : <EmptyState title="Sem leituras LDR" description="O gráfico será preenchido ao receber linhas do sensor." />}
      </Card>
      <Card><CardHead eyebrow="POSIÇÃO" title="Ângulo estimado" />
        <div className="angle-gauge"><svg viewBox="0 0 200 120" role="img" aria-label={`Ângulo ${angle === null ? "sem dados" : `${angle} graus`}`}>
          <path className="gauge-track" d="M20 100 A80 80 0 0 1 180 100" />
          <path className="gauge-fill" d="M20 100 A80 80 0 0 1 180 100" />
          <g transform={`rotate(${needleRotation} 100 100)`}><path className="gauge-needle" d="M100 100 L100 30" /><circle cx="100" cy="100" r="6" /></g>
          <text x="12" y="116">0° · Leste</text><text x="151" y="116">180° · Oeste</text>
        </svg><strong>{angle === null ? "—" : `${angle}°`}</strong></div>
        <div className="diagnostic-row"><span><i className={motor ? "" : "pending"} />Direção do motor</span><b>{motor ? motorDirection(motor) : "—"}</b></div>
      </Card>
    </div>
    <p className="disclaimer tracker-disclaimer">Ângulo estimado por passos, assume 90° ao ligar.</p>
    <Card><CardHead eyebrow="SENSOR" title="Última leitura" />
      <div className="device-info"><DataPair label="LDR esquerdo" value={sensorValid(ldrEsq) ? ldrEsq : "—"} /><DataPair label="LDR direito" value={sensorValid(ldrDir) ? ldrDir : "—"} /><DataPair label="Diferença" value={difference ?? "—"} /><DataPair label="Ângulo" value={angle === null ? "—" : `${angle}°`} /></div>
    </Card>
  </>;
}

function motorDirection(motor: string) {
  return motor === "ESQUERDA/LESTE" ? "Leste" : motor === "DIREITA/OESTE" ? "Oeste" : "Parado";
}

function AccessesPage({ now }: { now: number }) {
  const accesses = useFirmwareStore((state) => state.acessos);
  const [period, setPeriod] = useState<"7" | "30" | "90" | "custom">("7");
  const [customStart, setCustomStart] = useState(format(subDays(now, 6), "yyyy-MM-dd"));
  const [customEnd, setCustomEnd] = useState(format(now, "yyyy-MM-dd"));
  const [selectedCabin, setSelectedCabin] = useState<CabinNumber | null>(null);
  const start = period === "custom" ? dateInputStart(customStart) : startOfDay(subDays(now, Number(period) - 1)).getTime();
  const end = period === "custom" ? dateInputEnd(customEnd) : now;
  const inPeriod = accesses.filter((access) => access.ts >= start && access.ts <= end);
  const visible = selectedCabin ? inPeriod.filter((access) => access.cabine === selectedCabin) : inPeriod;
  const allowed = visible.filter((access) => access.resultado === "liberado").length;
  const denied = visible.filter((access) => access.resultado === "negado").length;
  const rate = allowed + denied ? denied / (allowed + denied) * 100 : null;
  const cabinCounts = cabins.map((cabin) => visible.filter((access) => access.cabine === cabin && access.resultado === "liberado").length);
  const busiestIndex = cabinCounts.indexOf(Math.max(...cabinCounts));
  const busiest = cabinCounts.length && Math.max(...cabinCounts) > 0 ? `Cabine ${busiestIndex + 1}` : "—";
  const distribution = getAccessDistribution(inPeriod);
  const dailyCounts = dailyAccessCounts(visible, start, end);
  const maxDaily = Math.max(...dailyCounts.map((entry) => entry.count), 1);
  const distributionTotal = distribution.reduce((sum, value) => sum + value, 0);
  let cumulative = 0;
  const gradient = distributionTotal ? distribution.map((value, index) => {
    const from = cumulative;
    cumulative += value;
    return `${cabinColors[index]} ${from}% ${cumulative}%`;
  }).join(", ") : "#e4eae8 0% 100%";
  const exportCsv = () => {
    const rows = [["Data/hora", "UID", "Resultado", "Cabine"], ...visible.map((access) => [
      timestampLabel(access.ts), maskUid(access.uid), access.resultado === "liberado" ? "Liberado" : "Negado",
      access.cabine ? `Cabine ${access.cabine}` : "—"
    ])];
    const content = `\uFEFF${rows.map((row) => row.map(csvCell).join(";")).join("\r\n")}`;
    const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "acessos.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  };
  return <>
    <PageHeading eyebrow="RELATÓRIOS" title="Acessos" description="Registros reais recebidos pelo leitor RFID." right={<button className="button-secondary" onClick={exportCsv}>↓ Exportar CSV</button>} />
    <div className="filter-tabs period-tabs" aria-label="Período do relatório">
      {(["7", "30", "90", "custom"] as const).map((value) => <button key={value} className={period === value ? "active" : ""} onClick={() => setPeriod(value)}>{value === "custom" ? "Personalizado" : `${value} dias`}</button>)}
      {period === "custom" && <div className="custom-date-range"><label>De <input aria-label="Data inicial" type="date" value={customStart} onChange={(event) => setCustomStart(event.target.value)} /></label><label>Até <input aria-label="Data final" type="date" value={customEnd} onChange={(event) => setCustomEnd(event.target.value)} /></label></div>}
    </div>
    <div className="metric-grid">
      <Metric label="Acessos liberados" value={allowed.toLocaleString("pt-BR")} note="No período selecionado" icon="✓" tone="green" />
      <Metric label="Acessos negados" value={denied.toLocaleString("pt-BR")} note="No período selecionado" icon="!" tone="gold" />
      <Metric label="Taxa de negação" value={rate === null ? "—" : rate.toFixed(1)} unit={rate === null ? "" : "%"} note="Negados ÷ total de acessos" icon="%" tone="blue" />
      <Metric label="Cabine mais usada" value={busiest} note="Entre os acessos liberados" icon="▦" tone="teal" />
    </div>
    <div className="content-grid executive-grid">
      <Card><CardHead eyebrow="VOLUME" title="Acessos por dia" right={selectedCabin && <button className="button-quiet" onClick={() => setSelectedCabin(null)}>Limpar filtro</button>} />
        {dailyCounts.length ? <div className="bar-chart access-bars">{dailyCounts.map((entry) => <div className="bar-column" key={entry.day}><span className="bar-value">{entry.count}</span><div className="bar" style={{ height: `${Math.max(3, entry.count / maxDaily * 120)}px` }} /><small>{format(entry.day, "dd/MM", { locale: ptBR })}</small></div>)}</div> : <EmptyState title="Sem registros no período" description="As colunas serão geradas a partir dos acessos recebidos." />}
      </Card>
      <Card><CardHead eyebrow="DISTRIBUIÇÃO" title="Por cabine" />
        <div className="donut-layout">
          <button className="donut-chart access-donut" style={{ background: `conic-gradient(${gradient})` }} onClick={() => setSelectedCabin(null)} aria-label="Limpar filtro de cabine">
            <span>{inPeriod.filter((access) => access.resultado === "liberado").length}<small>liberações</small></span>
          </button>
          <div className="donut-legend">{cabins.map((cabin, index) => <button key={cabin} className={selectedCabin === cabin ? "selected-filter" : ""} onClick={() => setSelectedCabin(selectedCabin === cabin ? null : cabin)}><i className="donut-color" style={{ background: cabinColors[index] }} />Cabine {cabin}<b>{distribution[index]}%</b></button>)}</div>
        </div>
        {distributionTotal === 0 && <p className="data-note">Sem acessos liberados no período.</p>}
      </Card>
    </div>
    <Card className="table-card"><CardHead eyebrow="DADOS DE ORIGEM" title="Acessos registrados" right={<span className="muted">{visible.length} linha(s)</span>} />
      {visible.length ? <div className="table-scroll"><table className="access-table"><thead><tr><th>Data/hora</th><th>UID</th><th>Resultado</th><th>Cabine</th></tr></thead><tbody>{visible.map((access) => <tr key={access.id}><td>{timestampLabel(access.ts)}</td><td className="mono">{maskUid(access.uid)}</td><td><Badge tone={access.resultado === "liberado" ? "ok" : "critical"}>{access.resultado === "liberado" ? "Liberado" : "Negado"}</Badge></td><td>{access.cabine ? `Cabine ${access.cabine}` : "—"}</td></tr>)}</tbody></table></div> : <EmptyState title="Sem acessos para exibir" description="Nenhuma linha de acesso corresponde ao período e filtro escolhidos." />}
    </Card>
  </>;
}

function dateInputStart(value: string) {
  if (!value) return Number.NaN;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? Number.NaN : date.getTime();
}

function dateInputEnd(value: string) {
  if (!value) return Number.NaN;
  const date = new Date(`${value}T23:59:59.999`);
  return Number.isNaN(date.getTime()) ? Number.NaN : date.getTime();
}

function dailyAccessCounts(accesses: AccessRecord[], start: number, end: number) {
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return [];
  const first = startOfDay(start).getTime();
  const last = startOfDay(end).getTime();
  const dayCount = Math.floor((last - first) / 86_400_000) + 1;
  return Array.from({ length: dayCount }, (_, index) => {
    const day = first + index * 86_400_000;
    return { day, count: accesses.filter((access) => access.ts >= day && access.ts < day + 86_400_000).length };
  });
}

function csvCell(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}

function TechnicalPage({ now }: { now: number }) {
  const connection = useFirmwareStore((state) => state.connection);
  const info = useFirmwareStore((state) => state.connectionInfo);
  const lastDataAt = useFirmwareStore((state) => state.lastDataAt);
  const linesReceived = useFirmwareStore((state) => state.linesReceived);
  const lineTimestamps = useFirmwareStore((state) => state.lineTimestamps);
  const rfid = useFirmwareStore((state) => state.rfid);
  const cabinsData = useFirmwareStore((state) => state.cabines);
  const ldrEsq = useFirmwareStore((state) => state.ldrEsq);
  const ldrDir = useFirmwareStore((state) => state.ldrDir);
  const historicoLdr = useFirmwareStore((state) => state.historicoLdr);
  const logs = useFirmwareStore((state) => state.logs);
  const [showLdr, setShowLdr] = useState(false);
  const [level, setLevel] = useState("TODOS");
  const [search, setSearch] = useState("");
  const [paused, setPaused] = useState(false);
  const [frozenLogs, setFrozenLogs] = useState<SerialLog[]>([]);
  useEffect(() => { if (!paused) setFrozenLogs(logs); }, [logs, paused]);
  const communicationOk = connection === "conectado" && lastDataAt !== null && now - lastDataAt <= 3000;
  const rfidLabel = rfid.estado === "operacional" ? "Operacional" : rfid.estado === "em_recuperacao" ? "Em recuperação" : rfid.estado === "sem_resposta" ? "Sem resposta" : "Sem dados";
  const ldrInRange = ldrEsq !== null && ldrDir !== null && ldrEsq >= 0 && ldrEsq <= 4095 && ldrDir >= 0 && ldrDir <= 4095;
  const releasedCabins = cabins.filter((cabin) => cabinsData[cabin].estado === "liberada");
  const allCabinsLocked = cabins.every((cabin) => cabinsData[cabin].estado === "trancada");
  const hasUnknownCabin = cabins.some((cabin) => cabinsData[cabin].estado === "sem dados");
  const recentLdr = historicoLdr.filter((point) => point.ts >= now - 30_000);
  const firstLdr = recentLdr[0];
  const ldrVarying = firstLdr !== undefined && recentLdr.some((point) => point.ldrEsq !== firstLdr.ldrEsq || point.ldrDir !== firstLdr.ldrDir);
  const recentRate = lineTimestamps.filter((timestamp) => timestamp >= now - 5000).length / 5;
  const visibleLogs = (paused ? frozenLogs : logs).filter((log) => {
    if (!showLdr && parseLine(log.raw, log.timestamp).type === "ldr") return false;
    if (level !== "TODOS" && log.level !== level) return false;
    return log.raw.toLowerCase().includes(search.toLowerCase());
  });
  const downloadLogs = () => {
    const content = (paused ? frozenLogs : logs).map((log) => `${timestampLabel(log.timestamp)} [${log.level}] ${log.raw}`).join("\r\n");
    const url = URL.createObjectURL(new Blob([content], { type: "text/plain;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "logs-serial.txt";
    anchor.click();
    URL.revokeObjectURL(url);
  };
  const togglePause = () => {
    if (!paused) setFrozenLogs(logs);
    setPaused((value) => !value);
  };
  return <>
    <PageHeading eyebrow="DIAGNÓSTICO" title="Central técnica" description="Informações derivadas das linhas recebidas pela porta serial." />
    <div className="content-grid tech-grid">
      <Card><CardHead eyebrow="DISPOSITIVO" title="ESP32 via USB" right={<Badge tone={connection === "conectado" ? "ok" : "critical"}>{connection === "conectado" ? "Conectado" : "Desconectado"}</Badge>} />
        <div className="device-info">
          <DataPair label="Interface" value="USB serial" /><DataPair label="Baud rate" value="115200" />
          <DataPair label="Vendor ID" value={formatUsbId(info.vendorId)} /><DataPair label="Product ID" value={formatUsbId(info.productId)} />
          <DataPair label="Firmware" value="não informado pelo dispositivo" /><DataPair label="Último dado" value={relativeTime(lastDataAt, now)} />
          <DataPair label="Linhas recebidas" value={linesReceived.toLocaleString("pt-BR")} /><DataPair label="Taxa de linhas" value={connection === "conectado" ? `${recentRate.toFixed(1)} linhas/s` : "—"} />
        </div>
      </Card>
      <Card><CardHead eyebrow="ESTADO" title="Diagnósticos" />
        <Diagnostic label="Comunicação serial" value={communicationOk ? "Dado recebido há menos de 3 s" : connection === "conectado" ? "Sem dados recentes" : "Desconectada"} ok={communicationOk} pending={connection !== "conectado"} />
        <Diagnostic label="Leitor RFID" value={rfidLabel} ok={rfid.estado === "operacional"} warning={rfid.estado === "em_recuperacao"} pending={rfid.estado === "sem_dados"} />
        <Diagnostic label="Travas" value={releasedCabins.length ? `Liberadas: cabine(s) ${releasedCabins.join(", ")}` : allCabinsLocked ? "Todas trancadas" : "Sem dados"} ok={allCabinsLocked} pending={!releasedCabins.length && hasUnknownCabin} />
        <Diagnostic label="Sensores LDR" value={ldrInRange ? ldrVarying ? "Dentro da faixa e variando" : "Na faixa; variação ainda não observada" : "Sem dados ou fora de 0–4095"} ok={ldrInRange && ldrVarying} warning={ldrInRange && !ldrVarying} pending={!ldrInRange} />
      </Card>
    </div>
    <Card className="logs-card"><CardHead eyebrow="SERIAL MONITOR" title={`Logs · ${visibleLogs.length}`} right={<div className="log-actions"><button className="button-secondary" onClick={togglePause}>{paused ? "Retomar" : "Pausar"}</button><button className="button-secondary" onClick={downloadLogs}>↓ Baixar .txt</button></div>} />
      <div className="log-toolbar firmware-log-toolbar">
        <input aria-label="Buscar nos logs" placeholder="Buscar linha..." value={search} onChange={(event) => setSearch(event.target.value)} />
        <select aria-label="Filtrar nível de log" value={level} onChange={(event) => setLevel(event.target.value)}><option>TODOS</option><option>INFO</option><option>WARN</option><option>ERROR</option></select>
        <label className="ldr-toggle"><input type="checkbox" checked={showLdr} onChange={(event) => setShowLdr(event.target.checked)} /> Mostrar leituras LDR</label>
      </div>
      {visibleLogs.length ? <div className="logs-scroll firmware-logs"><table><thead><tr><th>Horário</th><th>Nível</th><th>Linha serial</th></tr></thead><tbody>{visibleLogs.map((log) => <tr key={log.id}><td className="mono">{format(log.timestamp, "HH:mm:ss")}</td><td><span className={`log-level ${log.level.toLowerCase()}`}>{log.level}</span></td><td className="mono raw-line">{log.raw}</td></tr>)}</tbody></table></div> : <EmptyState title="Nenhuma linha corresponde ao filtro" description="Aguardando ou altere os filtros dos logs." />}
    </Card>
  </>;
}

function formatUsbId(value: number | null) {
  return value === null ? "—" : `0x${value.toString(16).padStart(4, "0").toUpperCase()}`;
}

function DataPair({ label, value }: { label: string; value: ReactNode }) {
  return <div className="data-pair"><span>{label}</span><b>{value}</b></div>;
}

function Diagnostic({ label, value, ok, warning = false, pending = false }: { label: string; value: string; ok: boolean; warning?: boolean; pending?: boolean }) {
  const tone = ok ? "" : warning ? "warning" : pending ? "pending" : "critical";
  return <div className="diagnostic-row"><span><i className={tone} />{label}</span><b className={ok ? "" : warning ? "text-warning" : pending ? "text-pending" : "text-critical"}>{value}</b></div>;
}

function AlertsPage() {
  const alerts = useFirmwareStore((state) => state.alertas);
  const acknowledge = useFirmwareStore((state) => state.acknowledgeAlert);
  const resolve = useFirmwareStore((state) => state.resolveAlert);
  const [filter, setFilter] = useState<"todos" | "aberto" | "resolvido">("todos");
  const [consulting, setConsulting] = useState<FirmwareAlert | null>(null);
  const [resolving, setResolving] = useState<FirmwareAlert | null>(null);
  const [note, setNote] = useState("");
  const visible = alerts.filter((alert) => filter === "todos" || (filter === "aberto" ? alert.status !== "resolvido" : alert.status === "resolvido"));
  const submitResolution = () => {
    if (!resolving || !note.trim()) return;
    resolve(resolving.id, note.trim());
    setResolving(null);
    setNote("");
  };
  return <>
    <PageHeading eyebrow="EVENTOS" title="Alertas" description="Avisos criados a partir de linhas e eventos reais do dispositivo." />
    <div className="filter-tabs">{(["todos", "aberto", "resolvido"] as const).map((value) => <button key={value} className={filter === value ? "active" : ""} onClick={() => setFilter(value)}>{value === "todos" ? "Todos" : value === "aberto" ? "Abertos" : "Resolvidos"}<span>{value === "todos" ? alerts.length : value === "aberto" ? alerts.filter((alert) => alert.status !== "resolvido").length : alerts.filter((alert) => alert.status === "resolvido").length}</span></button>)}</div>
    {visible.length ? <div className="alert-list">{visible.map((alert) => <article key={alert.id} className={`alert-card ${alert.status}`}><div className={`alert-symbol ${alert.severity}`}>{alert.severity === "critico" ? "!" : alert.severity === "atencao" ? "△" : "i"}</div><div className="alert-copy"><b>{alert.title}</b><small>{timestampLabel(alert.openedAt)} · {severityLabel(alert.severity)} · {statusLabel(alert.status)}</small>{alert.note && <small>Nota: {alert.note}</small>}</div><div className="alert-actions">
      {alert.status === "aberto" && <button className="button-secondary" onClick={() => acknowledge(alert.id)}>Reconhecer</button>}
      {alert.status !== "resolvido" && <button className="button-secondary" onClick={() => { setResolving(alert); setNote(""); }}>Resolver</button>}
      <button className="button-primary" onClick={() => setConsulting(alert)}>Consultar</button>
    </div></article>)}</div> : <EmptyState title="Nenhum alerta" description="Alertas aparecerão somente quando houver eventos do dispositivo." />}
    {consulting && <Modal title={consulting.title} onClose={() => setConsulting(null)}><div className="alert-consult"><DataPair label="Origem" value={sourceLabel(consulting.origin)} /><DataPair label="Estado" value={statusLabel(consulting.status)} /><DataPair label="Data" value={timestampLabel(consulting.openedAt)} />{consulting.note && <DataPair label="Nota" value={consulting.note} />}
      <p>As linhas correspondentes estão disponíveis na Central técnica.</p><Link className="button-secondary" to={consulting.origin === "acesso" ? "/portas" : "/tecnico"} onClick={() => setConsulting(null)}>{consulting.origin === "acesso" ? "Abrir Cabines" : "Abrir Central técnica"} →</Link>
    </div></Modal>}
    {resolving && <Modal title="Resolver alerta" onClose={() => setResolving(null)}><label className="field-label">Nota de resolução<textarea aria-label="Nota de resolução" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Descreva a resolução..." /></label><div className="modal-footer"><button className="button-secondary" onClick={() => setResolving(null)}>Cancelar</button><button className="button-primary" disabled={!note.trim()} onClick={submitResolution}>Resolver</button></div></Modal>}
  </>;
}

function sourceLabel(origin: FirmwareAlert["origin"]) {
  return origin === "acesso" ? "Acesso RFID" : origin === "rfid" ? "Leitor RFID" : origin === "erro" ? "Erro do dispositivo" : "Conexão serial";
}

function severityLabel(severity: FirmwareAlert["severity"]) {
  return severity === "critico" ? "Crítico" : severity === "atencao" ? "Atenção" : "Informação";
}

function statusLabel(status: FirmwareAlert["status"]) {
  return status === "aberto" ? "Aberto" : status === "reconhecido" ? "Reconhecido" : "Resolvido";
}

function NotificationPopover({ onClose, now }: { onClose: () => void; now: number }) {
  const alerts = useFirmwareStore((state) => state.alertas).slice(0, 5);
  return <><button className="click-away" aria-label="Fechar notificações" onClick={onClose} /><div className="notification-popover firmware-notifications"><div className="card-head"><h2>Alertas recentes</h2><Link className="text-link" to="/alertas" onClick={onClose}>Ver todos →</Link></div>
    {alerts.length ? alerts.map((alert) => <Link className="notification-row" to="/alertas" key={alert.id} onClick={onClose}><i className={`event-dot ${alert.severity}`} /><span><b>{alert.title}</b><small>{relativeTime(alert.openedAt, now)} · {statusLabel(alert.status)}</small></span></Link>) : <EmptyState title="Sem alertas" description="Nenhum evento registrado." />}
  </div></>;
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return <div className="empty-state"><span>⌁</span><b>{title}</b><p>{description}</p></div>;
}

function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  return <div className="modal-layer" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="modal" role="dialog" aria-modal="true" aria-label={title}><div className="modal-head"><h2>{title}</h2><button className="icon-button" aria-label="Fechar" onClick={onClose}>×</button></div><div className="modal-body">{children}</div></section></div>;
}

export default App;
