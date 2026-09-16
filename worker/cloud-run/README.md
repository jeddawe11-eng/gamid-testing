# Cloud Run TESTING deployment plan

Status: prepared, **not provisioned**. Mazen approved Google Cloud Run Jobs in
`asia-southeast1`, but Google account, project, billing, and OAuth authorization
are not available in the current Work environment.

## Secure trigger boundary

```text
authenticated browser
  -> private Supabase source upload + owner RPC creates pending row
  -> Supabase pg_net trigger reads URL/secret from Vault
  -> scale-to-zero Cloud Run dispatcher validates INSERT + shared secret
  -> dispatcher runtime service account invokes one Cloud Run Job execution
  -> worker claims a server-authorized pending row with SKIP LOCKED
  -> private source -> D3 -> validation -> private derivative -> atomic READY
```

The dispatcher ignores owner, Profile, and media paths in the webhook. It only
accepts a pending INSERT from the exact table and asks Google to execute the
fixed Job. The worker obtains the actual job and authorized paths from the
service-role-only database RPC. Duplicate dispatches are safe: row locking
allows only one worker to claim a given pending row.

The dispatcher endpoint is IAM-public solely because Supabase cannot mint a
Google identity token. It is application-authenticated with a high-entropy
shared secret stored in Supabase Vault and Google Secret Manager. Invalid or
stale requests cannot start a paid Job. The dispatcher uses its attached Google
service account through the metadata server, so there is no Google private key.

## Exact Google Cloud resources

Names are fixed unless the chosen Google project already contains a collision:

| Resource | Name / configuration |
| --- | --- |
| Region | `asia-southeast1` |
| Artifact Registry Docker repository | `gamid-workers` |
| Worker runtime service account | `gamid-intro-worker` |
| Dispatcher runtime service account | `gamid-intro-dispatcher` |
| Secret Manager secret | `gamid-supabase-secret-testing` |
| Secret Manager secret | `gamid-dispatch-secret-testing` |
| Cloud Run Job | `gamid-intro-worker-testing` |
| Cloud Run service | `gamid-intro-dispatcher-testing` |

Required APIs only:

- Cloud Run Admin API (`run.googleapis.com`)
- Artifact Registry API (`artifactregistry.googleapis.com`)
- Cloud Build API (`cloudbuild.googleapis.com`)
- Secret Manager API (`secretmanager.googleapis.com`)

Initial Job allocation:

- 1 task per execution, concurrency inherently 1
- 2 vCPU
- 2 GiB RAM
- 10-minute task timeout
- 1 retry
- no GPU, VPC connector, persistent disk, minimum instance, or always-running
  worker

The 2 GiB allocation is conservative headroom for a source capped at 100 MiB,
decoded frames, FFmpeg, Node, and the output. It can be reduced only after
Cloud Monitoring shows safe peak memory on real TESTING uploads.

The dispatcher is a scale-to-zero Cloud Run service with 1 vCPU, 256 MiB RAM,
concurrency 20, minimum instances 0, and maximum instances 2. It performs no
media work and does not receive the source file.

## Least-privilege IAM

- `gamid-intro-dispatcher` receives `roles/run.invoker` on the single
  `gamid-intro-worker-testing` Job only.
- `gamid-intro-dispatcher` receives `roles/secretmanager.secretAccessor` on
  `gamid-dispatch-secret-testing` only.
- `gamid-intro-worker` receives `roles/secretmanager.secretAccessor` on
  `gamid-supabase-secret-testing` only.
- Neither runtime account receives project Editor/Owner, Cloud Run Admin,
  Storage Admin, or Service Account Key Admin.
- `allUsers` receives Cloud Run Invoker on the dispatcher service only; the
  in-app shared-secret check remains mandatory.
- No service-account JSON key is created. Cloud Run supplies short-lived
  credentials through its metadata server.

## Container deployment shape

The same image is used by both resources:

- Job default command: `node intro-worker.mjs once`
- Dispatcher command override: `node intro-dispatcher.mjs`

The worker receives `GAMID_SUPABASE_URL` as ordinary configuration and
`GAMID_SUPABASE_SERVICE_ROLE_KEY` from Secret Manager. The dispatcher receives
project/region/job names as ordinary configuration and
`DISPATCH_SHARED_SECRET` from Secret Manager.

For new Supabase key architecture, prefer a dedicated rotatable backend secret
key named for this worker instead of reusing an unrelated server key. It still
bypasses RLS and must remain confined to the worker.

## Supabase trigger activation

`supabase-dispatch-trigger.sql` is intentionally not in the migrations folder
and has not been applied. Activation order after Google deployment:

1. Create a random dispatch secret locally without printing it.
2. Add identical secret values to Google Secret Manager and Supabase Vault.
3. Add the dispatcher HTTPS URL to Supabase Vault.
4. Apply the reviewed trigger SQL to TESTING.
5. Queue one controlled TESTING upload and verify pg_net response, Job logs,
   READY state, D3 validation, active media, and source cleanup.
6. Only then deploy the YOUR INTRO frontend to GitHub Pages.

The trigger uses asynchronous `pg_net`; a transient dispatch failure leaves the
private source and pending row intact. TESTING operations must monitor failed
pg_net responses and may re-run the fixed Job manually to drain pending work.
A production retry/dead-letter policy remains a later Production media decision.

## Mazen authorization prerequisite

Before any command can create these resources, Mazen must:

1. Sign in to Google Cloud with the account that will own GamID TESTING.
2. Select or create one dedicated Google Cloud project and provide its **project
   ID** (not a password or key).
3. Link an active Cloud Billing account to that project. Billing is required
   even when free-tier credits may cover usage.
4. Authorize the Google Cloud CLI/browser flow for that project, or grant the
   executing identity the narrowly required setup permissions.

No resource, API, IAM binding, secret, image, Job, service, webhook, or billing
budget has been created yet.
