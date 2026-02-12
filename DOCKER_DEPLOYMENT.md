# SendSign Docker Deployment Guide

This guide covers deploying SendSign in production using Docker and Docker Compose.

## Quick Start

1. **Copy the environment template:**
   ```bash
   cp .env.production.example .env.production
   ```

2. **Edit `.env.production` with your production values:**
   - Database password
   - JWT secret (min 32 characters)
   - Encryption key (generate with `openssl rand -hex 32`)
   - Control plane API key
   - Base URL and domain

3. **Build and start:**
   ```bash
   docker-compose -f docker-compose.prod.yml up -d
   ```

4. **Check logs:**
   ```bash
   docker-compose -f docker-compose.prod.yml logs -f sendsign
   ```

5. **Verify it's running:**
   ```bash
   curl http://localhost:3000/health
   ```

## Architecture

The production setup includes:

- **SendSign App** (`sendsign` container)
  - Multi-stage Docker build (optimized ~250MB final image)
  - Runs as non-root user (UID 1001)
  - Built-in health checks
  - Automatic database migrations on startup
  - Serves API + static frontend

- **PostgreSQL 16** (`postgres` container)
  - Persistent data volume
  - Health checks
  - Automatic backups recommended (see below)

## Environment Variables

### Required

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pass@postgres:5432/sendsign` |
| `POSTGRES_PASSWORD` | Database password | `strong_password_123` |
| `JWT_SECRET` | JWT signing secret (min 32 chars) | `long_random_string_for_jwt` |
| `ENCRYPTION_KEY` | AES-256 encryption key (64 hex chars) | `openssl rand -hex 32` |
| `SENDSIGN_CONTROL_API_KEY` | Control plane master key | `ctrl_random_hex_string` |
| `BASE_URL` | Public URL | `https://sendsign.example.com` |
| `SENDSIGN_BASE_DOMAIN` | Base domain for tenants | `sendsign.example.com` |

### Optional

See `.env.production.example` for full list including:
- S3 storage configuration
- Email providers (SendGrid, SMTP)
- SMS/WhatsApp (Twilio)
- Identity verification (Jumio, Onfido)
- QES providers (Swisscom, Namirial)
- SSO configuration

## Storage Options

### Local Filesystem (Default)

```env
STORAGE_TYPE=local
STORAGE_PATH=/app/storage
```

Documents are stored in a Docker volume (`sendsign-storage`).

### S3-Compatible Storage

```env
STORAGE_TYPE=s3
S3_BUCKET=your-bucket
S3_REGION=us-east-1
S3_ACCESS_KEY_ID=AKIAXXXXXXXX
S3_SECRET_ACCESS_KEY=secret
```

Works with AWS S3, MinIO, Backblaze B2, DigitalOcean Spaces, etc.

## Database Migrations

Migrations run automatically on container startup via `scripts/start-production.sh`.

To run migrations manually:

```bash
docker-compose -f docker-compose.prod.yml exec sendsign npx drizzle-kit migrate
```

## Backup and Restore

### Database Backup

```bash
# Create backup
docker-compose -f docker-compose.prod.yml exec postgres \
  pg_dump -U sendsign sendsign > backup-$(date +%Y%m%d-%H%M%S).sql

# Restore backup
docker-compose -f docker-compose.prod.yml exec -T postgres \
  psql -U sendsign sendsign < backup-20240101-120000.sql
```

### Automated Backups

Add a cron job to backup daily:

```bash
0 2 * * * cd /path/to/sendsign && docker-compose -f docker-compose.prod.yml exec postgres pg_dump -U sendsign sendsign | gzip > /backups/sendsign-$(date +\%Y\%m\%d).sql.gz
```

### Storage Backup

If using local storage:

```bash
# Backup documents
docker run --rm \
  -v sendsign-storage:/data \
  -v $(pwd):/backup \
  alpine tar czf /backup/storage-backup.tar.gz -C /data .

# Restore documents
docker run --rm \
  -v sendsign-storage:/data \
  -v $(pwd):/backup \
  alpine tar xzf /backup/storage-backup.tar.gz -C /data
```

