# Data Pipelines for Claude Code: operating instructions

This is a file-transfer desk for an operator who owns scheduled business feeds. It runs CSV snapshots into a database, validates mappings, records changes and prepares review evidence. The fictional Kauri Data Operations demo is not customer data.

Read current data before answering. Use one CLI, npm run pipe. Claude Code, Codex, OpenCode and Cursor share the same commands. Never invent a cause, count or successful transfer.

## Routing

- /pipelines: List the transfer register.
- /morning-check: Find late feeds and rejected transfers.
- /failures: Review rejected transfer attempts.
- /reconciliation: Review source and destination run totals.
- /schema-review: Inspect the current column mappings.
- /retention-review: Review records and change history past their configured age.
- /compliance: Check ownership, purpose, freshness and retention evidence.
- /owner-load: Compare overdue pipelines by accountable owner.
- /changes: Read the before and after values from applied transfers.
- /activity: Read the attributed operations log.
- /actions: Review follow-ups and due dates.
- /help: List the supported CLI commands.
- /show: Read one pipeline and its history.
- /weekly-review: Prepare the weekly data operations meeting.
- /add: Register a pipeline from a reviewed definition.
- /configure: Apply a reviewed mapping revision.
- /policy: Record the purpose, owner and retention review policy.
- /pause: Pause transfers while investigating a feed.
- /resume: Resume a checked pipeline.
- /log: Add an attributed operating note.
- /add-action: Assign a dated follow-up.
- /close-action: Close a follow-up with evidence.
- /import: Bring across a sanitised Integrate.io package inventory.
- /export: Export all records and provenance to a new file.
- /validate: Check an incoming file without saving anything.
- /sync: Validate and apply an incoming snapshot.
- /reconcile: Compare an incoming snapshot with current destination records.
- /draft-handover: Draft the internal pipeline handover.
- /draft-incident: Draft an internal transfer incident record.
- /view: render read-only dashboards.
- /docs: render handover and reconciliation records.
- /customise: add a migration, update the CLI and tests, then apply it.
- /new-view: add a read-only query to views.json and render it.

## Operating rules

Run npm run demo only in a disposable demo database. DATABASE_URL selects PostgreSQL, otherwise DATA_DIR selects local PGlite. The CLI is for a trusted administrator, not a public service. Do not expose its database credentials to end users.

Start each new feed with /validate or /sync in dry-run mode. A source timestamp is the time of the source snapshot, not the time you want a stale file to appear fresh. Record the true operator with --actor. Keep the original source file outside version control.

No transfer deletes records missing from an incoming file. /reconcile reports these records separately. A key change needs a new pipeline and reconciliation. Always inspect the whole validation result before changing a mapping. An imported Integrate.io package is metadata for migration planning, not executable code.

Never send, publish, provision a cloud connector or delete data from these commands. Drafts stay in drafts. Package exports must be sanitised before import. Never commit source data, exports or credentials. Production access rules, isolation, backups and restore checks require installation work. See docs/compliance.md.

Migrations live in supabase/migrations. Do not edit an applied migration. Test a new one on a disposable database before applying it to working data. npm test must pass before shipping a change.

Omni by Enterprise DNA installs and runs your version. https://enterprisedna.co/omni/instead-of/integrate-io
