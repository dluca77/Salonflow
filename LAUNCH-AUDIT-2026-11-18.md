# Launch audit — 18 November 2026

## Verified this release
- All 20 JavaScript regression scripts pass (external payment providers mocked).
- All 13 SQL suites pass against production schema inside rolled-back transactions: staff permissions, tenant isolation, booking conflicts, membership verification, products, payments/waitlists and registration.
- Disposable real Auth account: confirmation token exchange, password login, idempotent free salon provisioning, service/customer/appointment persistence; fixtures removed.
- Owner profile updates remain possible. Direct salon creation, subscription escalation, trial reset and Stripe identifier changes are denied to ordinary authenticated users.
- Non-public administrative RPCs no longer executable anonymously.
- Pages deployment now requires the JavaScript regression suite to pass.
- Unavailable WhatsApp reminders removed from package lists; unsupported popularity claim replaced with factual team label.

## Release limits / launch gates
- Stripe remains TEST. No real payment acceptance or payout certification claimed.
- Supabase managed backup list is empty and PITR remains disabled. A separate encrypted logical backup now includes public/Auth/Storage schema and rows, Auth configuration and actual Storage files. Local restore verified 76 tables, 398 rows and 5 files; all 13 SQL suites passed. No production restore was attempted. Daily GitHub backup/restore workflow retains encrypted artifacts for 30 days; check its actual run before treating scheduling as verified.
- Auth entry points now pass a fresh Turnstile token directly to Supabase, including employee activation, staff/mailbox login, resend and recovery. Native enforcement must be verified after deployment. Leaked-password protection remains a separate setting.
- Real iOS/Android hardware, payment provider outages and a pilot salon's complete workday are not covered by these automated checks.
- Legal text and processing agreements need owner approval against actual business arrangements.

## Recovery procedure to complete
1. Obtain a supported database backup including Auth and database schema/data; store credentials and exports privately, never in this repository or Pages artifacts.
2. Back up Storage objects separately if used; database backups contain object metadata, not uploaded file content.
3. Restore into an isolated Supabase project; configure test-only external integrations and disable outgoing customer messages.
4. Verify owner and staff access, salon isolation, appointment counts, customers, products/stock and payment reconciliation. Record restore duration and backup timestamp.
5. Agree recovery point/time targets, retention and a recurring backup verification owner. Only mark recovery ready after this succeeds.

## Regression commands
Run each tests/check-*.cjs and tests/check-*.mjs with Node 22.
SQL tests must run in transactions that roll back; several files need an outer BEGIN/ROLLBACK wrapper.
scripts/test-registration-live.py creates and cleans isolated fixtures; requires local Supabase CLI authorization.
scripts/test-registration-mail.py additionally exercises actual confirmation and recovery email using a temporary routing alias; requires refreshed Wrangler OAuth.

## Recovery operations
The backup workflow runs daily at 02:17 UTC (GitHub schedules can be delayed). Backup includes actual uploaded objects, not only Storage metadata. Artifacts are encrypted with a separate Fernet key held in GitHub Actions secrets and a restricted local private directory. Never commit the key, plaintext backup or Auth configuration.

Download an encrypted artifact from Actions and run scripts/test-backup-restore.py with KRONR_BACKUP_KEY and local PostgreSQL binaries. The script only creates a new localhost cluster, restores every table and file, checks exact record equality, runs all SQL suites and stops/removes the cluster. It does not call customer-facing mail or payment providers. The report explicitly distinguishes this database/file rehearsal from running a complete restored Supabase Auth/Storage service. A real project replacement also requires restoring Auth configuration and uploading the files through Storage, then switching application credentials and worker bindings.

The daily job uploads the encrypted backup before rehearsing recovery, so a failed rehearsal does not discard the newest backup. Workflow failures appear in GitHub Actions; delivery of notification emails depends on the owner's GitHub notification preferences. Retain a separately protected copy of the decryption key for disaster recovery. Stripe configuration is unchanged and remains test-only.
