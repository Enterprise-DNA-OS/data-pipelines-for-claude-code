# Record controls and their sources

Checked 8 November 2026. The checks support an operator's review. They do not certify legal compliance, prove data accuracy or decide what a business may retain. The seven finding codes are local controls informed by the sources below. The laws do not prescribe these specific field names or numerical intervals.

| Code | Check | Source or policy |
|---|---|---|
| OWNER | Missing accountable owner | Local operating policy |
| PURPOSE | Personal-data feed without a recorded purpose | NZ information privacy principle 1, lawful and necessary collection |
| RETENTION | Personal-data feed without a configured retention period | NZ information privacy principle 9 |
| REVIEW | Missing or overdue personal-data policy review | Local review policy supporting principles 5, 8 and 9 |
| FRESHNESS | Enabled feed has never succeeded or source timestamp exceeds its SLA | Local accuracy control supporting principle 8 |
| VALIDATION | Latest recorded attempt was rejected | Local completeness and format control supporting principle 8 |
| RETENTION_DUE | Destination records exceed the configured review age | Local retention review trigger supporting principle 9 |

Sources: [Principle 1](https://www.privacy.org.nz/privacy-principles/1/), [Principle 5](https://www.privacy.org.nz/privacy-principles/5/), [Principle 8](https://www.privacy.org.nz/privacy-principles/8/), [Principle 9](https://www.privacy.org.nz/privacy-principles/9/).

The retention interval is an operator decision, not a legal default. The demo uses fictional policies. /retention-review reports both current records and before/after history by creation age. A refresh does not reset their age. Review package inventories, source files, exports, drafts, activity and database backups too. There is no automatic deletion. A retention disposal process needs separate authorisation and a tested scope.

The importer checks shape and configured types. It cannot prove the source is correct. /reconcile compares each source key and content against the current destination, including keys missing from the file. The operator must compare the source system's own counts and business totals.

Tables enable row-level security and revoke PUBLIC privileges without creating anonymous policies. The database owner can still access all records. This is an administrator-operated base with no end-user authentication or tenant separation. Use a private deployment, scoped roles, appropriate encryption, access review and tested backups. Never publish generated reports containing real data. Brand and HTML escaping tests do not replace access controls.

For an Australian installation, assess the applicable Privacy Act and Australian Privacy Principles with the business. This base does not claim to encode all jurisdictional obligations.
