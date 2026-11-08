---
description: Close a follow-up with evidence
---

Read CLAUDE.md. Resolve the operator's real reference and inputs, then run:

```bash
npm run pipe -- close-action --ref="<action id>" --evidence="<what was checked>" --actor="<operator>"
```

Add --json when you need structured results. Never run angle-bracket placeholders literally. List ambiguous candidates for the operator. 

Report the result and any unresolved issue in plain language. Do not invent missing evidence.
