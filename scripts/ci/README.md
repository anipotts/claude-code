# CI debt ratchet

`debt-baseline.json` records fingerprints for inherited diagnostics on the
current `main` baseline. These are known debt, not successful checks:

- TypeScript diagnostics: 4,781
- Biome diagnostics: 13,319
- dependency advisories: 86

`bun run ci:debt-ratchet` reruns all three tools. Removing a recorded finding
is allowed; adding any unrecorded finding fails CI. This keeps the focused PR
gate useful without requiring unrelated repository-wide cleanup.

Only regenerate the baseline after reviewing the exact new diagnostics. The
capture command is intentionally not part of CI:

```sh
node scripts/ci/debt-ratchet.mjs capture
```
