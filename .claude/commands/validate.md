---
description: Check an incoming file without saving anything
---

Read CLAUDE.md. Resolve the operator's real reference and inputs, then run:

```bash
npm run pipe -- validate --ref="<pipeline>" --file="<source.csv>" --as-of=<UTC-source-timestamp>
```

Add --json when you need structured results. Never run angle-bracket placeholders literally. List ambiguous candidates for the operator. 

Report the result and any unresolved issue in plain language. Do not invent missing evidence.
