const http = require("http");

const base = "http://localhost:3000";

function request(path, options = {}) {
  return fetch(base + path, options).then(async (response) => ({
    status: response.status,
    body: await response.json()
  }));
}

async function run() {
  const server = require("../server/server");
  await new Promise((resolve) => setTimeout(resolve, 100));
  const status = await request("/api/stations/TOT-001/status");
  if (status.status !== 200 || status.body.freePorts !== 2) throw new Error("Status da estação falhou");
  const login = await request("/api/auth/login", {
    method:"POST",
    headers:{ "content-type":"application/json" },
    body: JSON.stringify({ email:"teste@example.com" })
  });
  if (login.status !== 200) throw new Error("Login demonstrativo falhou");
  console.log("Testes da API demonstrativa concluídos.");
  process.exit(0);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
