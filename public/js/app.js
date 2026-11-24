const $ = (selector, scope = document) => scope.querySelector(selector);
const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];

const ports = [
  { id:"PORT-001", number:1, status:"available" },
  { id:"PORT-002", number:2, status:"occupied" },
  { id:"PORT-003", number:3, status:"available" },
  { id:"PORT-004", number:4, status:"maintenance" }
];

const labels = ["Seg","Ter","Qua","Qui","Sex","Sáb","Dom"];
const values = [62,78,71,88,82,96,84];

function statusLabel(status) {
  return { available:"Disponível", occupied:"Em utilização", reserved:"Reservada", maintenance:"Manutenção", unavailable:"Indisponível", offline:"Offline" }[status] || status;
}

function renderPorts() {
  $("#overviewPorts").innerHTML = ports.map((port) => `
    <div class="port-row">
      <span class="port-row-icon">P${port.number}</span>
      <span><strong>Porta 0${port.number}</strong><small>${port.status === "occupied" ? "Sessão em andamento" : port.status === "maintenance" ? "Inspeção preventiva" : "Pronta para uso"}</small></span>
      <span class="port-state ${port.status}">${statusLabel(port.status)}</span>
    </div>`).join("");

  $("#portsManagement").innerHTML = ports.map((port) => `
    <article class="management-card">
      <div class="management-card-head"><h2>PORTA 0${port.number}</h2><span class="state port-state ${port.status}">${statusLabel(port.status)}</span></div>
      <div class="plug"><span class="plug-symbol">⌁</span></div>
      <dl><dt>Identificador</dt><dd>${port.id}</dd><dt>Última utilização</dt><dd>${port.status === "occupied" ? "14:21" : "Hoje"}</dd><dt>Conectividade</dt><dd>${port.status === "offline" ? "Offline" : "Online"}</dd></dl>
      <button class="outline-btn" ${port.status === "occupied" ? "disabled" : ""}>${port.status === "maintenance" ? "Liberar porta" : "Gerenciar porta"}</button>
    </article>`).join("");

  $("#drawerPorts").innerHTML = ports.map((port) => `
    <button class="drawer-port ${port.status === "available" ? "available" : ""}" data-port="${port.id}" ${port.status !== "available" ? "disabled" : ""}>
      <span class="drawer-port-symbol">P${port.number}</span>
      <span><strong>Porta 0${port.number}</strong><small>${statusLabel(port.status)}</small></span>
      <b>${port.status === "available" ? "Selecionar →" : "Indisponível"}</b>
    </button>`).join("");
}

function renderBarChart(container, valuesArray) {
  const max = Math.max(...valuesArray);
  container.innerHTML = valuesArray.map((value, index) => `
    <div class="bar-wrap"><i class="${index === valuesArray.length - 1 ? "today" : ""}" style="height:${value / max * 82}%"></i><span>${labels[index] || index + 1}</span></div>`).join("");
}

function renderLineChart() {
  $("#lineChart").innerHTML = `
    <svg viewBox="0 0 800 220" preserveAspectRatio="none" aria-label="Gráfico de produção e consumo">
      <g stroke="#EDF1EF" stroke-width="1"><line x1="0" y1="40" x2="800" y2="40"/><line x1="0" y1="90" x2="800" y2="90"/><line x1="0" y1="140" x2="800" y2="140"/><line x1="0" y1="190" x2="800" y2="190"/></g>
      <path d="M0,170 C80,160 120,145 180,150 C260,155 285,105 350,112 C420,120 460,78 520,92 C600,108 650,58 800,50" fill="none" stroke="#1F6F78" stroke-width="3"/>
      <path d="M0,185 C90,178 145,170 210,172 C280,174 330,150 400,154 C480,158 535,130 610,138 C680,145 730,116 800,122" fill="none" stroke="#F4B942" stroke-width="3"/>
      <g fill="#68767C" font-size="10"><text x="0" y="215">06h</text><text x="190" y="215">09h</text><text x="390" y="215">12h</text><text x="590" y="215">15h</text><text x="770" y="215">18h</text></g>
    </svg>`;
}

function renderExecutive() {
  $("#executiveMetrics").innerHTML = `
    ${metric("total","1.248","Carregamentos","Últimos 30 dias")}
    ${metric("users","864","Usuários atendidos","Cadastro ativo")}
    ${metric("energy","326.8 kWh","Energia solar produzida","Dados simulados")}
    ${metric("available","98.7%","Disponibilidade","Acima da meta")}
  `;
}

