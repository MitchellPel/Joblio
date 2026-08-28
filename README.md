# Joblio

A Windows desktop application for tracking signage jobs through your company's workflow: **New Job → Design → Production → Install / Collection**.

Built with Electron + React + TypeScript + SQL.js. Not a website — a real Windows desktop app with an installer.

---

## Features

- **Kanban Board** — Drag-and-drop jobs between stages (New, Design, Production, Install, Collection, Completed)
- **Multi-user** — Username/password logins with admin and staff roles
- **Audit trail** — Every stage change is recorded with who, when, and any notes
- **Notes** — Add notes to any job, visible to all users
- **Shared database** — All PCs share one SQLite database file over your office network
- **Offline** — Works fully offline once the database file is accessible
- **No server needed** — No web server, no cloud, no hosting. Just a shared folder on your network

---

## Quick Start (Development)

### Prerequisites
- Node.js 20+ (with npm)
- Windows 10/11

### Setup

```bash
# Install dependencies
cd signage-job-tracker
npm install

# Run in development mode (two terminals or use the dev script)
npm run dev
```

This starts:
1. Vite dev server (UI) on http://localhost:5174
2. Electron app window that loads the UI

The Electron window opens automatically. On first run you'll see the Setup screen.

---

## Building the Installer (.exe)

```bash
npm run dist
```

This produces a Windows installer in the `release/` folder. The installer:
- Installs to Program Files (configurable)
- Creates a desktop shortcut
- Creates a Start Menu shortcut
- Has a custom app icon

---

## First-Time Setup

### 1. Set the shared database folder

1. Run the app. The Setup screen appears.
2. Click **Browse...** to select a shared folder on your office network (e.g. `\\SERVER\SharedFolder`)
3. The app creates `jobs.db` in that folder
4. Click **Save & Continue**

> **Important:** The shared folder must be accessible from every PC that runs this app.
> Use a network share (UNC path like `\\SERVER\SharedFolder`) that all office computers can read/write.

### 2. Log in

The first admin user is created automatically:
- **Username:** `admin`
- **Password:** `admin123`

> **Security:** Change the admin password immediately after first login.

### 3. Create staff users

1. Log in as admin
2. Click **Admin** in the navigation bar
3. Click **Add User** to create staff accounts
4. Each staff member can log in with their own credentials

---

## Daily Usage

### Creating a job
1. Click the **+** button at the top of any stage column
2. Fill in job name (required), client, contact info, due date, etc.
3. Click **Create Job**
4. The job appears in the "New Job" column

### Moving jobs between stages
- **Drag and drop** a job card from one column to another
- The stage change is recorded automatically with your name and timestamp
- You can also click a job to open its detail view and use the stage buttons there

### Viewing job details
- Click any job card to open the detail view
- See full job info, stage history timeline, and notes
- Add notes, edit job fields, or move to a different stage

### Editing a job
- Open the job detail view and click **Edit**
- Update any field

---

## Project Structure

```
├─ electron/                  # Electron main process (Node.js backend)
│  ├─ main.ts                 # App entry, window creation
│  ├─ preload.ts              # Secure IPC bridge
│  ├─ db/
│  │  ├─ connection.ts        # SQLite database (sql.js) init
│  │  ├─ migrate.ts           # Schema migrations + seeding
│  │  ├─ helpers.ts           # sql.js query helpers
│  ├─ repositories/           # Data access layer
│  │  ├─ jobsRepo.ts
│  │  ├─ usersRepo.ts
│  │  └─ auditRepo.ts
│  ├─ services/               # Business logic
│  │  ├─ authService.ts       # Login, password hashing
│  │  └─ settingsService.ts   # DB path config
│  └─ ipc/                    # IPC handlers (API for renderer)
│     ├─ authIpc.ts
│     ├─ usersIpc.ts
│     ├─ jobsIpc.ts
│     └─ settingsIpc.ts
├─ src/                       # React UI (renderer process)
│  ├─ pages/
│  │  ├─ Login.tsx
│  │  ├─ Board.tsx            # Kanban board
│  │  ├─ JobDetail.tsx        # Job detail view
│  │  ├─ Admin.tsx            # User management
│  │  └─ Setup.tsx            # First-run DB path setup
│  ├─ components/
│  │  ├─ KanbanColumn.tsx
│  │  ├─ JobCard.tsx
│  │  ├─ JobFormModal.tsx
│  │  ├─ StageTimeline.tsx
│  │  ├─ Navbar.tsx
│  │  └─ ProtectedRoute.tsx
│  └─ context/
│     └─ AuthContext.tsx       # Login state management
├─ package.json
└─ README.md
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop shell | Electron 32 |
| UI framework | React 18 + TypeScript |
| Styling | Tailwind CSS 3 |
| Drag & drop | @hello-pangea/dnd |
| Database | SQL.js (SQLite compiled to WebAssembly) |
| Auth | bcryptjs (password hashing) |
| Icons | Lucide React |
| Installer | electron-builder (NSIS) |

---

## Common Tasks

### Adding a new database table
1. Add a migration in `electron/db/migrate.ts`
2. Add the repository functions in `electron/repositories/`
3. Add IPC handlers in `electron/ipc/`
4. Add the API method in `electron/preload.ts`
5. Update `src/shared-types.ts` if needed
6. Build the UI in `src/`

### Customizing stages
Edit `src/data/stages.ts` to change stage names, order, or colours.

### Resetting the database
Delete the `jobs.db` file from the shared folder. The app recreates it on the next launch with a fresh admin account.

---

## License

Private — Internal company use.
