# Authentication Improvement Plan: Ory Kratos

Status: proposed  
Scope: LOQA web account and Go API authentication  
Out of scope: offline license-token validation and the desktop app's local PIN lock

## 1. Outcome

Replace the Go API's ad hoc HS256 user JWT with Ory Kratos as the source of truth for identities, credentials, browser sessions, verification, recovery, and account settings.

The target experience is:

- A customer can register, verify an email address, sign in, sign out, recover access, and edit their profile from the LOQA web app.
- The web app and Go API use the same revocable Kratos session.
- The Go API authorizes every protected request using the Kratos identity ID, never a client-supplied user ID.
- Existing subscriptions remain attached to the correct customer during migration.
- License JWTs continue to support offline desktop use; they are not authentication sessions.

## 2. Current state and problems

The current Go API has an `internal/auth` middleware that accepts an HS256 bearer token containing numeric `user_id` and `email` claims. There is token-issuing code, but no complete login, registration, password storage, verification, recovery, refresh, logout, or revocation lifecycle. `JWT_SECRET` also defaults to a known development value.

The database already has a `users` table with numeric IDs, while subscriptions refer to `subscriptions.user_id`. Separately, the desktop products use RS256 license JWTs and an in-process PIN lock. These mechanisms solve licensing and local encryption respectively; neither should become a Kratos credential or session.

## 3. Proposed architecture

Use self-hosted Ory Kratos beside the Go API. Use browser flows and Kratos's HTTP-only session cookie for the Next.js site. Put the browser-facing Kratos public API behind the same site origin, for example `/auth/*`, so browser cookie and CORS behavior remain simple. Do not expose the Kratos Admin API publicly.

```text
Browser
  |-- /auth/self-service/* --> reverse proxy --> Kratos public :4433
  |-- /api/* --------------> reverse proxy --> LOQA Go API
                                                |
                                                | session cookie or token
                                                v
                                          Kratos /sessions/whoami
                                                |
                                                v
                                      authenticated identity UUID
                                                |
                                                v
                                      LOQA user + subscriptions

Private network only:
  LOQA admin/provisioning code --> Kratos admin :4434
  Kratos --> dedicated PostgreSQL database/schema
```

Kratos owns identity data and credentials. LOQA owns application data, subscriptions, payments, licenses, roles, and authorization policy.

### Session validation

For each protected API request, the Go middleware forwards either the Kratos session cookie (browser) or `Authorization: Bearer <session_token>` (non-browser client) to Kratos `GET /sessions/whoami`. A successful active session becomes a small request-scoped principal:

```go
type Identity struct {
    KratosID string
    UserID   uint
    Email    string
}
```

The middleware then resolves the Kratos UUID to the local user row. Handlers use this principal and must not accept ownership from request parameters. Return `401` for no/invalid session and `403` only when an authenticated identity lacks permission.

Start with direct `whoami` validation. Add a short cache only after measurement; if introduced, cap it at 30 seconds, never cache failures, and understand that it delays logout/revocation enforcement by the cache TTL.

### Browser integration

The Next.js app renders Kratos flow nodes rather than implementing credential rules itself. Pages required:

- `/login`
- `/registration`
- `/verification`
- `/recovery`
- `/settings`
- `/error`

The browser must initialize flows through their browser endpoints and submit the returned form action, method, fields, and CSRF token unchanged. API/AJAX flows are not a substitute for browser flows. Requests that need the session use credentials/cookies. Preserve only allow-listed relative return paths to avoid open redirects.

Password authentication is the phase-one method. Design the UI around generic Kratos nodes so passkeys, TOTP, or social sign-in can be enabled later without redesigning the API boundary.

## 4. Identity and application data model

Use this initial Kratos identity schema:

```json
{
  "$id": "https://loqa.id/schemas/customer-v1.json",
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "LOQA customer",
  "type": "object",
  "properties": {
    "traits": {
      "type": "object",
      "properties": {
        "email": {
          "type": "string",
          "format": "email",
          "maxLength": 320,
          "ory.sh/kratos": {
            "credentials": { "password": { "identifier": true } },
            "verification": { "via": "email" },
            "recovery": { "via": "email" }
          }
        },
        "name": {
          "type": "string",
          "minLength": 1,
          "maxLength": 120
        }
      },
      "required": ["email", "name"],
      "additionalProperties": false
    }
  }
}
```

