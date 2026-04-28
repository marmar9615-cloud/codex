import type { GitAuditEvent } from "@codex/mobile-protocol";

export class InMemoryAuditLogStore {
  private events: GitAuditEvent[] = [];
  private nextEvent = 1;

  record(event: Omit<GitAuditEvent, "id" | "createdAt"> & { createdAt?: string }, now: () => string): GitAuditEvent {
    const stored: GitAuditEvent = {
      id: `audit_${this.nextEvent.toString().padStart(4, "0")}`,
      createdAt: event.createdAt ?? now(),
      ...event,
    };
    this.nextEvent += 1;
    this.events.push(stored);
    return stored;
  }

  list(sessionId?: string): GitAuditEvent[] {
    return sessionId ? this.events.filter((event) => event.sessionId === sessionId) : [...this.events];
  }
}