function metric(icon, value, label, detail) {
  const icons = {total:"▣",users:"○",energy:"ϟ",available:"✓"};
  return `<article class="metric-card"><div class="metric-icon ${icon === "energy" ? "gold" : icon === "available" ? "green" : "blue"}">${icons[icon]}</div><div><small>${label}</small><strong>${value}</strong><span>${detail}</span></div></article>`;
}

function renderEnergy() {
  $("#energyCards").innerHTML = `
    ${metric("energy","18.4 kW","Potência solar","Medido")}
    ${metric("available","82%","Nível da bateria","Medido")}
    ${metric("total","12.8 kW","Consumo atual","Medido")}
    ${metric("users","31.4 °C","Temperatura","Medido")}
  `;
}

function renderAlerts() {
  $("#alertList").innerHTML = `
    <article class="alert-item"><span class="alert-icon">!</span><div><strong>Porta 04 necessita de manutenção</strong><small>PORT-004 · Atenção · Aberto há 28 minutos</small></div><button class="outline-btn">Reconhecer</button></article>
    <article class="alert-item"><span class="alert-icon" style="background:#EAF1F3;color:#1F6F78">i</span><div><strong>Heartbeat recebido normalmente</strong><small>ESP32-001 · Informação · Resolvido há 2 minutos</small></div><button class="outline-btn">Consultar</button></article>`;
}

async function loadStatus() {
  try {
    const response = await fetch("/api/stations/TOT-001/status");
    if (!response.ok) return;
    const data = await response.json();
    $("#freePorts").textContent = data.freePorts;
  } catch (_) {}
}

function openView(view) {
  $$(".view").forEach((section) => section.classList.remove("active"));
  $(`#view-${view}`).classList.add("active");
  $$(".nav-item").forEach((item) => item.classList.toggle("active", item.dataset.view === view));
  $("#sidebar").classList.remove("open");
  window.location.hash = view;
  window.scrollTo({ top: 0, behavior:"smooth" });
}

function openDrawer() {
  $("#chargeDrawer").classList.add("open");
  $("#modalBackdrop").classList.add("open");
}

function closeDrawer() {
  $("#chargeDrawer").classList.remove("open");
  $("#modalBackdrop").classList.remove("open");
}

function showToast(title, text) {
  const toast = $("#toast");
  $("strong", toast).textContent = title;
  $("small", toast).textContent = text;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 3200);
}

$("#today").textContent = new Intl.DateTimeFormat("pt-BR", { day:"2-digit", month:"short" }).format(new Date()).replace(".","");
renderPorts();
renderBarChart($("#barChart"), values);
renderBarChart($("#executiveChart"), [42,58,51,73,68,88,79,92,84,101,96,112]);
renderLineChart();
renderExecutive();
renderEnergy();
renderAlerts();
loadStatus();

$$("[data-view]").forEach((button) => button.addEventListener("click", () => openView(button.dataset.view)));
$$("[data-view-link]").forEach((button) => button.addEventListener("click", () => openView(button.dataset.viewLink)));
$("#menuBtn").addEventListener("click", () => $("#sidebar").classList.toggle("open"));
$("#startCharge").addEventListener("click", openDrawer);
$("#closeDrawer").addEventListener("click", closeDrawer);
$("#modalBackdrop").addEventListener("click", closeDrawer);

$("#drawerPorts").addEventListener("click", async (event) => {
  const button = event.target.closest("[data-port]");
  if (!button) return;
  try {
    const response = await fetch(`/api/ports/${button.dataset.port}/reserve`, { method:"POST" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    closeDrawer();
    showToast("Sessão iniciada", `Porta reservada · ${data.session.id}`);
  } catch (error) {
    showToast("Não foi possível iniciar", error.message);
  }
});

$("#exportBtn").addEventListener("click", () => {
  const csv = "indicador,valor\nCarregamentos,1248\nUsuarios,864\nEnergia kWh,326.8\nDisponibilidade %,98.7";
  const url = URL.createObjectURL(new Blob([csv], {type:"text/csv"}));
  const link = document.createElement("a");
  link.href = url;
  link.download = "solar-totem-relatorio.csv";
  link.click();
  URL.revokeObjectURL(url);
});

$$(".alert-item button").forEach((button) => button.addEventListener("click", () => showToast("Alerta atualizado", "A ação foi registrada no sistema.")));
if (["inicio","portas","energia","executivo","tecnico","alertas"].includes(location.hash.slice(1))) openView(location.hash.slice(1));
