# Cloud Runner Control Plane

Status: Milestone 6 skeleton.

## Purpose

The cloud runner control plane is the server-side model for dispatching user project jobs into isolated runner environments. It is separate from the local Docker development adapter and separate from EAS builds of Codex Mobile itself.

## Provider Modes

```bash
CLOUD_RUNNER_PROVIDER=fake
CLOUD_RUNNER_PROVIDER=none
CLOUD_RUNNER_PROVIDER=aws-fargate
CLOUD_RUNNER_PROVIDER=gcp-cloud-run-jobs
CLOUD_RUNNER_PROVIDER=fly-machines
CLOUD_RUNNER_PROVIDER=kubernetes
```

Only `fake` is implemented. Future provider names are reserved and must fail honestly until implemented.

## Implemented Skeleton

- provider-neutral cloud runner interface,
- in-memory job dispatcher,
- quota policy,
- audit log store,
- artifact store,
- cleanup policy,
- dev auth policy.

Default limits:

- max jobs per session: 20
- max concurrent jobs: 2
- max duration: 120000 ms
- max workspace bytes: 52428800
- max artifact bytes: 10485760

## Secrets Handling

Cloud credentials, artifact storage credentials, service account JSON, GitHub App credentials, and installation tokens must stay server-side. They must not be returned to mobile, stored in Expo public config, or emitted in logs/events/errors.

## Production Requirements Before Claiming Cloud Sandbox Support

- authenticated production API,
- durable database-backed job records,
- provider-specific isolated execution adapter,
- object storage with signed artifact URLs,
- network and filesystem isolation,
- quota and abuse controls,
- cleanup workers,
- audit log persistence,
- observability and alerting,
- incident and data deletion process.

## App Store / Play Store Review Posture

The phone edits app-workspace files and user-selected documents. Heavy builds/tests run runner-side. The mobile app does not expose a local terminal for arbitrary project commands and does not execute arbitrary downloaded code on device.
