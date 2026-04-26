# Deliverable Tracker

Next.js App Router MVP for building, saving, and snapshotting motion campaign deliverables matrices.

## Stack

- Next.js, React, TypeScript, Tailwind
- Supabase Auth and Postgres
- XYFlow / React Flow visual tree editor
- Vercel-ready root-path deployment for `tools.felipelima.com`

## Local setup

1. Use Node 20.9 or newer.
2. Copy `.env.example` to `.env.local` and fill in Supabase values.
3. Run the SQL in `supabase/schema.sql` in Supabase.
4. Install and start:

```bash
npm install
npm run dev
```

The MVP currently includes auth, workspace/project creation, editable JSON deliverables trees, count calculations, manual snapshots, and a basic snapshot list. AI intake, billing, Google exports, client accounts, viewer roles, and file delivery tracking are intentionally not included.
