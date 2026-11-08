---
description: Validate and apply an incoming snapshot
---

Read CLAUDE.md. Resolve the operator's real reference and inputs, then run:

```bash
npm run pipe -- sync --ref="<pipeline>" --file="<source.csv>" --as-of=<UTC-source-timestamp> --actor="<operator>" --dry-run
```

Add --json when you need structured results. Never run angle-bracket placeholders literally. List ambiguous candidates for the operator. Start with the dry run shown above. Inspect all issues and mapping assumptions. Within the operator's authorised task, repeat without --dry-run only after validation passes. Package import is an inventory, not a converted connector. Never execute package expressions.

Report the result and any unresolved issue in plain language. Do not invent missing evidence.