Keep authorization fields such as role, subscription tier, and entitlement out of editable traits. They belong in LOQA tables.

Change the local `users` model as follows:

| Field | Change |
|---|---|
| `id` | Keep as the internal numeric primary key to avoid rewriting all foreign keys. |
| `kratos_identity_id` | Add UUID, nullable during migration, then unique and not null. |
| `email` | Keep as a display/contact snapshot; Kratos is authoritative for sign-in identity. |
| `name` | Keep as a query-friendly snapshot, updated from verified identity events or on login. |
| timestamps | Keep. |

Do not join subscriptions directly to email. Email can change; the Kratos UUID and local user ID are stable.

### Provisioning and consistency

Use an idempotent `ensureLocalUser(identity)` operation on the first authenticated request:

1. Look up `users.kratos_identity_id`.
2. If absent, create the local user in a transaction.
3. If a pre-migration user has the same normalized email, link it only through the controlled migration path described below; never silently account-link during an ordinary login.
4. Refresh non-security-critical `email` and `name` snapshots.

This makes a Kratos-after-registration webhook optional rather than availability-critical. If a webhook is later added for faster provisioning/audit, authenticate it, make it idempotent, and retry safely.

## 5. Deployment configuration

Add a Kratos service, migration job, and mail courier configuration to the deployment stack. Kratos should use a dedicated database (preferred) or at least dedicated database credentials and schema. Pin the container to an exact tested version; do not use `latest`.

Required configuration groups:

| Area | Requirement |
|---|---|
| URLs | Public base URL, browser UI URLs, allowed return URLs, and cookie domain must match each environment. |
| Secrets | Separate strong cookie and cipher secrets, injected by the secret manager. Never commit them. |
| Database | TLS in production, least-privilege account, automated backup, and migrations as a release job. |
| Courier | SMTP/provider credentials, branded verification and recovery templates, retry and bounce monitoring. |
| Sessions | Secure, HTTP-only cookie; `SameSite=Lax` for same-site deployment; production HTTPS only. |
| Flows | Password login/registration, email verification and recovery, settings, logout, CSRF protection. |
| Exposure | Public port reachable only through the proxy; admin port reachable only from trusted backend/admin workloads. |
| Observability | Structured logs and metrics with secrets, cookies, flow payloads, and recovery codes redacted. |

Environment variables for the Go API should become:

- `KRATOS_PUBLIC_URL`: internal URL used for `whoami`.
- `KRATOS_ADMIN_URL`: optional private URL for controlled migration/support operations.
- `KRATOS_HTTP_TIMEOUT`: short validation timeout, initially 2 seconds.
- `AUTH_MODE`: temporary `legacy`, `dual`, or `kratos`; remove after migration.

Remove `JWT_SECRET` after the legacy path is retired. Keep `LICENSE_PRIVATE_KEY`; it has a separate purpose.

## 6. Delivery plan

### Phase 0 — decisions and threat model

- Confirm the production web/API origins and proxy topology.
- Confirm email delivery provider and sender-domain readiness.
- Record session lifetime, privileged settings-session age, password policy, and support recovery procedure.
- Decide whether unverified users may enter the app. Recommended: require verification before subscription checkout and other account-changing operations.
- Identify every endpoint that is customer, admin, webhook, or public; apply authentication and authorization deliberately to each group.

Exit: reviewed architecture, endpoint inventory, and deployment ownership.

### Phase 1 — Kratos development environment

- Add pinned Kratos and Postgres services plus a one-shot `kratos migrate sql` job.
- Add the `customer-v1` identity schema and environment-specific Kratos config.
- Configure password, verification, recovery, settings, logout, cookies, CSRF, and a local mail catcher.
- Add proxy routes for the public API while proving the admin API is unreachable externally.
- Document secret generation and rotation; add CI validation for Kratos config and schema.

