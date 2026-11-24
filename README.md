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
- O simulador atualiza energia, sessões, heartbeat e logs; as ações de demonstração permitem simular indisponibilidade, manutenção e picos de demanda.
- **Resetar demonstração** fica no menu do usuário.
- Leituras de energia são simuladas. Indicadores de CO₂ e economia não são exibidos sem uma metodologia/fator definido.
- O fluxo de autenticação é apenas demonstrativo; não use dados pessoais ou senhas reais.

## Publicar

Envie as alterações ao GitHub e conecte o repositório a uma hospedagem estática compatível com Vite, como Vercel. A configuração de rota SPA está em `vercel.json`. A publicação ainda não transforma os dados locais em dados compartilhados: cada navegador mantém sua própria demonstração.
