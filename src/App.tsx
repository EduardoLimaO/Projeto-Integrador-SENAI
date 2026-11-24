import { useEffect, useMemo, useState } from "react";
import { Link, NavLink, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { format, formatDistanceToNow, isToday, startOfDay, subDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useShallow } from "zustand/react/shallow";
import type { ReactNode } from "react";
import { calculateAvailability, getPortDistribution, useSolarStore } from "./store";
import type { Alert, Port, Session } from "./types";
const relative = (timestamp: number) => formatDistanceToNow(timestamp, { addSuffix: true, locale: ptBR });
const dateLabel = (timestamp: number) => format(timestamp, "dd MMM", { locale: ptBR }).replace(".", "");
const duration = (started: number, ended = Date.now()) => {
  const minutes = Math.max(0, Math.floor((ended - started) / 60000));
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`;
};
const statusNames: Record<Port["status"], string> = { disponivel: "Disponível", em_utilizacao: "Em utilização", manutencao: "Manutenção", bloqueada: "Bloqueada" };

function App() {
  const tick = useSolarStore((s) => s.tick);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [drawer, setDrawer] = useState<Port | null>(null);
  const [sessionOpen, setSessionOpen] = useState(false);
  const [initialPortId, setInitialPortId] = useState("");
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [simulatorOpen, setSimulatorOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [resetConfirm, setResetConfirm] = useState(false);
  const [loggedIn, setLoggedIn] = useState(true);
  const [dark, setDark] = useState(false);
  const location = useLocation();

  useEffect(() => {
    const timer = window.setInterval(tick, 3000);
    return () => window.clearInterval(timer);
  }, [tick]);
  useEffect(() => { setSidebarOpen(false); }, [location.pathname]);

  if (!loggedIn) return <Login onLogin={() => setLoggedIn(true)} />;
  return (
    <div className={dark ? "app dark" : "app"}>
      <div className="demo-strip">MODO DEMONSTRAÇÃO — DADOS SIMULADOS</div>
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} onUserMenu={() => setUserMenuOpen((value) => !value)} />
      {userMenuOpen && <UserMenu onClose={() => setUserMenuOpen(false)} onProfile={() => { setProfileOpen(true); setUserMenuOpen(false); }} onTheme={() => setDark((value) => !value)} onSimulator={() => { setSimulatorOpen(true); setUserMenuOpen(false); }} onReset={() => { setResetConfirm(true); setUserMenuOpen(false); }} onLogout={() => { setLoggedIn(false); setUserMenuOpen(false); }} />}
      <main className="main-area">
        <Header onMenu={() => setSidebarOpen((value) => !value)} onStart={() => setSessionOpen(true)} onNotifications={() => setNotificationOpen((value) => !value)} notificationOpen={notificationOpen} />
        {notificationOpen && <NotificationPopover onClose={() => setNotificationOpen(false)} />}
        <div className="page-content">
          <Routes>
            <Route path="/" element={<Overview onPort={setDrawer} onStart={() => setSessionOpen(true)} />} />
            <Route path="/portas" element={<PortsPage onPort={setDrawer} />} />
            <Route path="/energia" element={<EnergyPage />} />
            <Route path="/executivo" element={<ExecutivePage />} />
            <Route path="/tecnico" element={<TechnicalPage />} />
            <Route path="/alertas" element={<AlertsPage />} />
            <Route path="*" element={<Overview onPort={setDrawer} onStart={() => setSessionOpen(true)} />} />
          </Routes>
        </div>
      </main>
      {sessionOpen && <SessionWizard initialPortId={initialPortId} onClose={() => { setSessionOpen(false); setInitialPortId(""); }} />}
      {drawer && <PortDrawer port={drawer} onClose={() => setDrawer(null)} onStart={(portId) => { setDrawer(null); setInitialPortId(portId); setSessionOpen(true); }} />}
      {simulatorOpen && <SimulatorModal onClose={() => setSimulatorOpen(false)} />}
      {profileOpen && <ProfileModal onClose={() => setProfileOpen(false)} />}
      {resetConfirm && <Modal title="Resetar demonstração" onClose={() => setResetConfirm(false)}><p className="modal-intro">Isso restaura os dados simulados iniciais e apaga as alterações salvas neste navegador.</p><div className="modal-footer"><button className="button-secondary" onClick={() => setResetConfirm(false)}>Cancelar</button><button className="button-primary" onClick={() => { useSolarStore.getState().reset(); setResetConfirm(false); }}>Resetar dados</button></div></Modal>}
    </div>
  );
}

function Sidebar({ open, onClose, onUserMenu }: { open: boolean; onClose: () => void; onUserMenu: () => void }) {
  const alerts = useSolarStore((s) => s.alerts);
  const stations = useSolarStore((s) => s.stations);
  const selected = useSolarStore((s) => s.selectedStationId);
  const lastTick = useSolarStore((s) => s.lastTickAt);
  const online = stations.find((station) => station.id === selected)?.online ?? false;
  const nav = [["/", "⌂", "Visão geral"], ["/portas", "▦", "Portas de carga"], ["/energia", "ϟ", "Energia"], ["/executivo", "◫", "Painel executivo"], ["/tecnico", "⌁", "Central técnica"], ["/alertas", "◌", "Alertas"]];
  const openCount = alerts.filter((alert) => alert.stationId === selected && alert.status === "aberto").length;
  return <>
    {open && <button className="mobile-backdrop" onClick={onClose} aria-label="Fechar menu" />}
    <aside className={`sidebar ${open ? "sidebar-open" : ""}`}>
      <Link to="/" className="brand"><span className="brand-symbol">☼</span><span><b>Solar Totem</b><small>SENAI</small></span></Link>
      <nav className="nav-groups" aria-label="Navegação principal">
        <div className="nav-caption">OPERAÇÕES</div>
        {nav.slice(0, 3).map(([to, icon, label]) => <NavLink key={to} to={to} end={to === "/"} className={({ isActive }) => `nav-link ${isActive ? "selected" : ""}`}><span className="nav-icon">{icon}</span>{label}</NavLink>)}
        <div className="nav-caption">GESTÃO</div>
        {nav.slice(3).map(([to, icon, label]) => <NavLink key={to} to={to} className={({ isActive }) => `nav-link ${isActive ? "selected" : ""}`}><span className="nav-icon">{icon}</span>{label}{to === "/alertas" && openCount > 0 && <span className="nav-count">{openCount}</span>}</NavLink>)}
      </nav>
      <div className="sidebar-bottom">
        <div className="system-state"><i className={online ? "online" : "offline"} /><span><b>{online ? "Sistema operacional" : "Sistema offline"}</b><small>Atualizado {relative(lastTick)}</small></span></div>
        <button className="user-card" onClick={onUserMenu}><span className="avatar">ES</span><span><b>Eduardo Silva</b><small>Administrador</small></span><span className="more">•••</span></button>
      </div>
    </aside>
  </>;
}

function Header({ onMenu, onStart, onNotifications, notificationOpen }: { onMenu: () => void; onStart: () => void; onNotifications: () => void; notificationOpen: boolean }) {
  const stations = useSolarStore((s) => s.stations);
  const selected = useSolarStore((s) => s.selectedStationId);
  const selectStation = useSolarStore((s) => s.selectStation);
  const alerts = useSolarStore((s) => s.alerts);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const station = stations.find((item) => item.id === selected)!;
  const unseen = alerts.some((alert) => alert.stationId === selected && alert.status === "aberto");
  return <header className="topbar">
    <button className="mobile-menu" onClick={onMenu} aria-label="Abrir menu">☰</button>
    <div className="station-picker-wrap">
      <button className="station-picker" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
        <i className={`state-dot ${station.online ? "online" : "offline"}`} /><span><small>Estação selecionada</small><b>{station.id} · {station.name}</b></span><span className="chevron">⌄</span>
      </button>
      {open && <div className="station-popover"><input autoFocus aria-label="Buscar estação" placeholder="Buscar estação..." value={query} onChange={(event) => setQuery(event.target.value)} />
        {stations.filter((item) => `${item.id} ${item.name}`.toLowerCase().includes(query.toLowerCase())).map((item) => <button key={item.id} className="station-option" onClick={() => { selectStation(item.id); setOpen(false); setQuery(""); }}><i className={`state-dot ${item.online ? "online" : "offline"}`} /><span><b>{item.id} · {item.name}</b><small>{item.location}</small></span>{item.id === selected && <span>✓</span>}</button>)}
        {stations.filter((item) => `${item.id} ${item.name}`.toLowerCase().includes(query.toLowerCase())).length === 0 && <p className="empty-note">Nenhuma estação encontrada.</p>}
      </div>}
    </div>
    <div className="top-actions">
      <button className={`icon-button ${notificationOpen ? "pressed" : ""}`} aria-label="Notificações" onClick={onNotifications}>♢{unseen && <i className="notification-dot" />}</button>
      <button className="button-primary" onClick={onStart} disabled={!station.online} title={!station.online ? "Não é possível iniciar: estação sem comunicação." : undefined} aria-label={!station.online ? "Estação offline; carregamento indisponível" : "Iniciar carregamento"}>＋ <span>Iniciar carregamento</span></button>
    </div>
  </header>;
}

function UserMenu({ onClose, onProfile, onTheme, onSimulator, onReset, onLogout }: { onClose: () => void; onProfile: () => void; onTheme: () => void; onSimulator: () => void; onReset: () => void; onLogout: () => void }) {
  return <><button className="click-away" aria-label="Fechar menu de perfil" onClick={onClose} /><div className="user-menu"><button onClick={onProfile}>Perfil de Eduardo</button><button onClick={onTheme}>Alternar tema claro/escuro</button><button onClick={onSimulator}>Simulador de falhas</button><button onClick={onReset}>Resetar demonstração</button><button onClick={onLogout}>Sair</button></div></>;
}

function PageHeading({ eyebrow, title, description, right }: { eyebrow: string; title: string; description: string; right?: ReactNode }) {
  return <div className="page-heading"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{description}</p></div>{right}</div>;
}

function Card({ children, className = "" }: { children: ReactNode; className?: string }) { return <section className={`card ${className}`}>{children}</section>; }
function CardHead({ eyebrow, title, right }: { eyebrow?: string; title: string; right?: React.ReactNode }) {
  return <div className="card-head"><div>{eyebrow && <div className="eyebrow">{eyebrow}</div>}<h2>{title}</h2></div>{right}</div>;
}
function Badge({ children, tone = "ok" }: { children: React.ReactNode; tone?: string }) { return <span className={`badge ${tone}`}><i />{children}</span>; }

function Overview({ onPort, onStart }: { onPort: (port: Port) => void; onStart: () => void }) {
  const sessions = useSolarStore((s) => s.sessions);
  const selected = useSolarStore((s) => s.selectedStationId);
  const stations = useSolarStore((s) => s.stations);
  const ports = useSolarStore(useShallow((s) => s.ports.filter((port) => port.stationId === selected)));
  const readings = useSolarStore((s) => s.readings);
  const events = useSolarStore(useShallow((s) => s.events.filter((event) => event.stationId === selected)));
  const outages = useSolarStore((s) => s.outages);
  const station = stations.find((item) => item.id === selected)!;
  const navigate = useNavigate();
  const [period, setPeriod] = useState("esta");
  const [day, setDay] = useState(format(new Date(), "yyyy-MM-dd"));
  const candidateDate = new Date(`${day}T00:00:00`);
  const date = Number.isNaN(candidateDate.getTime()) ? new Date() : candidateDate;
  const dayStart = startOfDay(date).getTime();
  const dayEnd = dayStart + 86400000;
  const daySessions = sessions.filter((session) => session.stationId === selected && session.startedAt >= dayStart && session.startedAt < dayEnd);
  const dayEvents = events.filter((event) => event.timestamp >= dayStart && event.timestamp < dayEnd);
  const stationReadings = readings.filter((reading) => reading.stationId === selected);
  const generated = stationReadings.filter((reading) => reading.timestamp >= dayStart && reading.timestamp < dayEnd).reduce((sum, item) => sum + item.generatedKwh, 0);
  const completed = sessions.filter((session) => session.stationId === selected && session.status === "concluida" && session.endedAt);
  const avgMinutes = completed.length ? Math.round(completed.reduce((sum, item) => sum + (item.endedAt! - item.startedAt) / 60000, 0) / completed.length) : 0;
  const availability = calculateAvailability(outages, subDays(Date.now(), 30).getTime(), Date.now(), selected);
  const data = useMemo(() => makeDailyCounts(sessions, selected, period === "passada" ? subDays(Date.now(), 7).getTime() : Date.now(), period === "14" ? 14 : 7), [sessions, selected, period]);
  const freePorts = ports.filter((port) => port.status === "disponivel").length;
  return <>
    <PageHeading eyebrow="PAINEL OPERACIONAL" title="Visão geral" description="Monitoramento da estação Solar Totem em tempo real." right={<label className="date-chip">Dia <input aria-label="Selecionar dia do painel" type="date" value={day} onChange={(event) => setDay(event.target.value)} /></label>} />
    <div className="metric-grid">
      <Metric label="Energia gerada" value={generated.toFixed(1)} unit="kWh" note={`${stationReadings.length} leituras simuladas`} icon="ϟ" tone="blue" onClick={() => navigate("/energia")} />
      <Metric label="Sessões realizadas" value={daySessions.length.toLocaleString("pt-BR")} note="No dia selecionado" icon="▣" tone="gold" onClick={() => navigate("/executivo")} />
      <Metric label="Disponibilidade" value={availability.toFixed(1)} unit="%" note={availability >= 98 ? "Operação normal" : availability >= 95 ? "Atenção" : "Crítico"} icon="✓" tone="green" onClick={() => navigate("/executivo")} />
      <Metric label="Tempo médio" value={String(avgMinutes)} unit="min" note="Sessões concluídas" icon="◷" tone="teal" onClick={() => navigate("/executivo")} />
    </div>
    <div className="content-grid overview-grid">
      <Card><CardHead eyebrow="ESTAÇÃO" title={`${station.id} · ${station.name}`} right={<Badge tone={station.online ? "ok" : "critical"}>{station.online ? "Online" : "Offline"}</Badge>} />
        <div className="station-visual"><div className={`totem-art ${station.online ? "" : "totem-offline"}`}><div className="solar-grid">{Array.from({ length: 6 }, (_, index) => <i key={index} />)}</div><div className="totem-column"><div className="totem-display">ϟ</div><div className="connector-grid">{ports.map((port) => <i key={port.id} className={port.status} />)}</div></div><div className="totem-foot" /></div>
          <div className="station-summary"><small>Status da estação</small><b>{station.online ? "Operacional" : "Sem comunicação"}</b><div className="summary-stats"><span><strong>{freePorts}</strong><small>Portas livres</small></span><span><strong>{ports.length}</strong><small>Total de portas</small></span></div><button className="button-primary compact" onClick={onStart} disabled={!station.online}>Iniciar recarga</button></div></div>
      </Card>
      <Card><CardHead eyebrow="PORTAS" title="Estado das portas" right={<Link className="text-link" to="/portas">Ver todas →</Link>} />
        <div className="port-list">{ports.map((port) => <button key={port.id} className="port-row" onClick={() => onPort(port)}><span className={`port-icon ${port.status}`}>P{port.id.slice(-1)}</span><span className="port-row-info"><b>{port.label}</b><small>{port.status === "em_utilizacao" ? `Sessão em andamento · ${duration(sessions.find((session) => session.id === port.currentSessionId)?.startedAt ?? Date.now())}` : port.status === "manutencao" ? port.maintenanceReason : port.status === "bloqueada" ? port.blockedReason : "Pronta para uso"}</small></span><Badge tone={portTone(port.status)}>{statusNames[port.status]}</Badge></button>)}</div>
      </Card>
    </div>
    <div className="content-grid bottom-grid">
      <Card><CardHead eyebrow="UTILIZAÇÃO" title={`Sessões nos últimos ${period === "14" ? 14 : 7} dias`} right={<select aria-label="Período do gráfico" value={period} onChange={(event) => setPeriod(event.target.value)}><option value="esta">Esta semana</option><option value="passada">Semana passada</option><option value="14">Últimos 14 dias</option></select>} /><DailyChart data={data} /></Card>
      <Card><CardHead eyebrow="ATIVIDADE AO VIVO" title="Eventos recentes" /><EventFeed events={dayEvents.slice(0, 20)} onEvent={(event) => { const port = ports.find((item) => item.id === event.portId); if (port) onPort(port); else navigate(event.type === "alert" ? "/alertas" : "/tecnico"); }} /></Card>
    </div>
  </>;
}

function Metric({ label, value, unit, note, icon, tone, onClick }: { label: string; value: string; unit?: string; note: string; icon: string; tone: string; onClick?: () => void }) {
  const content = <><span className={`metric-icon ${tone}`}>{icon}</span><span className="metric-copy"><small>{label}</small><strong>{value}<em>{unit}</em></strong><span className="metric-note">{note}</span></span></>;
  return onClick ? <button className="metric-card metric-clickable" onClick={onClick}>{content}</button> : <article className="metric-card">{content}</article>;
}

function portTone(status: Port["status"]) { return status === "disponivel" ? "ok" : status === "em_utilizacao" ? "info" : status === "manutencao" ? "warning" : "critical"; }

function makeDailyCounts(sessions: Session[], stationId: string, end: number, days: number, portId?: string) {
  return Array.from({ length: days }, (_, index) => {
    const day = startOfDay(subDays(end, days - 1 - index));
    const next = new Date(day); next.setDate(next.getDate() + 1);
    const rows = sessions.filter((session) => session.stationId === stationId && session.startedAt >= day.getTime() && session.startedAt < next.getTime() && (!portId || session.portId === portId));
    return { label: dateLabel(day.getTime()), count: rows.length, kwh: rows.reduce((sum, session) => sum + session.kWh, 0), timestamp: day.getTime() };
  });
}

function makeWeeklyCounts(sessions: Session[], stationId: string, end: number, weeks: number, portId?: string) {
  const endOfRange = startOfDay(end).getTime() + 86400000;
  return Array.from({ length: weeks }, (_, index) => {
    const start = endOfRange - (weeks - index) * 7 * 86400000;
    const finish = start + 7 * 86400000;
    const rows = sessions.filter((session) => session.stationId === stationId && session.startedAt >= start && session.startedAt < finish && (!portId || session.portId === portId));
    return { label: dateLabel(start), count: rows.length, kwh: rows.reduce((sum, session) => sum + session.kWh, 0), timestamp: start };
  });
}

function DailyChart({ data }: { data: ReturnType<typeof makeDailyCounts> }) {
  const max = Math.max(...data.map((item) => item.count), 1);
  return <div className="bar-chart" role="img" aria-label="Sessões diárias no período selecionado">{data.map((item, index) => <div className="bar-column" key={item.timestamp} title={`${format(item.timestamp, "dd/MM/yyyy")} · ${item.count} sessões · ${item.kwh.toFixed(2)} kWh`}><span className="bar-value">{item.count || ""}</span><i className={index === data.length - 1 ? "bar today" : "bar"} style={{ height: `${Math.max(3, item.count / max * 100)}%` }} /><small>{item.label}</small></div>)}</div>;
}

function EventFeed({ events, onEvent }: { events: ReturnType<typeof useSolarStore.getState>["events"]; onEvent: (event: ReturnType<typeof useSolarStore.getState>["events"][number]) => void }) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? events.slice(0, 20) : events.slice(0, 6);
  return <div className="event-feed">{visible.length ? visible.map((event) => <button className="event-row" key={event.id} onClick={() => onEvent(event)}><i className={`event-dot ${event.type}`} /><span><b>{event.message}</b><small>{relative(event.timestamp)}</small></span></button>) : <EmptyState title="Nenhum evento recente" description="Novos eventos da estação aparecerão aqui." />}{events.length > 6 && <button className="text-link" onClick={() => setExpanded((value) => !value)}>{expanded ? "Ver menos ↑" : "Ver mais ↓"}</button>}</div>;
}

function PortsPage({ onPort }: { onPort: (port: Port) => void }) {
  const selected = useSolarStore((s) => s.selectedStationId);
  const ports = useSolarStore(useShallow((s) => s.ports.filter((port) => port.stationId === selected)));
  const sessions = useSolarStore((s) => s.sessions);
  const stationOnline = useSolarStore((s) => s.stations.find((station) => station.id === selected)?.online ?? false);
  const [filter, setFilter] = useState("todas");
  const [refresh, setRefresh] = useState(0);
  const visible = ports.filter((port) => filter === "todas" || port.status === filter);
  return <>
    <PageHeading eyebrow="GESTÃO DE INFRAESTRUTURA" title="Portas de carga" description="Acompanhe e gerencie as quatro portas da estação." right={<button className="button-secondary" onClick={() => setRefresh((value) => value + 1)}>↻ Atualizar</button>} />
    <div className="toolbar"><label className="select-label">Filtrar status <select value={filter} onChange={(event) => setFilter(event.target.value)}><option value="todas">Todos os status</option><option value="disponivel">Disponíveis</option><option value="em_utilizacao">Em utilização</option><option value="manutencao">Manutenção</option><option value="bloqueada">Bloqueadas</option></select></label><span className="muted">{visible.length} portas · atualização {refresh ? "agora" : relative(Date.now())}</span></div>
    <div className="management-grid">{visible.map((port) => {
      const session = sessions.find((item) => item.id === port.currentSessionId);
      return <Card className="manage-card" key={port.id}><div className="manage-card-head"><div><div className="eyebrow">{port.id}</div><h2>{port.label}</h2></div><Badge tone={portTone(port.status)}>{statusNames[port.status]}</Badge></div>
        <div className="connector-art"><span className={`connector ${port.status === "em_utilizacao" ? "pulse" : ""}`}>⌁</span>{session && <div className="session-progress"><div style={{ width: `${Math.min(100, session.kWh / session.targetKwh * 100)}%` }} /></div>}{session && <small>{session.kWh.toFixed(2)} / {session.targetKwh.toFixed(1)} kWh · {duration(session.startedAt)}</small>}</div>
        <dl className="data-list"><dt>Identificador</dt><dd>{port.id}</dd><dt>Última utilização</dt><dd>{isToday(port.lastUsedAt) ? format(port.lastUsedAt, "HH:mm") : format(port.lastUsedAt, "dd/MM/yyyy")}</dd><dt>Conectividade</dt><dd><Badge tone={stationOnline && port.online ? "ok" : "critical"}>{stationOnline && port.online ? "Online" : "Offline"}</Badge></dd></dl>
        <button className={`button-${port.status === "manutencao" ? "secondary" : "primary"} full-width`} onClick={() => onPort(port)}>{port.status === "manutencao" ? "Liberar porta" : "Gerenciar porta"}</button>
      </Card>;
    })}</div>
  </>;
}

function EnergyPage() {
  const readings = useSolarStore((s) => s.readings);
  const sessions = useSolarStore((s) => s.sessions);
  const selected = useSolarStore((s) => s.selectedStationId);
  const [range, setRange] = useState("hoje");
  const [showGenerated, setShowGenerated] = useState(true);
  const [showConsumed, setShowConsumed] = useState(true);
  const [sort, setSort] = useState<"kwh" | "sessions">("kwh");
  const since = range === "hoje" ? startOfDay(Date.now()).getTime() : Date.now() - (range === "7d" ? 7 : 30) * 86400000;
  const current = readings.filter((item) => item.stationId === selected && item.timestamp >= since);
  const generated = current.reduce((sum, item) => sum + item.generatedKwh, 0);
  const consumed = current.reduce((sum, item) => sum + item.consumedKwh, 0);
  const power = current.at(-1)?.powerKw ?? 0;
  const rows = [1, 2, 3, 4].map((number) => {
    const portSessions = sessions.filter((session) => session.stationId === selected && session.portId === `PORT-00${number}` && session.status === "concluida" && session.startedAt >= since);
    const kwh = portSessions.reduce((sum, session) => sum + session.kWh, 0);
    return { number, kwh, count: portSessions.length, average: portSessions.length ? kwh / portSessions.length : 0 };
  }).sort((a, b) => sort === "kwh" ? b.kwh - a.kwh : b.count - a.count);
  return <>
    <PageHeading eyebrow="DESEMPENHO ENERGÉTICO" title="Energia" description="Medições simuladas e energia associada às sessões." right={<select value={range} onChange={(event) => setRange(event.target.value)} aria-label="Período de energia"><option value="hoje">Hoje</option><option value="7d">Últimos 7 dias</option><option value="30d">Últimos 30 dias</option></select>} />
    <div className="metric-grid"><Metric label="Geração atual" value={power.toFixed(2)} unit="kW" note="Potência instantânea" icon="ϟ" tone="gold" /><Metric label="Energia gerada" value={generated.toFixed(2)} unit="kWh" note="No período selecionado" icon="☼" tone="blue" /><Metric label="Energia consumida" value={consumed.toFixed(2)} unit="kWh" note="No período selecionado" icon="⌁" tone="teal" /><Metric label="Saldo solar" value={generated ? Math.round(generated / Math.max(consumed, 0.01) * 100).toString() : "0"} unit="%" note="Geração ÷ consumo" icon="↗" tone="green" /></div>
    <Card><CardHead eyebrow="ENERGIA POR HORA" title="Geração e consumo" right={<div className="legend-controls"><button className={showGenerated ? "legend-on" : ""} onClick={() => setShowGenerated((value) => !value)}><i className="legend generated" /> Geração</button><button className={showConsumed ? "legend-on" : ""} onClick={() => setShowConsumed((value) => !value)}><i className="legend consumed" /> Consumo</button></div>} /><EnergyChart readings={current} showGenerated={showGenerated} showConsumed={showConsumed} /></Card>
    <Card className="table-card"><CardHead eyebrow="SESSÕES CONCLUÍDAS" title="Consumo associado por porta" right={<select aria-label="Ordenar portas" value={sort} onChange={(event) => setSort(event.target.value as "kwh" | "sessions")}><option value="kwh">Ordenar por kWh</option><option value="sessions">Ordenar por sessões</option></select>} /><div className="table-scroll"><table><thead><tr><th>Porta</th><th>Energia associada</th><th>Sessões</th><th>kWh / sessão</th></tr></thead><tbody>{rows.map((row) => <tr key={row.number}><td>Porta 0{row.number}</td><td>{row.kwh.toFixed(2)} kWh</td><td>{row.count}</td><td>{row.average.toFixed(2)} kWh</td></tr>)}</tbody></table></div></Card>
    <p className="disclaimer">Economia financeira e CO₂ evitado não são exibidos: o projeto ainda não definiu fatores de conversão e metodologia.</p>
  </>;
}

function EnergyChart({ readings, showGenerated, showConsumed }: { readings: ReturnType<typeof useSolarStore.getState>["readings"]; showGenerated: boolean; showConsumed: boolean }) {
  if (!readings.length) return <EmptyState title="Sem leituras neste período" description="As leituras simuladas aparecerão quando houver dados." />;
  const max = Math.max(...readings.map((item) => Math.max(item.generatedKwh, item.consumedKwh)), 0.1);
  const point = (value: number, index: number) => `${readings.length === 1 ? 50 : index / (readings.length - 1) * 100},${95 - value / max * 80}`;
  const generated = readings.map((item, index) => point(item.generatedKwh, index)).join(" ");
  const consumed = readings.map((item, index) => point(item.consumedKwh, index)).join(" ");
  return <div className="line-chart"><svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="Linha de geração e consumo no período"><g className="grid-lines"><path d="M0 15H100M0 35H100M0 55H100M0 75H100M0 95H100" /></g>{showGenerated && <polyline points={generated} className="line-generated" />}{showConsumed && <polyline points={consumed} className="line-consumed" />}</svg><div className="axis-labels"><span>Início do período</span><span>Agora</span></div></div>;
}

function ExecutivePage() {
  const sessions = useSolarStore((s) => s.sessions);
  const selected = useSolarStore((s) => s.selectedStationId);
  const readings = useSolarStore((s) => s.readings);
  const outages = useSolarStore((s) => s.outages);
  const [days, setDays] = useState("30");
  const [portFilter, setPortFilter] = useState<string | undefined>();
  const periodStart = Date.now() - Number(days) * 86400000;
  const periodSessions = sessions.filter((session) => session.stationId === selected && session.startedAt >= periodStart);
  const completed = periodSessions.filter((session) => session.status === "concluida");
  const users = new Set(periodSessions.map((session) => session.userId)).size;
  const energy = readings.filter((reading) => reading.stationId === selected && reading.timestamp >= periodStart).reduce((sum, reading) => sum + reading.generatedKwh, 0);
  const availability = calculateAvailability(outages, periodStart, Date.now(), selected);
  const distribution = getPortDistribution(periodSessions, selected);
  const chartDays = Number(days) === 90 ? 13 : Number(days);
  const chart = Number(days) === 90
    ? makeWeeklyCounts(sessions, selected, Date.now(), chartDays, portFilter)
    : makeDailyCounts(sessions, selected, Date.now(), chartDays, portFilter);
  const csv = () => {
    const rows = [["Indicador", "Valor"], ["Período (dias)", days], ["Carregamentos", String(completed.length)], ["Usuários atendidos", String(users)], ["Energia solar produzida (kWh)", energy.toFixed(2)], ["Disponibilidade (%)", availability.toFixed(1)]];
    const blob = new Blob(["\uFEFF" + rows.map((row) => row.join(";")).join("\r\n")], { type: "text/csv;charset=utf-8" });
    const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = "relatorio-solar-totem.csv"; link.click(); URL.revokeObjectURL(link.href);
  };
  return <>
    <PageHeading eyebrow="VISÃO EXECUTIVA" title="Indicadores operacionais" description="Desempenho e resultados do Solar Totem." right={<div className="heading-actions"><select aria-label="Período do relatório" value={days} onChange={(event) => setDays(event.target.value)}><option value="7">Últimos 7 dias</option><option value="30">Últimos 30 dias</option><option value="90">Últimos 90 dias</option></select><button className="button-secondary" onClick={csv}>↓ Exportar CSV</button></div>} />
    <div className="metric-grid"><Metric label="Carregamentos" value={completed.length.toLocaleString("pt-BR")} note={`Últimos ${days} dias`} icon="▣" tone="blue" /><Metric label="Usuários atendidos" value={users.toLocaleString("pt-BR")} note="Pessoas com sessão" icon="○" tone="teal" /><Metric label="Energia solar produzida" value={energy.toFixed(1)} unit="kWh" note="Leituras no período" icon="ϟ" tone="gold" /><Metric label="Disponibilidade" value={availability.toFixed(1)} unit="%" note={availability >= 98 ? "Acima da meta de 98%" : "Abaixo da meta de 98%"} icon="✓" tone="green" /></div>
    <div className="content-grid executive-grid"><Card><CardHead title={`Utilização ao longo do tempo${portFilter ? ` · Porta ${portFilter.slice(-1)}` : ""}`} right={portFilter && <button className="text-link" onClick={() => setPortFilter(undefined)}>Limpar filtro</button>} /><DailyChart data={chart} /></Card><Card><CardHead title="Distribuição por porta" /><div className="donut-layout"><button className="donut-chart" style={{ background: `conic-gradient(#1f6f78 0 ${distribution[0]}%,#4c9297 ${distribution[0]}% ${distribution[0] + distribution[1]}%,#89b9b8 ${distribution[0] + distribution[1]}% ${distribution[0] + distribution[1] + distribution[2]}%,#f4b942 ${distribution[0] + distribution[1] + distribution[2]}% 100%)` }} onClick={(event) => { const bounds = event.currentTarget.getBoundingClientRect(); const dx = event.clientX - (bounds.left + bounds.width / 2); const dy = event.clientY - (bounds.top + bounds.height / 2); const angle = (Math.atan2(dy, dx) * 180 / Math.PI + 90 + 360) % 360; const percentage = angle / 360 * 100; let boundary = 0; const index = distribution.findIndex((value) => { boundary += value; return percentage < boundary; }); setPortFilter(`PORT-00${Math.max(0, index) + 1}`); }} aria-label="Clique em uma fatia para filtrar sessões por porta"><span>{completed.length.toLocaleString("pt-BR")}<small>sessões</small></span></button><div className="donut-legend">{distribution.map((percent, index) => <button key={index} onClick={() => setPortFilter(`PORT-00${index + 1}`)}><i className={`donut-color color-${index + 1}`} />Porta 0{index + 1}<b>{percent}%</b></button>)}</div></div></Card></div>
    <p className="data-note">Indicadores derivados das sessões e leituras simuladas do período selecionado. Disponibilidade calculada como 1 − (tempo offline / tempo total).</p>
  </>;
}

function TechnicalPage() {
  const selected = useSolarStore((s) => s.selectedStationId);
  const station = useSolarStore((s) => s.stations.find((item) => item.id === selected)!);
  const device = useSolarStore((s) => s.device);
  const ports = useSolarStore(useShallow((s) => s.ports.filter((port) => port.stationId === selected)));
  const logs = useSolarStore(useShallow((s) => s.logs.filter((log) => log.stationId === selected)));
  const [level, setLevel] = useState("TODOS");
  const [query, setQuery] = useState("");
  const [paused, setPaused] = useState(false);
  const [diagnosing, setDiagnosing] = useState(false);
  const [diagnosis, setDiagnosis] = useState<string[]>([]);
  const [toast, setToast] = useState("");
  const [snapshotLogs, setSnapshotLogs] = useState(logs);
  useEffect(() => { if (!paused) setSnapshotLogs(logs); }, [logs, paused]);
  const visible = (paused ? snapshotLogs : logs).filter((log) => (level === "TODOS" || log.level === level) && `${log.message} ${log.origin}`.toLowerCase().includes(query.toLowerCase()));
  const runDiagnosis = () => {
    setDiagnosing(true); setDiagnosis([]);
    const checks = ["Comunicação ESP32", "Conectividade do servidor", "Estado das portas", "Leitura de energia"];
    checks.forEach((check, index) => window.setTimeout(() => {
      setDiagnosis((items) => [...items, check]);
      if (index === checks.length - 1) setDiagnosing(false);
    }, (index + 1) * 500));
  };
  const copy = async () => {
    const text = JSON.stringify({ stationId: selected, deviceId: "ESP32-001", online: station.online, ...device }, null, 2);
    try { await navigator.clipboard.writeText(text); setToast("Diagnóstico copiado"); } catch { setToast("Não foi possível acessar a área de transferência"); }
    window.setTimeout(() => setToast(""), 3000);
  };
  const download = () => {
    const text = visible.map((log) => `${format(log.timestamp, "yyyy-MM-dd HH:mm:ss")} [${log.level}] ${log.origin} — ${log.message}`).join("\r\n");
    const link = document.createElement("a"); link.href = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" })); link.download = "solar-totem-logs.txt"; link.click(); URL.revokeObjectURL(link.href);
  };
  const toggleDevice = useSolarStore((s) => s.toggleDevice);
  const restartDevice = useSolarStore((s) => s.restartDevice);
  return <>
    <PageHeading eyebrow="CENTRAL DE TELEMETRIA" title="Central técnica" description="Telemetria, conectividade e diagnósticos da estação." right={<Badge tone={station.online ? "ok" : "critical"}>{station.online ? "Comunicação ativa" : "Sem comunicação"}</Badge>} />
    <div className="content-grid tech-grid">
      <Card><CardHead title="Dispositivo ESP32" right={<Badge tone={station.online ? "ok" : "critical"}>{station.online ? "Online" : "Offline"}</Badge>} /><div className="device-info"><DataPair label="Identificador" value="ESP32-001" /><DataPair label="Firmware" value={device.firmware} /><DataPair label="Endereço IP" value={device.ip} /><DataPair label="Wi-Fi" value={`${device.rssi} dBm`} /><DataPair label="Atividade" value={`${Math.floor(device.uptimeSeconds / 86400)}d ${String(Math.floor(device.uptimeSeconds / 3600) % 24).padStart(2, "0")}h`} /><DataPair label="Último heartbeat" value={relative(device.lastHeartbeatAt)} /></div><div className="button-row"><button className="button-secondary" disabled={!station.online} onClick={restartDevice}>↻ Reiniciar dispositivo</button><button className="button-secondary" onClick={copy}>Copiar diagnóstico</button><button className="button-quiet" onClick={toggleDevice}>{station.online ? "Simular offline" : "Restaurar conexão"}</button></div>{toast && <p className="toast-inline" role="status">{toast}</p>}</Card>
      <Card><CardHead title="Diagnósticos" right={<button className="button-secondary" disabled={diagnosing} onClick={runDiagnosis}>{diagnosing ? "Verificando..." : "Executar diagnóstico"}</button>} />{["Comunicação ESP32", "Conectividade do servidor", "Estado das portas", "Leitura de energia"].map((item) => { const done = diagnosis.includes(item); const failure = item === "Comunicação ESP32" && !station.online; return <div className="diagnostic-row" key={item}><span><i className={failure ? "critical" : done || !diagnosis.length ? "ok" : "pending"} />{item}</span><b className={failure ? "text-critical" : ""}>{diagnosis.length && !done ? "Verificando" : failure ? "Falha" : diagnosis.length ? "Normal" : "Aguardando execução"}</b></div>; })}</Card>
    </div>
    <Card className="logs-card"><CardHead title="Logs recentes" right={<div className="log-actions"><button className="button-secondary" onClick={() => setPaused((value) => !value)}>{paused ? "▶ Retomar" : "Ⅱ Pausar"}</button><button className="button-secondary" onClick={download}>↓ Baixar logs (.txt)</button></div>} /><div className="toolbar log-toolbar"><select aria-label="Filtrar nível de log" value={level} onChange={(event) => setLevel(event.target.value)}><option>TODOS</option><option>INFO</option><option>WARN</option><option>ERROR</option></select><input placeholder="Buscar em logs..." value={query} onChange={(event) => setQuery(event.target.value)} /></div><div className="table-scroll"><table><thead><tr><th>Horário</th><th>Nível</th><th>Mensagem</th><th>Origem</th></tr></thead><tbody>{visible.map((log) => <tr key={log.id}><td>{format(log.timestamp, "HH:mm:ss")}</td><td><span className={`log-level ${log.level.toLowerCase()}`}>{log.level}</span></td><td>{log.message}</td><td className="mono">{log.origin}</td></tr>)}</tbody></table>{!visible.length && <EmptyState title="Nenhum log encontrado" description="Ajuste os filtros ou aguarde novos eventos." />}</div>{paused && <p className="data-note">Atualização automática pausada. Eventos continuarão registrados no estado da demonstração.</p>}</Card>
    <div className="card port-technical"><CardHead title="Estado das portas" />{ports.map((port) => <div className="diagnostic-row" key={port.id}><span>{port.id} · {port.label}</span><Badge tone={!station.online ? "critical" : portTone(port.status)}>{station.online ? statusNames[port.status] : "Conectividade offline"}</Badge></div>)}</div>
  </>;
}

function DataPair({ label, value }: { label: string; value: string }) { return <div className="data-pair"><span>{label}</span><b>{value}</b></div>; }

function AlertsPage() {
  const selected = useSolarStore((s) => s.selectedStationId);
  const alerts = useSolarStore(useShallow((s) => s.alerts.filter((alert) => alert.stationId === selected)));
  const acknowledge = useSolarStore((s) => s.acknowledgeAlert);
  const resolve = useSolarStore((s) => s.resolveAlert);
  const [filter, setFilter] = useState("todos");
  const [severity, setSeverity] = useState("todas");
  const [consult, setConsult] = useState<Alert | null>(null);
  const [resolveTarget, setResolveTarget] = useState<Alert | null>(null);
  const [resolveNote, setResolveNote] = useState("");
  const [resolveError, setResolveError] = useState("");
  const visible = alerts.filter((alert) => (filter === "todos" || alert.status === filter) && (severity === "todas" || alert.severity === severity)).sort((a, b) => b.openedAt - a.openedAt);
  return <>
    <PageHeading eyebrow="MONITORAMENTO" title="Central de alertas" description="Acompanhe, reconheça e resolva eventos da estação." />
    <div className="filter-tabs" role="tablist">{[["todos", "Todos"], ["aberto", "Abertos"], ["reconhecido", "Reconhecidos"], ["resolvido", "Resolvidos"]].map(([value, name]) => <button key={value} role="tab" aria-selected={filter === value} className={filter === value ? "active" : ""} onClick={() => setFilter(value)}>{name}<span>{alerts.filter((alert) => value === "todos" || alert.status === value).length}</span></button>)}<select aria-label="Filtrar severidade" value={severity} onChange={(event) => setSeverity(event.target.value)}><option value="todas">Todas as severidades</option><option value="critico">Crítico</option><option value="atencao">Atenção</option><option value="informacao">Informação</option></select></div>
    <div className="alert-list">{visible.length ? visible.map((alert) => <AlertCard key={alert.id} alert={alert} onAcknowledge={() => acknowledge(alert.id)} onResolve={() => { setResolveTarget(alert); setResolveNote(""); setResolveError(""); }} onConsult={() => setConsult(alert)} />) : <Card><EmptyState title={filter === "aberto" ? "Nenhum alerta aberto 🎉" : "Nenhum alerta encontrado"} description="Não há alertas para os filtros selecionados." /></Card>}</div>
    {consult && <AlertTimeline alert={consult} onClose={() => setConsult(null)} />}
    {resolveTarget && <Modal title="Resolver alerta" onClose={() => setResolveTarget(null)}><p className="modal-intro">{resolveTarget.title}</p><label className="field-label">Nota de resolução<input value={resolveNote} onChange={(event) => { setResolveNote(event.target.value); setResolveError(""); }} placeholder="Descreva como o problema foi resolvido" /></label>{resolveError && <p className="form-error" role="alert">{resolveError}</p>}<div className="modal-footer"><button className="button-secondary" onClick={() => setResolveTarget(null)}>Cancelar</button><button className="button-primary" onClick={() => { if (!resolveNote.trim()) { setResolveError("Informe uma nota para registrar a resolução."); return; } resolve(resolveTarget.id, resolveNote.trim()); setResolveTarget(null); }}>Confirmar resolução</button></div></Modal>}
  </>;
}

function AlertCard({ alert, onAcknowledge, onResolve, onConsult }: { alert: Alert; onAcknowledge: () => void; onResolve: () => void; onConsult: () => void }) {
  const severityLabel = { critico: "Crítico", atencao: "Atenção", informacao: "Informação" }[alert.severity];
  return <article className={`alert-card ${alert.status}`}><span className={`alert-symbol ${alert.severity}`}>{alert.severity === "critico" ? "!" : alert.severity === "atencao" ? "!" : "i"}</span><div className="alert-copy"><b>{alert.title}</b><small>{alert.origin} · {severityLabel} · {alert.status === "resolvido" ? `Resolvido ${relative(alert.resolvedAt ?? alert.openedAt)}` : `Aberto ${relative(alert.openedAt)}`}</small>{alert.status === "reconhecido" && <small>Reconhecido por {alert.acknowledgedBy} · {relative(alert.acknowledgedAt ?? alert.openedAt)}</small>}</div><div className="alert-actions">{alert.status === "aberto" && <button className="button-secondary" onClick={onAcknowledge}>Reconhecer</button>}{alert.status === "reconhecido" && <button className="button-primary" onClick={onResolve}>Resolver</button>}{alert.status === "resolvido" && <button className="button-secondary" onClick={onConsult}>Consultar</button>}</div></article>;
}

function AlertTimeline({ alert, onClose }: { alert: Alert; onClose: () => void }) {
  const logs = useSolarStore(useShallow((s) => s.logs.filter((log) => log.stationId === alert.stationId && (log.origin === alert.origin || log.message.includes(alert.id))).slice(0, 5)));
  return <Modal title="Detalhes do alerta" onClose={onClose}><h3>{alert.title}</h3><div className="timeline"><div><i />Aberto · {format(alert.openedAt, "dd/MM/yyyy HH:mm")}</div>{alert.acknowledgedAt && <div><i />Reconhecido por {alert.acknowledgedBy} · {format(alert.acknowledgedAt, "HH:mm")}</div>}{alert.resolvedAt && <div><i />Resolvido · {format(alert.resolvedAt, "HH:mm")} {alert.note && `· ${alert.note}`}</div>}</div><h4>Eventos relacionados</h4>{logs.length ? logs.map((log) => <p key={log.id} className="timeline-log">{format(log.timestamp, "HH:mm:ss")} · {log.message}</p>) : <p className="muted">Nenhum log relacionado registrado.</p>}</Modal>;
}

function NotificationPopover({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const selected = useSolarStore((s) => s.selectedStationId);
  const alerts = useSolarStore(useShallow((s) => s.alerts.filter((alert) => alert.stationId === selected).slice(0, 5)));
  return <><button className="click-away" aria-label="Fechar notificações" onClick={onClose} /><div className="notification-popover"><div className="popover-head"><b>Notificações</b><button onClick={() => { onClose(); navigate("/alertas"); }}>Ver todos →</button></div>{alerts.length ? alerts.map((alert) => <button className="notification-row" key={alert.id} onClick={() => { onClose(); navigate("/alertas"); }}><i className={`event-dot ${alert.severity}`} /><span><b>{alert.title}</b><small>{relative(alert.openedAt)}</small></span></button>) : <p className="empty-note">Sem alertas nesta estação.</p>}</div></>;
}

function SessionWizard({ initialPortId, onClose }: { initialPortId: string; onClose: () => void }) {
  const selected = useSolarStore((s) => s.selectedStationId);
  const station = useSolarStore((s) => s.stations.find((item) => item.id === selected)!);
  const ports = useSolarStore(useShallow((s) => s.ports.filter((port) => port.stationId === selected)));
  const users = useSolarStore(useShallow((s) => s.users.filter((user) => user.active)));
  const sessions = useSolarStore((s) => s.sessions);
  const start = useSolarStore((s) => s.startSession);
  const finish = useSolarStore((s) => s.finishSession);
  const [step, setStep] = useState(1);
  const [portId, setPortId] = useState(initialPortId);
  const [userId, setUserId] = useState(users[0]?.id ?? "");
  const [search, setSearch] = useState("");
  const [goal, setGoal] = useState("1");
  const [error, setError] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [userName, setUserName] = useState("");
  const [userRegistration, setUserRegistration] = useState("");
  const [newUserMode, setNewUserMode] = useState(false);
  const [undoSeconds, setUndoSeconds] = useState(0);
  const [goalMode, setGoalMode] = useState("kwh");
  const [finishConfirm, setFinishConfirm] = useState(false);
  const addUser = useSolarStore.setState;
  const filteredUsers = users.filter((user) => `${user.name} ${user.registration}`.toLowerCase().includes(search.toLowerCase())).slice(0, 6);
  const available = ports.filter((port) => port.status === "disponivel");
  useEffect(() => {
    if (step !== 3 || undoSeconds <= 0) return;
    const timer = window.setTimeout(() => setUndoSeconds((value) => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [step, undoSeconds]);
  const doStart = () => {
    const enteredGoal = Number(goal);
    const targetKwh = goalMode === "tempo" ? enteredGoal * 0.45 / 60 : goalMode === "100" ? 1 : enteredGoal;
    try { const id = start(portId, userId, targetKwh); setSessionId(id); setStep(3); setUndoSeconds(5); setError(""); }
    catch (exception) { setError(exception instanceof Error ? exception.message : "Não foi possível iniciar a sessão."); }
  };
  const createUser = () => {
    if (!userName.trim() || !userRegistration.trim()) { setError("Preencha nome e matrícula."); return; }
    if (useSolarStore.getState().users.some((user) => user.registration === userRegistration.trim())) { setError("Já existe um usuário com essa matrícula."); return; }
    const id = `USR-N-${crypto.randomUUID().slice(0, 6)}`;
    addUser((state) => ({ users: [{ id, name: userName.trim(), registration: userRegistration.trim(), active: true }, ...state.users] }));
    setUserId(id); setNewUserMode(false); setError("");
  };
  if (finishConfirm) return <Modal title="Encerrar carregamento" onClose={() => setFinishConfirm(false)}><p className="modal-intro">Deseja encerrar a sessão {sessionId} nesta porta?</p><div className="modal-footer"><button className="button-secondary" onClick={() => setFinishConfirm(false)}>Continuar carregando</button><button className="button-primary" onClick={() => { finish(sessionId); setFinishConfirm(false); onClose(); }}>Encerrar sessão</button></div></Modal>;
  return <Modal title={step === 3 ? "Sessão em andamento" : "Iniciar carregamento"} onClose={onClose}>
    {step < 3 && <div className="step-indicator"><span className={step >= 1 ? "current" : ""}>1 · Porta</span><i /><span className={step >= 2 ? "current" : ""}>2 · Usuário</span><i /><span>3 · Confirmação</span></div>}
    {!station.online && step < 3 && <EmptyState title="Estação sem comunicação" description="Não é possível iniciar um carregamento enquanto o ESP32 estiver offline." />}
    {step === 1 && station.online && <><p className="modal-intro">Escolha uma porta disponível na estação {station.id}.</p>{ports.map((port) => <button key={port.id} className={`choice-row ${portId === port.id ? "chosen" : ""}`} disabled={port.status !== "disponivel" || !port.online} title={!port.online ? "Porta temporariamente offline." : undefined} onClick={() => setPortId(port.id)}><span className="port-icon">{port.label.slice(-2)}</span><span><b>{port.label}</b><small>{!port.online ? "Conectividade offline" : port.status === "disponivel" ? "Disponível para uso" : port.status === "manutencao" ? port.maintenanceReason : port.status === "bloqueada" ? port.blockedReason : "Em utilização"}</small></span><Badge tone={portTone(port.status)}>{statusNames[port.status]}</Badge></button>)}{!available.length && <p className="empty-note">Nenhuma porta livre no momento. Tente novamente mais tarde.</p>}</>}
    {step === 2 && <><label className="field-label">Buscar por nome ou matrícula<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Digite o nome ou matrícula" /></label>{!newUserMode ? <><div className="user-options">{filteredUsers.map((user) => <button key={user.id} className={`user-option ${userId === user.id ? "chosen" : ""}`} onClick={() => setUserId(user.id)}><span className="avatar small">{user.name.split(" ").map((part) => part[0]).slice(0, 2).join("")}</span><span><b>{user.name}</b><small>Matrícula {user.registration}</small></span>{user.id === userId && "✓"}</button>)}{!filteredUsers.length && <p className="empty-note">Nenhum usuário encontrado. Cadastre uma nova pessoa para continuar.</p>}</div><button className="text-link" onClick={() => setNewUserMode(true)}>＋ Cadastrar novo usuário</button></> : <div className="new-user-form"><label className="field-label">Nome completo<input value={userName} onChange={(event) => setUserName(event.target.value)} /></label><label className="field-label">Matrícula<input value={userRegistration} onChange={(event) => setUserRegistration(event.target.value)} /></label><button className="button-secondary" onClick={createUser}>Cadastrar usuário</button></div>}<label className="field-label goal-label">Meta de carregamento<select value={goalMode} onChange={(event) => setGoalMode(event.target.value)}><option value="kwh">Por energia (kWh)</option><option value="tempo">Por tempo</option><option value="100">Até 100% (estimativa)</option></select></label>{goalMode === "kwh" && <label className="field-label">Meta de energia (kWh)<input type="number" min="0.1" max="5" step="0.1" value={goal} onChange={(event) => setGoal(event.target.value)} /></label>}{goalMode === "tempo" && <label className="field-label">Duração da sessão (minutos)<input type="number" min="1" max="240" step="1" value={goal} onChange={(event) => setGoal(event.target.value)} /></label>}{goalMode === "100" && <p className="data-note">O ESP32 não mede a bateria do celular. Na demonstração, esta meta usa uma estimativa fixa de 1 kWh, não uma leitura real de 100%.</p>}</>}
    {step === 3 && <div className="session-live"><Badge tone="ok">Carregando</Badge><h3>{ports.find((port) => port.id === portId)?.label}</h3><p>Sessão {sessionId} · {users.find((user) => user.id === userId)?.name ?? userName}</p>{(() => { const session = sessions.find((item) => item.id === sessionId); return session ? <div className="live-kwh"><b>{session.kWh.toFixed(3)} kWh</b><div className="session-progress"><div style={{ width: `${Math.min(100, session.kWh / session.targetKwh * 100)}%` }} /></div><small>Tempo decorrido {duration(session.startedAt)} · Meta {session.targetKwh.toFixed(1)} kWh</small></div> : null; })()}<button className="button-secondary full-width" onClick={() => setFinishConfirm(true)}>Encerrar sessão</button></div>}
    {error && <p className="form-error" role="alert">{error}</p>}
    {step < 3 && <div className="modal-footer">{step === 2 && <button className="button-secondary" onClick={() => setStep(1)}>Voltar</button>}<button className="button-primary" disabled={!station.online || (step === 1 && !portId) || (step === 2 && !userId)} onClick={() => step === 1 ? setStep(2) : doStart()}>{step === 1 ? "Continuar" : "Confirmar carregamento"}</button></div>}
    {step === 3 && <div className="modal-footer">{undoSeconds > 0 && <button className="button-quiet" onClick={() => { finish(sessionId, true); onClose(); }}>Desfazer início · {undoSeconds}s</button>}<button className="button-primary" onClick={onClose}>Concluir</button></div>}
  </Modal>;
}

function PortDrawer({ port, onClose, onStart }: { port: Port; onClose: () => void; onStart: (portId: string) => void }) {
  const current = useSolarStore((s) => s.ports.find((item) => item.id === port.id && item.stationId === port.stationId) ?? port);
  const sessions = useSolarStore(useShallow((s) => s.sessions.filter((session) => session.stationId === port.stationId && session.portId === port.id && session.endedAt !== null).sort((a, b) => b.startedAt - a.startedAt).slice(0, 10)));
  const users = useSolarStore((s) => s.users);
  const finish = useSolarStore((s) => s.finishSession);
  const release = useSolarStore((s) => s.releasePort);
  const maintenance = useSolarStore((s) => s.setMaintenance);
  const toggleBlock = useSolarStore((s) => s.toggleBlock);
  const restartPort = useSolarStore((s) => s.restartPort);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState("");
  const [restarting, setRestarting] = useState(false);
  const [finishConfirm, setFinishConfirm] = useState(false);
  const [releaseConfirm, setReleaseConfirm] = useState(false);
  const session = useSolarStore((s) => s.sessions.find((item) => item.id === current.currentSessionId));
  useEffect(() => {
    if (!restarting) return;
    const timer = window.setTimeout(() => setRestarting(false), 3100);
    return () => window.clearTimeout(timer);
  }, [restarting]);
  const doMaintenance = () => {
    if (!reason.trim()) { setReasonError("Informe o motivo da manutenção."); return; }
    maintenance(current.id, reason);
    setReasonError("");
  };
  if (finishConfirm && session) return <Modal title="Encerrar sessão" onClose={() => setFinishConfirm(false)}><p className="modal-intro">Confirmar encerramento da sessão {session.id}?</p><div className="modal-footer"><button className="button-secondary" onClick={() => setFinishConfirm(false)}>Cancelar</button><button className="button-primary" onClick={() => { finish(session.id); setFinishConfirm(false); }}>Encerrar sessão</button></div></Modal>;
  if (releaseConfirm) return <Modal title="Liberar porta" onClose={() => setReleaseConfirm(false)}><p className="modal-intro">Confirmar a liberação de {current.label}?</p><div className="modal-footer"><button className="button-secondary" onClick={() => setReleaseConfirm(false)}>Cancelar</button><button className="button-primary" onClick={() => { release(current.id, reason || "Inspeção concluída"); setReleaseConfirm(false); onClose(); }}>Liberar porta</button></div></Modal>;
  return <div className="drawer-layer"><button className="modal-shade" onClick={onClose} aria-label="Fechar detalhes da porta" /><aside className="side-drawer"><div className="drawer-heading"><div><div className="eyebrow">{current.id}</div><h2>{current.label}</h2></div><button className="close-button" onClick={onClose} aria-label="Fechar">×</button></div><Badge tone={portTone(current.status)}>{statusNames[current.status]}</Badge>
    <div className="drawer-section"><h3>Dados da porta</h3><DataPair label="Estação" value={current.stationId} /><DataPair label="Conectividade" value={current.online ? "Online" : "Reiniciando"} /><DataPair label="Última utilização" value={format(current.lastUsedAt, "dd/MM/yyyy HH:mm")} />{current.maintenanceReason && <DataPair label="Observação" value={current.maintenanceReason} />}</div>
    {session && <div className="drawer-section"><h3>Sessão atual</h3><DataPair label="Usuário" value={users.find((user) => user.id === session.userId)?.name ?? "Convidado"} /><DataPair label="Início" value={format(session.startedAt, "HH:mm")} /><DataPair label="Energia" value={`${session.kWh.toFixed(3)} kWh`} /><DataPair label="Tempo decorrido" value={duration(session.startedAt)} /><button className="button-secondary full-width" onClick={() => setFinishConfirm(true)}>Encerrar sessão</button></div>}
    {current.status === "manutencao" && <div className="drawer-section"><h3>Liberar porta</h3><label className="field-label">Observação de conclusão<input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Ex.: inspeção concluída" /></label><button className="button-primary full-width" onClick={() => setReleaseConfirm(true)}>Liberar porta</button></div>}
    <div className="drawer-section"><h3>Ações administrativas</h3>{current.status === "disponivel" && <button className="button-secondary full-width" onClick={() => onStart(current.id)}>Iniciar carregamento aqui</button>}{current.status !== "manutencao" && <><label className="field-label">Motivo da manutenção<input value={reason} onChange={(event) => { setReason(event.target.value); setReasonError(""); }} placeholder="Ex.: inspeção preventiva" /></label>{reasonError && <p className="form-error">{reasonError}</p>}</>}<div className="drawer-action-grid"><button className="button-secondary" disabled={current.status === "manutencao"} onClick={doMaintenance}>Colocar em manutenção</button>    <button className="button-secondary" disabled={current.status === "em_utilizacao"} title={current.status === "em_utilizacao" ? "Encerre a sessão antes de bloquear a porta." : undefined} onClick={() => toggleBlock(current.id)}>{current.status === "bloqueada" ? "Desbloquear porta" : "Bloquear porta"}</button><button className="button-secondary" disabled={restarting || !current.online} onClick={() => { restartPort(current.id); setRestarting(true); }}>{restarting ? "Reiniciando (3s)..." : "Reiniciar porta"}</button></div></div>
    <div className="drawer-section"><h3>Últimas sessões</h3>{sessions.map((item) => <div className="history-row" key={item.id}><span>{format(item.startedAt, "dd/MM HH:mm")} · {duration(item.startedAt, item.endedAt ?? item.startedAt)}</span><b>{item.kWh.toFixed(2)} kWh</b></div>)}{!sessions.length && <p className="muted">Ainda não há sessões nesta porta.</p>}</div>
  </aside></div>;
}

function SimulatorModal({ onClose }: { onClose: () => void }) {
  const toggle = useSolarStore((s) => s.toggleDevice);
  const fail = useSolarStore((s) => s.forcePortFailure);
  const spike = useSolarStore((s) => s.demandSpike);
  const toggleSimulation = useSolarStore((s) => s.toggleSimulation);
  const paused = useSolarStore((s) => s.simulator.paused);
  return <Modal title="Simulador de falhas" onClose={onClose}><p className="modal-intro">Use estas ações para demonstrar estados, diagnósticos e alertas.</p><div className="simulator-actions"><button className="button-secondary" onClick={toggleSimulation}>{paused ? "Retomar simulação ao vivo" : "Pausar simulação ao vivo"}</button><button className="button-secondary" onClick={toggle}>Derrubar / restaurar ESP32</button><button className="button-secondary" onClick={fail}>Forçar falha em uma porta livre</button><button className="button-secondary" onClick={spike}>Gerar pico de demanda</button></div></Modal>;
}

function ProfileModal({ onClose }: { onClose: () => void }) {
  const sessions = useSolarStore(useShallow((s) => s.sessions.filter((session) => session.userId === "USR-0001")));
  const completed = sessions.filter((session) => session.status === "concluida");
  return <Modal title="Perfil do usuário" onClose={onClose}><div className="profile-summary"><span className="avatar">ES</span><div><b>Eduardo Silva</b><small>Administrador · eduardo@senai.br</small></div></div><div className="drawer-section"><DataPair label="Sessões demonstrativas" value={String(sessions.length)} /><DataPair label="Sessões concluídas" value={String(completed.length)} /><DataPair label="Conta" value="Ativa" /></div></Modal>;
}

function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);
  return <div className="modal-layer"><button className="modal-shade" onClick={onClose} aria-label="Fechar janela" /><section className="modal" role="dialog" aria-modal="true" aria-label={title}><div className="modal-header"><h2>{title}</h2><button className="close-button" onClick={onClose} aria-label="Fechar">×</button></div><div className="modal-body">{children}</div></section></div>;
}

function EmptyState({ title, description }: { title: string; description: string }) { return <div className="empty-state"><span>⌁</span><b>{title}</b><p>{description}</p></div>; }

function Login({ onLogin }: { onLogin: () => void }) {
  return <main className="login-screen"><div className="login-card"><span className="brand-symbol">☼</span><div className="eyebrow">SOLAR TOTEM · SENAI</div><h1>Acesse a plataforma</h1><p>Entrada demonstrativa para a equipe do projeto.</p><label className="field-label">E-mail<input type="email" defaultValue="eduardo@senai.br" /></label><label className="field-label">Senha<input type="password" defaultValue="demonstracao" /></label><button className="button-primary full-width" onClick={onLogin}>Entrar na demonstração</button></div></main>;
}

export default App;
