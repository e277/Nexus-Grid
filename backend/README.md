# Nexus-Grid (Backend)

FastAPI backend for Nexus-Grid, the autonomous agentic orchestration platform for Caribbean food systems.

## What is included

- FastAPI app with layered architecture: API → services → repositories → models
- 14 entities: farmers, crops, buyers, demands, shipments, carriers, warehouses, ports, trade routes, weather events, customs documents, agent activities, audit logs, users
- Agent layer (`app/agents`): supervisor + supply, demand, logistics, climate-risk, and customs specialists — each with inputs, outputs, memory, logging, and a confidence score, persisted as agent activities
- LangGraph workflow with approval gate, disruption re-plan loop, LLM retry, and checkpointer (`app/workflows`)
- Event system (`app/events`): domain events (`buyer.request.created`, `weather.alert`, `shipment.*`, `customs.approved`) automatically routed to the supervisor agent
- External integration interfaces + stub adapters for weather, routing, and pricing (`app/integrations`)
- Explainable intelligence endpoints: demand forecast, spoilage, transport delay, shortage (`/intelligence/*`)
- Security: OAuth2 password flow, JWT, RBAC dependency (`require_role`), rate limiting, audit logging
- Monitoring: `/health/`, `/health/db`, Prometheus-format `/metrics/`
- Typed environment configuration via `pydantic-settings`; Alembic migrations; GitHub Actions CI; Docker Compose with watch mode

## Project structure

```
backend/app/
  api/            # HTTP routers (farmers, crops, buyers, demands, shipments, workflow, health)
  agents/         # Autonomous agents (supply agent + runner loop)
  workflows/      # LangGraph orchestration graph and LLM steps
  models/         # SQLAlchemy models
  schemas/        # Pydantic schemas
  services/       # Business logic / domain rules
  repositories/   # Data access (CRUD)
  database/       # Engine, session factory, declarative base
  core/           # Cross-cutting concerns (logging)
  config/         # Typed settings from environment
  events/         # In-process event bus (Phase 5 will move to a broker)
  utils/          # Shared helpers
  main.py         # App entry point (lifespan, router wiring)
```

## Quick start

1. Create a Python virtual environment and install dependencies:

```bash
cd backend
python -m venv venv
source venv/bin/activate  # on Windows use venv\Scripts\activate
pip install -r requirements.txt
```

2. Copy `.env.example` to `.env` and add your values:

```bash
cp .env.example .env
```

3. Run the app:

```bash
uvicorn app.main:app --reload --port 8000
```

4. Visit `http://localhost:8000/docs` for the interactive OpenAPI docs.

**Authentication is required for every route** except `/`, `/health/*`, `/metrics/`, and `/auth/*`: register, obtain a token, then send `Authorization: Bearer <token>`. Writes additionally require a matching role (farmers create crops, buyers create demands, logistics manages shipments/ports, government approves customs and triggers workflows; admin passes everything). Main routes:

- `POST /auth/register`, `POST /auth/token`, `GET /auth/me`
- `GET|POST /farmers`, `/crops`, `/buyers`, `/demands`, `/shipments` (+ `GET .../{id}`)
- `PATCH /shipments/{id}/status` — lifecycle transitions publish shipment events
- `GET|POST /carriers`, `/warehouses`, `/ports` (+ `PATCH /ports/{id}/status`), `/trade-routes`
- `GET|POST /weather-events` — creation publishes `weather.alert` to the climate agent
- `GET|POST /customs-documents`, `PATCH /customs-documents/{id}/status`
- `GET /intelligence/demand-forecast/{crop}`, `/intelligence/spoilage/{crop_id}`, `/intelligence/transport-delay`, `/intelligence/shortage/{crop}`
- `GET /agent-activities/`, `GET /audit-logs/`
- `GET /workflow/status`, `POST /workflow/trigger`
- `GET /health/`, `GET /health/db`, `GET /metrics/`

## Frontend

The operator console lives in `../frontend` (React + TypeScript + Tailwind, Vite):

```bash
cd frontend
npm install
npm run dev   # http://localhost:5173, proxies /api -> localhost:8005
```

After signing in, tabs are filtered by role: **Overview** (everyone — health, food-security gaps, shipments, weather), **Farm** (farmer — register farmers, log harvests, spoilage checks), **Market** (buyer — buyers, demand lifecycle, forecasts), **Logistics** (logistics — shipments/ports/carriers/routes with status actions, delay predictor), **Government** (government — customs approvals, weather alerts, workflow trigger, agent activity, audit trail). Admin sees every tab.

## Configuration

All settings are read from the environment (or `.env`) via `app/config/settings.py`:

| Variable                        | Default                                          | Purpose                                       |
| ------------------------------- | ------------------------------------------------ | --------------------------------------------- |
| `DATABASE_URL`                | `postgresql://postgres:postgres@db:5432/nexus` | SQLAlchemy connection URL                     |
| `MINIMAX_API_KEY`             | (empty)                                          | Enables LLM recommendation step (MiniMax)     |
| `CMDOP_API_KEY`               | (empty)                                          | Enables the OpenClaw agent runtime client     |
| `EVENT_BUS_BACKEND`           | `memory`                                         | In-process event bus backend                  |
| `CHECKPOINTER_BACKEND`        | `memory`                                         | `sqlite` or `postgres` = durable workflow state |
| `RATE_LIMIT_BACKEND`          | `memory`                                         | In-process rate limiter backend               |
| `SKIP_AGENT_STARTUP`          | `0`                                            | Set`1` to disable the background agent loop |
| `AGENT_POLL_INTERVAL_SECONDS` | `10`                                           | Agent check cadence                           |
| `SECRET_KEY`                  | (dev default)                                    | JWT signing key — set 32+ bytes in production |
| `LOG_LEVEL`                   | `INFO`                                         | Root log level                                |

## Docker Compose

From the repository root:

```bash
docker-compose up --build
```

This starts `web` (FastAPI on port 8005) and `db` (PostgreSQL).

## Testing

Run tests from the `backend` directory:

```bash
pytest -q
```

Tests use an in-memory SQLite database (`conftest.py` sets `DATABASE_URL` and disables agent startup).

## Alembic migrations

Table creation at startup (`Base.metadata.create_all`) covers development; Alembic owns real migrations:

```bash
cd backend
alembic revision --autogenerate -m "describe change"
alembic upgrade head
```

## Workflow endpoint

`POST /workflow/trigger` runs the LangGraph control loop once. Example payload:

```json
{
  "crop_id": 1,
  "crop_name": "Mango",
  "farmer_id": 1,
  "quantity": 1500,
  "event": "surplus",
  "message": "High inventory detected"
}
```

The response contains the state updates from each workflow phase. The LLM
recommendation step activates when `MINIMAX_API_KEY` is set; otherwise it
returns a stub explaining what is missing (see
`app/workflows/minimax_recommend.py`).