Exit: all self-service flows work manually in a local environment and email messages appear in the mail catcher.

### Phase 2 — Go API authentication adapter

- Preserve the existing `auth.Middleware` boundary but replace the implementation with a Kratos client.
- Forward cookie/session token to `whoami`, validate `active`, require an identity ID, and set the request principal.
- Add `kratos_identity_id` and the idempotent local-user resolver.
- Add explicit authorization checks so subscription/device operations can access only resources belonging to the principal. Admin operations must use a separate role/policy, not merely any valid session.
- Apply timeouts, bounded connections, generic client errors, and structured internal error reasons.

Exit: API tests cover valid, missing, expired/revoked, malformed, Kratos-unavailable, wrong-owner, and admin-only cases.

### Phase 3 — Next.js self-service UI

- Build the six flow pages using a shared, generic Kratos-node renderer.
- Add a server-side session loader for protected pages and navigation state.
- Add logout and re-authentication handling; redirect `401` to login while preserving an allow-listed return path.
- Provide accessible field errors, loading behavior, expired-flow restart, duplicate-account messaging, and generic recovery responses that do not disclose account existence.
- Add rate-limit-friendly handling for login, registration, verification, and recovery.

Exit: browser tests pass for registration, verification, login, logout, recovery, settings/email change, CSRF rejection, and expired flow.

### Phase 4 — existing-user migration

There is no complete legacy credential store visible in this repository, so use account claiming rather than password migration:

1. Back up and export local users with normalized emails and ownership counts.
2. Create or invite a Kratos identity for each eligible user through the private Admin API, preserving the local user ID in the migration ledger—not in editable identity traits.
3. Send a one-time recovery/invite flow so the customer sets a Kratos password and verifies the address.
4. On completion, transactionally set `users.kratos_identity_id`; reject duplicate or ambiguous normalized emails for manual review.
5. Keep a ledger with local user ID, Kratos UUID, state, attempt count, and timestamps so reruns are idempotent and auditable.

Run `AUTH_MODE=dual` only for a fixed migration window. In dual mode, legacy and Kratos authentication may establish a principal, but authorization and resource ownership must be identical. Do not issue new legacy JWTs after the cutover starts.

Exit: all active users are linked or explicitly queued for support; reconciliation reports no subscription reassignment.

### Phase 5 — production cutover and cleanup

- Deploy dark infrastructure, run synthetic flow checks, then enable UI entry points for an internal cohort.
- Track authentication success rate, `whoami` latency/error rate, email delivery, recovery completion, identity-link failures, and support volume.
- Progressively enable Kratos, with rollback by switching traffic/UI and `AUTH_MODE` while leaving schema additions intact.
- After the agreed observation window, set `AUTH_MODE=kratos`, remove HS256 issuance/validation and `JWT_SECRET`, then make `kratos_identity_id` non-null.
- Rotate any secret that was shared by the legacy implementation and update the API documentation/runbooks.

Exit: Kratos-only authentication, no legacy tokens accepted, and rollback window formally closed.

## 7. Security acceptance criteria

- Kratos Admin API is not reachable from the public internet.
- All production auth traffic and cookies use HTTPS; cookies are Secure and HTTP-only.
- CSRF tokens are enforced on browser flow submissions.
- Login, registration, verification, and recovery endpoints are rate-limited at the edge, with tighter per-identity/provider controls where available.
- Responses and logs do not reveal whether an email exists and never contain passwords, session cookies/tokens, recovery codes, or complete flow payloads.
- Changing password/email and other sensitive settings requires a recent privileged session.
- The Go API derives resource ownership exclusively from the authenticated principal.
- Webhooks retain their provider-specific authentication and never pass through customer-session middleware.
- License validation remains independent and cannot create a web user session.
- Backups and restore drills cover both Kratos and LOQA databases; restoration preserves the UUID mapping.

## 8. Test and operational checklist

Unit tests:

- Kratos response mapping and invalid/missing identity data.
- Local user creation, conflict handling, and snapshot updates.
- Authorization ownership and role checks.
- Return URL allow-listing and safe error mapping.

