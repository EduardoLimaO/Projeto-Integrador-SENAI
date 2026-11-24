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

