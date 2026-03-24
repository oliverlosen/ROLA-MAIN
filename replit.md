# Rola Spotlight

## Overview
Marketing project tracking platform for ROLA Entertainment. Replaces Excel-based tracking with a centralized database, dashboards, workflow tracking, and media value reporting in USD. Target region: Central America.

## Recent Changes
- 2026-02-19: WhatsApp-style chat upgrade - DMs (1-on-1), custom groups (with execution/country/title/studio context), @mention system for users/countries/titles/studios/brands, split-panel layout, search conversations
- 2026-02-19: Collaboration system - tasks, notifications (with unread badges), chat per execution with message links, polling-based updates
- 2026-02-06: Initial MVP build - auth, dashboard, executions CRUD, catalog admin, CSV export

## Tech Stack
- **Frontend**: React + TypeScript + Tailwind CSS + Shadcn UI + Recharts
- **Backend**: Express.js + Passport.js (local strategy) + express-session
- **Database**: SQLite local file with Drizzle ORM
- **Auth**: Session-based with bcryptjs password hashing. Roles: admin, editor, approver, viewer

## Project Architecture
```
client/src/
  App.tsx            - Main app with auth gating, routing, sidebar layout
  lib/auth.tsx       - Auth context provider
  lib/theme.tsx      - Dark/light theme provider
  lib/queryClient.ts - React Query setup with apiRequest helper
  components/
    app-sidebar.tsx    - Navigation sidebar with role-based admin section
    global-filters.tsx - Shared filter context + filter bar component
    theme-toggle.tsx   - Dark/light toggle button
  pages/
    login.tsx          - Login page
    dashboard.tsx      - Dashboard with KPIs and charts
    executions.tsx     - Executions list with table, pagination, sorting
    execution-form.tsx - Create/edit execution form
    execution-detail.tsx - Execution detail with workflow, assets, history, tasks
    admin-catalog.tsx  - Reusable admin catalog CRUD page
    admin-users.tsx    - User management page
    notifications.tsx  - Notifications list with mark-as-read
    chat.tsx           - WhatsApp-style chat: DMs, groups, execution chats, @mentions, split layout
server/
  index.ts     - Express server setup
  db.ts        - Local SQLite connection + auto-bootstrap
  routes.ts    - All API routes with auth middleware
  storage.ts   - Database storage layer (IStorage interface)
shared/
  schema.ts    - Drizzle schema, types, enums, constants
```

## Database
- SQLite local file at `data/rola.sqlite` via Drizzle ORM
- Tables: users, countries, brands, titles, studios, executions, assets, status_history, fx_defaults, tasks, notifications, conversations, conversation_members, messages, message_links
- Initialize/verify local DB file: `npm run db:push`
- Import existing Postgres/Replit data: `DATABASE_URL=... npm run db:migrate-from-postgres`

## Key API Endpoints
- POST /api/auth/login, /api/auth/logout, GET /api/auth/me
- GET/POST /api/countries, /api/brands, /api/titles, /api/studios
- GET/POST /api/executions, GET/PATCH /api/executions/:id
- PATCH /api/executions/:id/status
- GET/POST /api/executions/:id/assets
- GET /api/executions/:id/history
- GET /api/dashboard
- GET /api/executions/export (CSV)
- GET/POST /api/users (admin only)
- GET/POST /api/executions/:id/tasks, PATCH /api/tasks/:id
- GET /api/notifications, GET /api/notifications/unread-count, POST /api/notifications/:id/read, POST /api/notifications/read-all
- GET /api/conversations, GET /api/conversations/unread-count, GET /api/conversations/:id
- POST /api/conversations/direct, POST /api/conversations/group
- GET /api/conversations/:id/messages, POST /api/conversations/:id/messages
- GET /api/conversations/:id/members
- GET /api/mentions?q= (search users/countries/titles/studios/brands for @mentions)

## Demo Credentials
- admin / admin123 (full access)
- editor / editor123 (create/edit executions)
- approver / approver123 (approve/close executions)
- viewer / viewer123 (read-only)

## Brand Colors
- Primary (crimson): #9d1a30 → HSL 354 70% 35%
- Accent (teal): #89ced0 → HSL 177 51% 48%
