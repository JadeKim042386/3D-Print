# Production Deployment Guide

## Architecture

| Component | Platform | Region |
|-----------|----------|--------|
| API Server | Fly.io (`homefix-api-prod`) | nrt (Tokyo, nearest to Seoul) |
| Worker | Fly.io (`homefix-worker-prod`) | nrt |
| Frontend | Vercel | icn1 (Seoul edge) |
| Database | Supabase | ap-northeast-2 (Seoul) |
| Redis | Upstash Redis | ap-northeast-1 |

## Prerequisites

1. **Fly.io CLI** installed and authenticated
2. **Vercel CLI** installed and authenticated
3. **Upstash Redis** instance created in ap-northeast-1

## Initial Setup

### 1. Create Fly.io Apps

```bash
cd server

# API server
fly apps create homefix-api-prod
fly secrets set -a homefix-api-prod \
  SUPABASE_URL="..." \
  SUPABASE_SERVICE_KEY="..." \
  SUPABASE_ANON_KEY="..." \
  MESHY_API_KEY="..." \
  REDIS_URL="..." \
  TOSS_PAYMENTS_SECRET_KEY="..." \
  TOSS_PAYMENTS_CLIENT_KEY="..." \
  TOSS_PAYMENTS_WEBHOOK_SECRET="..."

# Worker
fly apps create homefix-worker-prod
fly secrets set -a homefix-worker-prod \
  SUPABASE_URL="..." \
  SUPABASE_SERVICE_KEY="..." \
  SUPABASE_ANON_KEY="..." \
  MESHY_API_KEY="..." \
  REDIS_URL="..."
```

### 2. Provision Redis (Upstash)

Create a Redis database at [console.upstash.com](https://console.upstash.com) in `ap-northeast-1`. Copy the `REDIS_URL` (TLS connection string) to Fly.io secrets.

### 3. Deploy

```bash
# API
fly deploy --config fly.toml --remote-only

# Worker
fly deploy --config fly.worker.toml --remote-only
```

### 4. Frontend (Vercel)

Vercel auto-deploys from `main` branch. Set environment variables in the Vercel dashboard:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_API_URL` (Fly.io API URL)
- `NEXT_PUBLIC_TOSS_CLIENT_KEY`

## CI/CD

GitHub Actions deploys automatically on push to `main` when CI passes.

**Required GitHub Secrets:**

| Secret | Description |
|--------|-------------|
| `FLY_API_TOKEN` | Fly.io deploy token |
| `VERCEL_TOKEN` | Vercel deploy token |
| `VERCEL_ORG_ID` | Vercel organization ID |
| `VERCEL_PROJECT_ID` | Vercel project ID |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |
| `NEXT_PUBLIC_API_URL` | Production API URL |
| `NEXT_PUBLIC_TOSS_CLIENT_KEY` | Toss Payments client key |

## Health Check

```bash
curl https://homefix-api-prod.fly.dev/health
# {"status":"ok","services":{"redis":"ok"}}
```

## Smoke Test

1. Open frontend URL
2. Authenticate via Supabase Auth
3. Submit a text-to-3D generation prompt
4. Verify model appears in model list
5. Request a print quote
6. Complete sandbox payment flow via Toss Payments
