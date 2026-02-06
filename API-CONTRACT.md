# BARBERSAAS API Contract (v1)

Base URL padrao:
- `http://127.0.0.1:5000`

## Como subir o backend (Node)
No Windows PowerShell:
```powershell
cd "C:\Users\micae\OneDrive\Área de Trabalho\BARBEARIAAA - TESTE\backend"
npm.cmd install
npm.cmd start
```

Configuracao por arquivo:
- copie `backend/.env.example` para `backend/.env`
- ajuste as variaveis do provedor WhatsApp

API de health-check:
- `GET http://127.0.0.1:5000/health`
- `GET http://127.0.0.1:5000/automation/status`
- `GET http://127.0.0.1:5000/automation/logs?limit=80`

Ativar modo API no front:
- `index.html?api=on`
- `admin.html?api=on`
- ou via console:
  - `localStorage.setItem("barbersaas_api_mode","on")`

## 1) Bootstrap
`GET /bootstrap`

Resposta esperada:
```json
{
  "services": [],
  "barbers": [],
  "clients": [],
  "appointments": [],
  "monthlyGoal": 20000
}
```

## 2) Sync Bulk (recomendado)
`POST /sync/bulk`

Payload:
```json
{
  "reason": "appointments_update",
  "emittedAt": "2026-02-06T12:00:00.000Z",
  "data": {
    "services": [],
    "barbers": [],
    "clients": [],
    "appointments": [],
    "monthlyGoal": 20000
  }
}
```

Resposta:
- `200` com `{ "ok": true }` ou `204`.

## 3) Endpoints complementares (opcionais)
O front tambem tenta estes endpoints:

- `POST /appointments`
- `PATCH /appointments/:id`
- `POST /clients/upsert`
- `PATCH /barbers/:id`
- `PUT /services` (lista completa)
- `PUT /barbers` (lista completa)
- `PUT /settings/monthly-goal`

Se nao existirem, o sistema continua funcional em `localStorage`.

## 4) Regras importantes
- IDs sao strings (`srv-*`, `barber-*`, `cli-*`, `apt-*`).
- Datas no formato `YYYY-MM-DD`.
- Horarios no formato `HH:mm`.
- Status de atendimento:
  - `pending`
  - `confirmed`
  - `completed`
  - `refused`

## 5) Automacao WhatsApp (item 5 completo)
Fluxos automaticos no backend:
- Confirmacao imediata ao criar agendamento.
- Lembrete automatico quando faltar ate 2h para o horario.
- Mensagem pos-atendimento quando status virar `completed`.

Modo padrao:
- `WHATSAPP_PROVIDER=log` (simula envio no console)

Modo Twilio:
- `WHATSAPP_PROVIDER=twilio`
- `TWILIO_ACCOUNT_SID=...`
- `TWILIO_AUTH_TOKEN=...`
- `TWILIO_WHATSAPP_FROM=whatsapp:+14155238886` (ou seu numero aprovado)

Variaveis adicionais:
- `AUTOMATION_INTERVAL_MS=60000`
- `WHATSAPP_DEFAULT_COUNTRY=55`
