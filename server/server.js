const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const DEMO_MODE = process.env.DEMO_MODE !== "false";

app.use(express.json());
app.use(express.static(path.join(__dirname, "..", "public")));

const stations = [
  {
    id: "TOT-001",
    name: "Totem SENAI - Entrada",
    location: "Área central",
    status: "available",
    ports: [
      { id: "PORT-001", number: 1, status: "available" },
      { id: "PORT-002", number: 2, status: "occupied" },
      { id: "PORT-003", number: 3, status: "available" },
      { id: "PORT-004", number: 4, status: "maintenance" }
    ]
  }
];

let sessions = [];

app.get("/api/stations/:id/status", (req, res) => {
  const station = stations.find((item) => item.id === req.params.id);
  if (!station) return res.status(404).json({ error: "Estação não encontrada" });
  res.json({
    demo: DEMO_MODE,
    station,
    freePorts: station.ports.filter((port) => port.status === "available").length,
    updatedAt: new Date().toISOString()
  });
});

app.get("/api/stations/:id/ports", (req, res) => {
  const station = stations.find((item) => item.id === req.params.id);
  if (!station) return res.status(404).json({ error: "Estação não encontrada" });
  res.json({ demo: DEMO_MODE, ports: station.ports });
});

app.post("/api/ports/:id/reserve", (req, res) => {
  const port = stations.flatMap((station) => station.ports).find((item) => item.id === req.params.id);
  if (!port) return res.status(404).json({ error: "Porta não encontrada" });
  if (port.status !== "available") return res.status(409).json({ error: "Porta não está disponível" });
  port.status = "reserved";
  const session = {
    id: `SES-${Date.now()}`,
    stationId: "TOT-001",
    portId: port.id,
    status: "active",
    startedAt: new Date().toISOString()
  };
  sessions.push(session);
  res.status(201).json({ demo: DEMO_MODE, session, portStatus: port.status });
});

app.post("/api/sessions/:id/finish", (req, res) => {
  const session = sessions.find((item) => item.id === req.params.id);
  if (!session) return res.status(404).json({ error: "Sessão não encontrada" });
  session.status = "finished";
  session.finishedAt = new Date().toISOString();
  const port = stations.flatMap((station) => station.ports).find((item) => item.id === session.portId);
  if (port) port.status = "available";
  res.json({ demo: DEMO_MODE, session });
});

app.get("/api/energy/current", (req, res) => res.json({
  demo: DEMO_MODE,
  solarPower: 18.4,
  consumption: 12.8,
  batteryLevel: 82,
  temperature: 31.4,
  measuredAt: new Date().toISOString()
}));

app.get("/api/admin/dashboard", (req, res) => res.json({
  demo: DEMO_MODE,
  totalSessions: 1248,
  users: 864,
  solarProduced: 326.8,
  availability: 98.7,
  averageMinutes: 42,
  utilization: 76,
  chart: [42, 58, 51, 73, 68, 88, 79, 92, 84, 101, 96, 112]
}));

app.get("/api/telemetry/current", (req, res) => res.json({
  demo: DEMO_MODE,
  esp32: "ESP32-001",
  firmware: "2.4.1",
  uptime: "12d 04h",
  wifiRssi: -58,
  heartbeat: new Date().toISOString(),
  ports: stations[0].ports
}));

app.get("/api/alerts", (req, res) => res.json({
  demo: DEMO_MODE,
  alerts: [
    { id: "ALT-001", component: "PORTA 04", type: "Manutenção", severity: "attention", message: "Inspeção preventiva programada", status: "open" },
    { id: "ALT-002", component: "ESP32-001", type: "Comunicação", severity: "info", message: "Heartbeat recebido normalmente", status: "resolved" }
  ]
}));

app.post("/api/auth/login", (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: "Informe seu e-mail" });
  res.json({ demo: DEMO_MODE, token: "demo-token", user: { name: "Eduardo Silva", email, role: "admin" } });
});

app.post("/api/auth/register", (req, res) => {
  const { name, email } = req.body;
  if (!name || !email) return res.status(400).json({ error: "Informe nome e e-mail" });
  res.status(201).json({ demo: DEMO_MODE, user: { name, email, role: "user" } });
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "index.html"));
});

app.listen(PORT, () => console.log(`Solar Totem rodando em http://localhost:${PORT}`));