Integration tests:

- Go API against a real pinned Kratos container.
- Session cookie and session-token authentication.
- Session expiry and Admin API revocation becoming `401`.
- Kratos timeout/unavailability returning `503` (not a misleading `401`).
- Concurrent first requests create exactly one local user.
- Migration reruns do not duplicate or reassign users.

End-to-end tests:

- Register -> verify -> login -> view own subscription -> logout.
- Recover password and invalidate relevant old sessions according to policy.
- Change email -> verify -> snapshots synchronize without ownership change.
- User A cannot read or mutate user B's subscription or devices.
- Desktop license activation/validation remains unchanged.

Operational runbooks:

- Rotate Kratos cookie/cipher secrets using a tested staged procedure.
- Revoke one session or all sessions for an identity.
- Disable/re-enable an identity and preserve audit evidence.
- Diagnose email delivery and safely restart an expired flow.
- Reconcile Kratos identities, local users, and subscriptions.
- Roll back application traffic without rolling back destructive database migrations.

## 9. Rollout gates and targets

| Gate | Target |
|---|---|
| Availability | Authentication does not reduce API availability below the agreed service objective. |
| Validation latency | Measure first; initial target p95 `whoami` contribution below 100 ms on the private network. |
| Correctness | Zero unresolved duplicate mappings and zero ownership changes in migration reconciliation. |
| Security | No critical/high findings in auth threat-model review and penetration test. |
| UX | Registration, login, verification, and recovery completion rates have dashboards and alerts. |
| Recovery | Database restore and identity-to-user reconciliation are exercised before cutover. |

## 10. Review decisions

The following choices are intentionally left as review items, with defaults that let implementation proceed:

| Decision | Proposed default |
|---|---|
| Hosting | Self-host Kratos in the same private environment as the Go API. |
| Browser topology | Same-origin reverse proxy under `/auth`. |
| Initial methods | Email + password; email verification and recovery enabled. |
| Verification gate | Required before checkout/account mutations. |
| Local key strategy | Keep numeric `users.id`; add unique Kratos UUID mapping. |
| Provisioning | Idempotent just-in-time local user creation; webhook optional. |
| Migration | Admin-created identity/invite + account claim; no password import. |
| API validation | Direct `whoami`, no cache initially. |
| Failure behavior | Fail closed; `503` when Kratos is unavailable, `401` only for invalid sessions. |
| Future desktop account auth | Session token via native/API flows and OS keychain, designed separately; no browser cookie emulation. |

## 11. Implementation work items

- `AUTH-01`: deployment services, pinned version, database, migration job, mail catcher/provider.
- `AUTH-02`: Kratos config, customer identity schema, secrets, proxy, CI validation.
- `AUTH-03`: Go Kratos client, middleware, principal, error handling, tests.
- `AUTH-04`: local user UUID mapping, repository/service, constraints, reconciliation command.
- `AUTH-05`: endpoint authorization audit and ownership tests.
- `AUTH-06`: Next.js generic flow UI and server-side session loader.
- `AUTH-07`: verification/recovery email templates and delivery monitoring.
- `AUTH-08`: migration ledger, identity invitation/claim tooling, dry-run report.
- `AUTH-09`: dashboards, alerts, audit events, operational runbooks.
- `AUTH-10`: staged rollout, Kratos-only cutover, legacy JWT deletion.

Dependencies: `AUTH-01 -> AUTH-02 -> AUTH-03`; `AUTH-03 -> AUTH-04 -> AUTH-05`; `AUTH-02 -> AUTH-06/07`; all feed `AUTH-08/09 -> AUTH-10`.

## References

- [Ory Kratos session management](https://www.ory.sh/docs/kratos/session-management/overview)
- [Ory Kratos self-service flows](https://www.ory.sh/docs/kratos/self-service)
- [Ory identity schemas](https://www.ory.sh/docs/kratos/manage-identities/customize-identity-schema)
- [Ory Kratos API specification](https://github.com/ory/kratos/blob/master/spec/api.json)

