# Solar Totem

Plataforma de demonstração para gerenciamento e monitoramento da estação de carregamento solar.

## Executar

1. Instale Node.js 18 ou superior.
2. Execute `npm install`.
3. Execute `npm start`.
4. Acesse `http://localhost:3000`.

O modo demonstração está ativo por padrão e todas as telas indicam dados simulados.

## Banco MySQL

Importe `database/database.sql` e depois `database/seed.sql`. Configure as variáveis de ambiente conforme `.env.example`.

## Configuração real

Quando houver hardware disponível, desative a demonstração com `DEMO_MODE=false`. A integração com ESP32 deve ser implementada na camada `integrations/DeviceGateway`; nenhuma credencial ou informação real deve ser armazenada no front-end.
