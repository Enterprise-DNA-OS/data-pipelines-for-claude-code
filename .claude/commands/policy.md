---
description: Record the purpose, owner and retention review policy
---

Read CLAUDE.md. Resolve the operator's real reference and inputs, then run:

```bash
npm run pipe -- policy --ref="<pipeline>" --owner="<owner>" --purpose="<purpose>" --retention-days=<days> --review-on=<YYYY-MM-DD> --sla-hours=<hours> --personal-data=true --actor="<operator>"
```

Add --json when you need structured results. Never run angle-bracket placeholders literally. List ambiguous candidates for the operator. 

Report the result and any unresolved issue in plain language. Do not invent missing evidence.
