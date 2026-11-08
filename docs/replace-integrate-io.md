# Bring your Integrate.io records across

This base replaces a defined file-to-database workflow. It does not execute proprietary Integrate.io packages or reproduce its connector catalogue. A package inventory and a working data transfer are separate steps.

## Export the package

Integrate.io documents package JSON export from the package editor's Import/Export menu. Save and validate the package first. Source Control must be enabled on the account and your role must allow package editing. Group permissions still apply. Ask the vendor to enable Source Control if the export is unavailable.

The export contains component settings and package variables. Remove credentials and variables before bringing it here. Keep source exports outside version control. The importer rejects nonempty variables and credential-labelled fields. That check does not prove a file contains no secret, so inspect and sanitise it first.

[Vendor export instructions](https://www.integrate.io/docs/etl/how-do-i-import-or-export-a-packages-json-source-code), checked 8 November 2026.

## Import inventory in one command

Inspect the exported structure. Create a JSON-pointer map for name, version and components. fixtures/package.json is a synthetic example, not a claimed vendor schema. fixtures/package-map.json demonstrates the map. The importer saves the chosen name, version, component identifiers and types, plus a source checksum. It intentionally discards component settings, variables and other metadata. It does not carry schedules, credentials, logs or past execution results.

```bash
npm run pipe -- import integrate-io --file=imports/sanitised-package.json --map=imports/package-map.json --actor="Your name" --dry-run
npm run pipe -- import integrate-io --file=imports/sanitised-package.json --map=imports/package-map.json --actor="Your name"
```

Repeated identical exports do not create duplicate inventory records. New versions have their own checksum and row. No source code or expressions are executed.

## Configure the data transfer

Use fixtures/pipeline-definition.json as the example for /add. Map the source CSV columns explicitly with a required text key, text, integer, decimal, date or boolean fields. Decimal values remain strings to preserve decimal precision. No formula or SQL expression in an input is evaluated. Unknown columns fail validation. The importer does not infer a safe conversion from a proprietary connector.

```bash
npm run pipe -- add --file=fixtures/pipeline-definition.json --actor="Your name"
npm run pipe -- validate --ref=NEW_ORDERS --file=fixtures/orders.csv --as-of=2026-11-03T09:00:00Z
npm run pipe -- sync --ref=NEW_ORDERS --file=fixtures/orders.csv --as-of=2026-11-03T09:00:00Z --actor="Your name"
npm run pipe -- reconcile --ref=NEW_ORDERS --file=fixtures/orders.csv --as-of=2026-11-03T09:00:00Z
```

Use the real snapshot timestamp when transferring your own data. These example dates belong to the fictional fixtures. The all-or-nothing validation pass rejects malformed fields, duplicate keys, missing values and unmapped columns. Every successful input row is counted as inserted, changed or unchanged. A rejected attempt records issues but does not change destination data. A storage failure rolls back the whole attempt. Older snapshots cannot overwrite newer ones. Different content cannot reuse an already accepted snapshot timestamp.

## What maps and what needs work

The source CSV becomes keyed JSON records inside the owned database. A repeat transfer updates existing keys and records changed values. It never deletes keys missing from the incoming file. Reconciliation reports absent keys, new keys and changed values. Destination record totals can exceed the current file's count for that reason.

External database extraction, cloud authentication, live change capture, transformations beyond field typing, large-volume streaming, reverse delivery, hosted scheduling and alerts require a scoped integration. The current command runs one file at a time in memory. A host scheduler can invoke it after an authorised source export has arrived. Do not schedule against an unchanging file and give it a fresh timestamp.

## Switch acceptance

Import one sanitised package inventory. Rebuild and review one mapping. Run a test file, reconcile counts and sampled values, inspect failures and retain the source checksum. Run both workflows through representative cycles before retiring the old one. Decide how to operate every external connection, permission, retention policy and restore procedure first.

A file workflow can be configured in a day when its mapping is ready. A whole Integrate.io estate requires a separate assessment. Enterprise DNA brings the records across and builds the missing connections in the installed version, for a setup fee, then a retainer through Omni by Enterprise DNA.

## Export and recovery

npm run pipe -- export --file=exports/backup-unique-name.json exports pipelines, runs, current records, before/after history, package inventories, actions and activity in one consistent database snapshot. It refuses an existing filename. Keep it private. This is an inspection export, not an automated restore command. Use the database's backup facilities and test a restoration before relying on working data.

The local transfer command accepts files up to 32 MiB. Larger feeds need a separately tested streaming integration.
