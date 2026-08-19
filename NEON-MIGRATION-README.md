# Cash Hub NG — Neon backend migration

This archive preserves the existing Cash Hub NG frontend and backend structure while replacing the Supabase database client with PostgreSQL (`pg`) using `process.env.DATABASE_URL`.

## Render environment

The backend expects:

- `DATABASE_URL` — private Neon PostgreSQL connection string
- `CPX_SECRET` — private CPX secret (if used)

Existing Supabase variables may remain in Render temporarily as a backup, but the application code in this archive no longer imports or uses the Supabase client.

## Neon schema

The existing Neon core tables are:

- `users`
- `transactions`
- `withdrawals`

The backend automatically creates these auxiliary tables at startup if they do not exist:

- `referrals`
- `completed_tasks`

The same SQL is also provided in `migrations/003-neon-schema.sql`.

## Important column compatibility

The Neon schema uses:

- `users.earning`
- `users.referral_earning`

The API exposes compatibility fields:

- `earnings`
- `referral_earnings`

so the existing frontend can continue using its current field names.

## Security

Do not commit or paste `DATABASE_URL`, database passwords, Supabase service-role keys, or CPX secrets into source control.