## Scaling

### Vertical Scaling

Adjust resource limits in `docker-compose.prod.yml`:

```yaml
deploy:
  resources:
    limits:
      memory: 2G
      cpus: '2'
    reservations:
      memory: 1G
```

### Horizontal Scaling

Run multiple app containers behind a load balancer:

```bash
docker-compose -f docker-compose.prod.yml up -d --scale sendsign=3
```

**Requirements for horizontal scaling:**
- Use S3 storage (not local filesystem)
- Use Redis for session storage (future enhancement)
- Configure load balancer with sticky sessions

## SSL/TLS

### Option 1: Reverse Proxy (Recommended)

Use Nginx or Caddy as a reverse proxy with automatic SSL:

```nginx
server {
    listen 443 ssl http2;
    server_name sendsign.example.com;

    ssl_certificate /etc/letsencrypt/live/sendsign.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/sendsign.example.com/privkey.pem;

    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### Option 2: Traefik (Docker-Native)

Add Traefik labels to `docker-compose.prod.yml`:

```yaml
labels:
  - "traefik.enable=true"
  - "traefik.http.routers.sendsign.rule=Host(`sendsign.example.com`)"
  - "traefik.http.routers.sendsign.tls.certresolver=letsencrypt"
```

## Monitoring

### Health Checks

Built-in health endpoints:

- `/health` - Basic liveness probe
- `/health/ready` - Readiness probe (checks DB)
- `/health/detailed` - Full system status (requires control key)

### Logs

View logs:

```bash
# All containers
docker-compose -f docker-compose.prod.yml logs -f

# Just the app
docker-compose -f docker-compose.prod.yml logs -f sendsign

# Last 100 lines
docker-compose -f docker-compose.prod.yml logs --tail=100 sendsign
```

Configure log rotation in `/etc/docker/daemon.json`:

```json
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  }
}
```

### Metrics (Future)

Prometheus metrics endpoint coming in Step 36.

## Security Hardening

### Environment Secrets

Use Docker secrets or external secret management:

```yaml
secrets:
  db_password:
    external: true
  jwt_secret:
    external: true
```

### Network Isolation

Restrict PostgreSQL to internal network only:

```yaml
postgres:
  networks:
    - sendsign-network
  # Remove ports: section to prevent external access
```

### Regular Updates

Update base images regularly:

```bash
docker-compose -f docker-compose.prod.yml pull
docker-compose -f docker-compose.prod.yml up -d
```

## Troubleshooting

### Container won't start

Check logs:
```bash
docker-compose -f docker-compose.prod.yml logs sendsign
```

### Database connection failed

Verify PostgreSQL is running:
```bash
docker-compose -f docker-compose.prod.yml ps postgres
docker-compose -f docker-compose.prod.yml logs postgres
```

### Migrations failed

Run manually:
```bash
docker-compose -f docker-compose.prod.yml exec sendsign \
  npx drizzle-kit migrate
```

### Out of disk space

Check volume sizes:
```bash
docker system df -v
```

Clean up unused resources:
```bash
docker system prune -a --volumes
```

## Production Checklist

Before deploying to production:

- [ ] Change all default passwords and secrets
- [ ] Configure SSL/TLS termination
- [ ] Set up automated database backups
- [ ] Configure email provider (SendGrid/SMTP)
- [ ] Set up monitoring and alerting
- [ ] Configure firewall rules
- [ ] Enable log rotation
- [ ] Document your backup/restore procedures
- [ ] Test disaster recovery process
- [ ] Set up health check monitoring (UptimeRobot, etc.)
- [ ] Configure CORS for your domains
- [ ] Review and adjust rate limits
- [ ] Set appropriate resource limits
- [ ] Plan for scaling (S3, Redis, etc.)

## Kubernetes Deployment

Helm chart coming in Step 37 of BUILD_RECIPE_MANAGED_SERVICE.md.

## Support

For issues and questions:
- GitHub Issues: [your-repo]/issues
- Documentation: https://docs.sendsign.dev (coming soon)
- Email: support@sendsign.dev
