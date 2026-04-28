# ADR 0005: Cloud Runner Control Plane

Status: accepted for Milestone 6 skeleton.

## Context

Local Docker is useful for development, but a publishable mobile coding-agent app needs production runner infrastructure with authenticated dispatch, quotas, audit logs, artifact storage, cleanup, and provider adapters. The phone must remain a client and must not run arbitrary user-project commands locally.

## Decision

Add provider-neutral runner control-plane interfaces in `services/mobile-runner`:

- cloud runner provider,
- job dispatcher,
- quota policy,
- audit log store,
- artifact store,
- cleanup policy,
- auth policy shell.

The default provider remains fake/local. Future provider names are reserved for AWS Fargate, Google Cloud Run Jobs, Fly Machines, and Kubernetes, but they are not implemented in this milestone.

## Consequences

- The runner can model durable job records, limits, audit events, and artifact constraints without deploying paid infrastructure.
- App Store and Play Store review posture remains conservative: EAS builds the mobile app, while runner-side infrastructure runs user project jobs.
- Production claims stay gated until a real provider is implemented, tested, monitored, and documented.

## Not Implemented Yet

- Production multi-tenant auth.
- Provider-specific dispatch adapters.
- Durable database persistence.
- Object storage with signed URLs.
- Per-user billing/abuse controls.
- Production observability and incident response.
