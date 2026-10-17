# Reasoning Lab (lite) — deployment

You need two things: somewhere to run a **Node.js** web app, and a **PostgreSQL 14+**
database. The only secret is `SESSION_SECRET`.

## 1. Deploy the application in a local machine 

Install **Node 20.18+** and **PostgreSQL 16**:
- Windows: `winget install -e --id PostgreSQL.PostgreSQL.16`

Then, in the project folder:

```bash
npm install
npm run setup:local   # creates .env.local + SESSION_SECRET, starts Postgres on :54330, creates tables, loads problems
npm run dev           # http://localhost:3000
```

Addtional commenads which helped during deployment and testing:

| Command | What it does |
|---|---|
| `npm run db:local:start` / `npm run db:local:stop` | start or stop the local database |
| `npm run db:local:reset` | wipe it and start fresh (then run `npm run db:migrate && npm run db:seed`) |

Local data lives in `%LOCALAPPDATA%\reasoning-lab-lite\pgdata` on Windows.
If PostgreSQL isn’t found, set `PGBIN` to its `bin` folder, for example:

```powershell
$env:PGBIN = "C:\Program Files\PostgreSQL\16\bin"
```

## 2. Troubleshooting

| Message | Cause | Fix |
|---|---|---|
| `Could not find PostgreSQL server tools` | PostgreSQL 16 isn’t installed or isn’t on `PATH` | Install it, open a new terminal, or set `PGBIN` (see section 1) |
| `pg_ctl start failed` | Port 54330 is in use, or the data folder is damaged | Set `LOCAL_DB_PORT`, or run `npm run db:local:reset` (this deletes local data) |