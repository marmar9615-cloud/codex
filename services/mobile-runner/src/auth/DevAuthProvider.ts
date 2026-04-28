import type { RunnerIdentity } from "@codex/mobile-protocol";
import type { RunnerAuthProvider } from "./RunnerAuth.js";

export class DevAuthProvider implements RunnerAuthProvider {
  authenticate(): RunnerIdentity {
    return {
      actorId: "dev-local-user",
      authMode: "dev",
      devMode: true,
    };
  }
}
