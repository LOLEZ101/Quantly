# Evidence Pipeline

```text
Raw filing/XBRL
→ filing sections + normalized facts
→ evidence candidates
→ source-backed profile fields
→ existing deterministic classifier
```

Candidates include segment percentages, franchise mix, manufacturing model phrases, named competitors, and XBRL metrics.

Candidates are not automatic final evidence. Promotion requires validation in `build-source-backed-profile.ts` and classifier evidence rules.
