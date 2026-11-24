<<<<<<< HEAD
# Solar Totem · SENAI

Painel web demonstrativo para acompanhar uma estação de recarga solar. A aplicação usa React, TypeScript, Vite, Tailwind CSS, React Router, Zustand e date-fns. Os dados são simulados e persistidos localmente no navegador; não há conexão com MySQL ou hardware real.

## Executar localmente

1. Instale Node.js 20.19+ (ou 22.12+), que é necessário para a versão atual do Vite.
2. Na pasta do projeto, instale as dependências:

   ```bash
   npm install
   ```

3. Inicie o servidor de desenvolvimento:

   ```bash
   npm run dev
   ```

4. Abra o endereço exibido no terminal (normalmente `http://localhost:5173`).

## Verificações

```bash
npm test
npm run build
```

## Demonstração

- O estado central usa Zustand e é salvo em `localStorage`.

=======
# Solar Totem · SENAI

Painel web para acompanhar o firmware do Solar Totem pelo USB Serial. A aplicação usa React, TypeScript, Vite, Tailwind CSS, React Router, Zustand e date-fns. As linhas recebidas a 115200 baud são interpretadas no navegador; não há backend nem conexão com MySQL.

## Executar localmente

1. Instale Node.js 20.19+ (ou 22.12+), que é necessário para a versão atual do Vite.
2. Na pasta do projeto, instale as dependências:

   ```bash
   npm install
   ```

3. Inicie o servidor de desenvolvimento:

   ```bash
   npm run dev
   ```

4. Abra o endereço exibido no terminal (normalmente `http://localhost:5173`).

## Verificações

```bash
npm test
npm run build
```

## Conexão com o totem

- Use Chrome ou Edge em um computador e clique em **Conectar ao totem (USB)**.
- Se a porta estiver ocupada, feche o Serial Monitor da Arduino IDE antes de conectar.
- Sem hardware conectado, a aplicação usa um emissor de linhas de demonstração no mesmo formato do firmware; essas linhas passam pelo mesmo parser.
- A aplicação salva localmente apenas acessos, logs e alertas. Nenhum dado é enviado a um servidor.
- O firmware atual não aceita comandos de abertura de cabine; o botão correspondente permanece desabilitado.


