# DEPLOY.md — ChurchFlow API CI/CD

How the backend is built and shipped to production. The frontend has its own
[DEPLOY.md](../church-app/DEPLOY.md) — they deploy independently.

---

## 1. Architecture at a glance

```
push to master
      │
      ▼
GitHub Actions (ubuntu-latest + QEMU → linux/arm64)
      │   build multi-stage Dockerfile
      │   push ghcr.io/japhethlg/churchflow-api:{latest, sha-<commit>}
      ▼
SSH to churchflow.crabdance.com
      │   scp deploy/docker-compose.yml → ~/church-api/
      │   render .env.production from GH secrets → ~/church-api/
      │   docker compose pull
      │   docker compose run --rm api npx prisma migrate deploy
      │   docker compose up -d
      ▼
Caddy (already running) routes
  api.churchflow.crabdance.com → 172.17.0.1:8002 → container :8000
```

Container talks to the existing `local-postgres` container via the
`local-postgres_default` Docker network.

---

## 2. Required GitHub Secrets

Set on `japhethLG/churchflow-api`. See [Secrets](https://github.com/japhethLG/churchflow-api/settings/secrets/actions).

| Secret | Example / source |
|---|---|
| `SSH_HOST` | `churchflow.crabdance.com` |
| `SSH_USER` | `ubuntu` |
| `SSH_PORT` | `22` |
| `SSH_PRIVATE_KEY` | contents of `~/.ssh/id_ed25519_deploy_churchflow` on the VPS |
| `DATABASE_URL` | `postgresql://postgres:<pw>@local-postgres:5432/church_app_prod?schema=public` (host = docker DNS name) |
| `FIREBASE_PROJECT_ID` | from Firebase service-account JSON |
| `FIREBASE_CLIENT_EMAIL` | from Firebase service-account JSON |
| `FIREBASE_PRIVATE_KEY` | from JSON, with `\n` kept as the two-char escape (the service unescapes at boot) |
| `GMAIL_USER` | sender Gmail address |
| `GMAIL_APP_PASSWORD` | Gmail app password (with quotes around spaces handled by workflow) |
| `GMAIL_FROM_NAME` | `ChurchFlow` |
| `APP_URL` | `https://churchflow.crabdance.com` |

The workflow templates these into `~/church-api/.env.production` on each
deploy. `PORT` is hard-coded to `8000` inside the container; the host
mapping (`8002:8000`) is in `deploy/docker-compose.yml`.

---

## 3. Files that drive the deploy

| Path | Purpose |
|---|---|
| `Dockerfile` | Multi-stage build (deps → builder → runner). `prisma generate` runs with a placeholder `DATABASE_URL` because `prisma.config.ts` reads it via `env()` at config load. |
| `.dockerignore` | Excludes `node_modules`, `.git`, env files, docs, etc. from the build context. |
| `deploy/docker-compose.yml` | What runs on the VPS. Joins `local-postgres_default` external network. Image pinned to `:latest`; restart unless-stopped. |
| `.github/workflows/deploy.yml` | The orchestrator. Triggers: push to `master`, manual `workflow_dispatch`. |

---

## 4. VPS layout

Pre-existing infra (managed outside this repo):
- Caddy in Docker at `~/caddy/` — handles 80/443, routes `api.churchflow.crabdance.com → 172.17.0.1:8002`.
- Postgres in Docker (`local-postgres`) — listens on host `5432`, also reachable as `local-postgres:5432` inside the `local-postgres_default` network.

Owned by this repo's deploys (written each run):
- `~/church-api/docker-compose.yml` — SCPed by workflow.
- `~/church-api/.env.production` — rendered from secrets by workflow.

Container:
- Name: `church-api`
- Image: `ghcr.io/japhethlg/churchflow-api:latest`
- Healthcheck: `GET http://localhost:8000/api/v1/health` (built into compose).

---

## 5. Common operations

### Trigger a deploy
```bash
git push origin master                # any commit on master triggers it
# or, without a code change:
gh workflow run Deploy -R japhethLG/churchflow-api
```

### Watch the current run
```bash
gh run watch -R japhethLG/churchflow-api
```

### Rollback to a previous commit's image
```bash
ssh ubuntu@churchflow.crabdance.com
cd ~/church-api
# images are tagged sha-<commit>; pick any prior one
sed -i 's|churchflow-api:latest|churchflow-api:sha-<commit>|' docker-compose.yml
docker compose pull && docker compose up -d
# remember to revert the compose tag when the next deploy lands,
# or the next workflow's SCP will overwrite it
```

### View runtime logs
```bash
ssh ubuntu@churchflow.crabdance.com 'docker logs --tail=200 -f church-api'
```

### Update an env var
```bash
gh secret set NEW_VAR -R japhethLG/churchflow-api --body "value"
gh workflow run Deploy -R japhethLG/churchflow-api   # redeploys with new value
```

### Run a one-off migration manually (e.g. after a hotfix)
```bash
ssh ubuntu@churchflow.crabdance.com
cd ~/church-api
docker compose run --rm api npx prisma migrate deploy
```

### Open a Prisma shell against prod
```bash
ssh ubuntu@churchflow.crabdance.com 'cd ~/church-api && docker compose run --rm api npx prisma studio'
```

---

## 6. Bootstrap from scratch (disaster recovery)

If the VPS is rebuilt:

1. Install Docker + add `ubuntu` to the `docker` group.
2. Stand up Caddy and Postgres (out of scope of this repo).
3. Create the prod database:
   ```bash
   docker exec local-postgres psql -U postgres -c 'CREATE DATABASE church_app_prod;'
   ```
4. Generate a deploy SSH keypair:
   ```bash
   ssh-keygen -t ed25519 -N "" -C "github-actions-deploy@churchflow" -f ~/.ssh/id_ed25519_deploy_churchflow
   cat ~/.ssh/id_ed25519_deploy_churchflow.pub >> ~/.ssh/authorized_keys
   ```
   Replace the `SSH_PRIVATE_KEY` GitHub secret with the new private key.
5. Log Docker into GHCR so `docker compose pull` works for private images:
   ```bash
   echo <PAT> | docker login ghcr.io -u japhethLG --password-stdin
   ```
6. `mkdir ~/church-api`
7. Re-run the latest workflow: `gh workflow run Deploy -R japhethLG/churchflow-api`

The first deploy will SCP everything else and run migrations.

---

## 7. Troubleshooting

| Symptom | Diagnosis |
|---|---|
| Workflow fails at `prisma generate` with "Cannot resolve environment variable: DATABASE_URL" | The placeholder URL line in the Dockerfile was lost — restore the `RUN DATABASE_URL="postgresql://placeholder..."` prefix. |
| `no matching manifest for linux/arm64/v8` on `docker compose pull` | Image was built for AMD64 only. Workflow must include `setup-qemu-action` + `platforms: linux/arm64` (or switch to `runs-on: ubuntu-24.04-arm` native runner). |
| `up -d` fails with "port is already allocated" | Another process holds `8002`. Most likely a leftover PM2 process: `pm2 list && pm2 delete church-api`. |
| Migration step fails | The workflow stops there — old container keeps running on the prior schema. Fix the migration, push again. |
| Container restart loop, "Firebase credentials missing" | `FIREBASE_PROJECT_ID`/`FIREBASE_CLIENT_EMAIL`/`FIREBASE_PRIVATE_KEY` secret missing or malformed (e.g. literal newlines instead of `\n`). |

---

## 8. Known limitations

- BE workflow runs on `ubuntu-latest` + QEMU. Build is ~5–8 min. The FE
  workflow switched to native `ubuntu-24.04-arm` and is ~3× faster —
  worth migrating BE the same way.
- `image: :latest` in compose means there's no per-environment pin; we
  rely on `docker compose pull` always fetching the freshly-built image.
  For staging/production split, switch to sha tags.
- GHCR docker login on the VPS uses a personal PAT. Rotate it
  periodically; consider a fine-grained `read:packages` token dedicated
  to the deploy.
- Secrets in GitHub Actions are visible to anyone with admin on the repo
  and embedded into workflow logs only if echoed. Don't echo them.
