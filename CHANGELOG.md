# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] — unreleased

### Added

- `createChiplog({ sink })` — one wide event per flow, handed to a sink you provide.
- `run()` / `runSync()` / `wrap()` — failure attribution is automatic; a flow that
  throws can never report `ok`.
- Ambient `stage()`, `set()`, `correlationId()`, `traceparent()` backed by
  `AsyncLocalStorage`, so no context has to be threaded through call signatures.
- Nested flows: child events share the correlation id and carry `parentFlowId`.
- W3C `traceparent` in and out — no bespoke carrier format.
- Bounded output: stage cap with first/last retention and a `droppedStages` count,
  plus depth, width and string limits on every recorded value.
- `redact` hook and the `redactKeys()` helper.
- Reserved-key collisions from `set()` are reported in `shadowedFields` rather
  than dropped silently.
- `chiplog/hono` adapter.
