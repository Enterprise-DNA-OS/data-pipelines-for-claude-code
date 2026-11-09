# Data Pipelines for Claude Code

Repeatable file-to-database transfers, validation, change history and reconciliation in a database your business owns.

| Do it yourself | We customise it | We run it for you |
|---|---|---|
| Free, MIT. Install and run the fictional demo. | Your source fields, transfer rules, connections and reports. | Installed and operated through Omni by Enterprise DNA. A setup fee, then a retainer. |

[Get your version built](https://enterprisedna.co/omni/book/?offer=replace-software&utm_source=github&utm_medium=readme&utm_campaign=integrate-io) · [Instead of Integrate.io](https://enterprisedna.co/omni/instead-of/integrate-io?utm_source=github&utm_medium=readme&utm_campaign=integrate-io)

## What this replaces

The internal desk for repeatable file-to-database feeds: inspect what is late, validate the whole file, apply accepted records, compare counts and follow up failures. It works with Claude Code, Codex, OpenCode or Cursor. There is no application front end.

Integrate.io Core lists US$1,999 per month billed annually, or US$23,988 before tax. That is list pricing, not a customer invoice. The managed platform includes services beyond this free base. [Vendor pricing](https://www.integrate.io/pricing/), checked 8 November 2026.

The free implementation runs CSV snapshots into keyed database records. Proprietary connectors, live change capture, managed scheduling and external delivery need an installed integration. Assess the entire workflow before cancelling a managed service.

## Quick start

Node 20 or later.

```bash
git clone https://github.com/Enterprise-DNA-OS/data-pipelines-for-claude-code.git
cd data-pipelines-for-claude-code
npm install
npm run demo
npm run pipe -- morning-check
npm run view
npm run docs
```

Local PGlite stores the database under .data/db. DATA_DIR changes it. DATABASE_URL selects PostgreSQL. npm run migrate applies numbered migrations. Never seed a real database. Shared PostgreSQL seeding requires --demo-database explicitly.

The fictional Kauri Data Operations demo has overdue order and stock feeds, a rejected quantity, a missing owner and purpose, overdue review dates and retained returns. Dates are relative to the first seed. Seeding twice preserves existing rows.

## The operating week

Start with /morning-check, /failures, /reconciliation, /schema-review and /retention-review. /weekly-review combines five queries into a meeting pack. /owner-load shows who owns overdue feeds. /actions keeps follow-ups visible. /compliance runs seven sourced record checks, with policy settings explained in docs/compliance.md.

Every transfer checks all rows before applying any. Malformed CSV, invalid dates, duplicate keys, empty input and unmapped columns reject the batch. Current records remain unchanged. The successful counts satisfy input = inserted + changed + unchanged. Before/after values are kept for changed records. A repeat identical input changes no business values. Older snapshots cannot overwrite newer ones, and different content cannot reuse the same accepted source timestamp. Missing keys are retained and reported by /reconcile, never silently deleted.

## Ten questions answered today

These are demonstrated capabilities, not claims that the vendor cannot answer them.

1. Which enabled feeds are late or rejected? /morning-check
2. Who owns the most overdue feeds? /owner-load
3. Which attempted transfers failed validation? /failures
4. Did each accepted input record insert, change or remain unchanged? /reconciliation
5. Which incoming fields map to each destination field? /schema-review
6. What exactly changed in a transferred record? /changes
7. Which records and history exceed our configured review age? /retention-review
8. Which personal-data feeds lack purpose or retention evidence? /compliance
9. Which follow-ups are still open and who owns them? /actions
10. Does this incoming file match the destination, including records absent from the file? /reconcile

## Bring your records

Integrate.io documents package JSON export, subject to Source Control and editing permission. The one-command import records a sanitised package inventory using an explicit pointer map. It does not convert connector expressions. The fixtures are synthetic examples. Follow [the switching guide](docs/replace-integrate-io.md), then register a reviewed CSV mapping.

```bash
npm run pipe -- import integrate-io --file=fixtures/package.json --map=fixtures/package-map.json --actor="Your name" --dry-run
npm run pipe -- add --file=fixtures/pipeline-definition.json --actor="Your name"
npm run pipe -- validate --ref=NEW_ORDERS --file=fixtures/orders.csv --as-of=2026-11-03T09:00:00Z
npm run pipe -- sync --ref=NEW_ORDERS --file=fixtures/orders.csv --as-of=2026-11-03T09:00:00Z --actor="Your name"
npm run pipe -- reconcile --ref=NEW_ORDERS --file=fixtures/orders.csv --as-of=2026-11-03T09:00:00Z
```

Use the source's true timestamp for working data. All commands accept --json. Reads match exact codes, case-insensitive names and id prefixes, and list candidates with exit code 1 when ambiguous. Mutations require the operator's name. This is a trusted administrator's tool, not an end-user permissions service.

## Commands

29 CLI commands and 33 slash recipes. The command index lives in CLAUDE.md. /add, /configure and /policy change the feed definition. /log, /add-action and /close-action retain attributed evidence. /pause and /resume control transfers. /export writes a consistent JSON snapshot to a new private file. /draft-handover and /draft-incident write HTML to drafts. Nothing sends.

## Paperwork and views

Edit brand.json once. npm run docs creates an internal handover and transfer reconciliation record for every pipeline. npm run view renders the week and control findings as read-only HTML. The shared renderer escapes data and uses your business name, logo and colours. The reports are internal records, not legal certificates. See [the scope of the base](docs/why-no-front-end.md).

## Your first hour: ten things to ask for

1. Put our business name and colours on the handover.
2. Show the feeds that missed their source deadline.
3. Test our first file without saving it.
4. Map our existing source identifiers.
5. Add an optional warehouse field.
6. Set our actual freshness interval.
7. Record why we retain personal information.
8. Compare incoming values with the destination.
9. Give each unresolved error an owner and due date.
10. Add our sign-off wording to the transfer record.

/customise writes a numbered migration, tests it and applies it. /new-view adds a read-only report. External extraction, scheduling, access roles, backups and retention disposal are installation work.

## Verification

npm test uses a temporary database, seeds twice and exercises all 29 CLI commands. It checks atomic rollback, rejected inputs, repeated files, source timestamps, reconciliation, changes, imports, ambiguous references, JSON exit codes, exports and rendered documents. TEST_DATABASE_URL supports an empty disposable PostgreSQL database. The manual CI workflow covers Linux, Windows and PostgreSQL. A workflow file is not proof of a passing run.

[Research and scoring](docs/research.md). MIT. Not affiliated with Integrate.io or Anthropic. Hosting and agent subscriptions have their own costs. Enterprise DNA installs your version for a setup fee, then runs it on a retainer through Omni by Enterprise DNA. [Book 30 minutes with Sam](https://enterprisedna.co/omni/book/?offer=replace-software&utm_source=github&utm_medium=readme&utm_campaign=integrate-io).

The local transfer command accepts files up to 32 MiB. Larger feeds need a separately tested streaming integration.
