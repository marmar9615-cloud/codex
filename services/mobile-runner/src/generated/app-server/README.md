# Codex App-Server Generated Types

This folder is reserved for generated TypeScript or JSON Schema emitted by the local Codex app-server binary.

The mobile runner bridge currently uses a small handwritten type surface for `initialize`, `thread/start`, `turn/start`, and the notifications it maps into mobile runner events. That keeps the MVP bridge narrow and avoids copying the full app-server schema into the mobile runner by hand.

To refresh generated protocol artifacts later:

```sh
CODEX_APP_SERVER_BIN=/absolute/path/to/codex pnpm --filter @codex/mobile-runner sync-app-server-types
```

The generated output is version-specific. Use the Codex binary from the same checkout or release that the runner is deployed with.
