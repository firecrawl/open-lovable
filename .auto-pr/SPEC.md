# Spec: Add unit tests for lib/build-validator.ts

## Problem
`lib/build-validator.ts` exports several functions used throughout the generation pipeline but has zero test coverage. The pure helper functions (`extractMissingPackages`, `classifyError`, `calculateRetryDelay`) are entirely side-effect-free and trivially testable.

## Acceptance criteria
- [ ] `extractMissingPackages` correctly parses all three error message patterns
- [ ] `classifyError` maps error messages to the right `ErrorType`
- [ ] `calculateRetryDelay` returns expected delays for each error type and attempt number
- [ ] `validateBuild` is covered via a mocked `fetch` (success path + error paths)
- [ ] Tests run via `bun test` with exit code 0

## Approach
1. Create `lib/build-validator.test.ts` using Bun's built-in test runner (`bun:test`)
2. Use `mock.module` / `spyOn` for the `fetch` calls in `validateBuild`
3. No new npm dependencies required

## Files touched
- `lib/build-validator.test.ts` (new)
- `package.json` — add `"test": "bun test"` script

## Risk / blast radius
Zero — test-only addition, no production code changes.

## Test plan
- `bun test lib/build-validator.test.ts` must pass all assertions
