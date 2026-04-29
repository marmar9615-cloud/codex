# Codex Browser / Computer-Use QA Checklist

Status: optional manual/agentic QA. This does not replace `pnpm test:mobile:all`.

## Preconditions

- Runner is available locally:

```bash
pnpm --filter @codex/mobile-runner dev
```

- Expo is available locally:

```bash
pnpm --filter @codex/mobile exec expo start --localhost
```

- Browser, simulator, or device access is available.
- Use fake runner/Git providers unless explicitly testing gated live providers.

## Checklist

1. Open Codex Mobile in Expo web or a simulator/device.
2. Confirm Project List appears and does not claim broad phone filesystem access.
3. Create a sample project.
4. Confirm Editor appears with file tree and `src/App.tsx`.
5. Save the active file.
6. Open Agent Chat.
7. Start the fake agent job.
8. Confirm logs/messages stream and a patch becomes available.
9. Open Diff Review.
10. Apply the patch and confirm accepted state.
11. Re-run with a patch rejection path if practical.
12. Open Build Runner.
13. Run a safe fake test/build action.
14. Confirm logs, status, and artifact metadata appear.
15. Open Import.
16. Import the fake Git repository.
17. Open Git publish.
18. Commit to the feature branch.
19. Push the fake branch.
20. Prepare the PR plan and confirm deep-link metadata appears.
21. Open Settings/Auth.
22. Confirm ChatGPT/Codex production sign-in remains gated.
23. Confirm GitHub copy says server-side GitHub App and no mobile tokens.
24. Capture screenshots or notes only as QA artifacts, not committed binaries.

## Evidence File

Write manual results to:

```text
docs/mobile/qa-evidence/latest-computer-use-qa.md
```

Include:

- date/time,
- git commit,
- environment,
- exact app target used,
- pass/fail/skipped per checklist item,
- screenshots or artifact paths if captured outside git,
- exact failures and reproduction notes.

## Skip Rules

Skip honestly when browser/computer-use, simulator, emulator, Expo web, runner, or device access is unavailable. State the exact missing requirement.
