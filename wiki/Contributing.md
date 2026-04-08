# Contributing

## Development setup

```bash
git clone https://github.com/gridtech-is/scd-visualizer.git
cd scd-visualizer
npm install
npm run dev
```

For Python development, no extra packages are required. Python 3.10+ is sufficient.

---

## Running tests

```bash
# TypeScript
npm run test

# Python
python3 -m pytest tests/ -v
```

Always run both test suites before submitting a pull request.

---

## Adding a new validation check

### TypeScript

1. Add the check code and description to `src/validation/checkDescriptions.ts`
2. Implement the check logic in `src/validation/landsnet/checks.ts`
3. Add the check to the list in `src/validation/landsnet/runLandsnetValidation.ts`
4. Add a Vitest test in `src/validation/` or update an existing test file

### Python

1. Add the check function in `scd_validations.py`
2. Call it from `run_validations()` in the same file
3. Add an integration test in `tests/test_integration.py`

Use `LNET_` prefix for Landsnet-specific rules and `IEC_` prefix for general IEC 61850 rules.

---

## Adding a new parser field

When adding a new `Map` field to `SclModel`:

1. Add the type to `src/model/types.ts`
2. Parse the field in `src/parser/sclParser.ts`
3. Add `SerializedSclModel` entry, `serializeModel()` case, and `deserializeModel()` case in `src/workers/parseWorker.ts`

---

## Code style

- TypeScript: no CSS modules — all styles go in `src/styles.css`
- Validation issues must have `severity: 'error' | 'warn'` and a `fixHint` that is an actionable instruction (not "check rule X")
- Thresholds that may vary per site belong in `validation_config.json`, not hardcoded in source

---

## Pull request checklist

- [ ] All TypeScript tests pass (`npm run test`)
- [ ] All Python tests pass (`python3 -m pytest tests/ -v`)
- [ ] No TypeScript build errors (`npm run build`)
- [ ] New validation checks have descriptions in `checkDescriptions.ts`
- [ ] New `Map` fields in `SclModel` are handled in `parseWorker.ts`
