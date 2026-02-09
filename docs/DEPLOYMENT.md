# CoSeal Production Deployment Guide

This guide covers deploying CoSeal in production environments.

## Quick Start (Docker)

The fastest way to get CoSeal running:

```bash
git clone https://github.com/coseal/coseal.git
cd coseal
./scripts/setup.sh
```

This launches:
- PostgreSQL database
- MinIO (S3-compatible storage)
- CoSeal API + Signing UI

**Access:**
- API: `http://localhost:3000`
- MinIO Console: `http://localhost:9001`

---

## Production Deployment

### 1. Docker Deployment

#### Using docker-compose

**Basic:**
```bash
docker-compose up -d
```

**Production mode:**
```bash
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

#### Environment Variables

Create a `.env` file (see `.env.example`):

```env
# Database
DATABASE_URL=postgresql://user:password@host:5432/coseal

# S3 Storage
S3_ENDPOINT=https://s3.amazonaws.com
S3_REGION=us-east-1
S3_ACCESS_KEY_ID=your-key
S3_SECRET_ACCESS_KEY=your-secret
S3_BUCKET=coseal-documents

# Encryption
ENCRYPTION_KEY=<32-character-random-string>

# API
API_KEY=<random-api-key>
BASE_URL=https://coseal.yourcompany.com

# Email (SendGrid)
SENDGRID_API_KEY=your-sendgrid-key
SENDGRID_FROM_EMAIL=noreply@yourcompany.com
SENDGRID_FROM_NAME=Your Company

# SMS/WhatsApp (Twilio)
TWILIO_ACCOUNT_SID=your-twilio-sid
TWILIO_AUTH_TOKEN=your-twilio-token
TWILIO_PHONE_NUMBER=+1234567890

# Certificates
SIGNING_CERT_PATH=./certs/signing-cert.pem
SIGNING_KEY_PATH=./certs/signing-key.pem
```

**Generate secure random keys:**
```bash
openssl rand -hex 32  # For ENCRYPTION_KEY
openssl rand -hex 32  # For API_KEY
```

---

### 2. Kubernetes Deployment

#### Basic Kubernetes Manifests

**Namespace:**
```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: coseal
```

**Deployment:**
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: coseal-api
  namespace: coseal
spec:
  replicas: 3
  selector:
    matchLabels:
      app: coseal-api
  template:
    metadata:
      labels:
        app: coseal-api
    spec:
      containers:
      - name: api
        image: coseal/coseal:latest
        ports:
        - containerPort: 3000
        env:
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: coseal-secrets
              key: database-url
        - name: ENCRYPTION_KEY
          valueFrom:
            secretKeyRef:
              name: coseal-secrets
              key: encryption-key
        - name: API_KEY
          valueFrom:
            secretKeyRef:
              name: coseal-secrets
              key: api-key
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 10
          periodSeconds: 5
```

**Service:**
```yaml
apiVersion: v1
kind: Service
metadata:
  name: coseal-api
  namespace: coseal
spec:
  selector:
    app: coseal-api
  ports:
  - port: 80
    targetPort: 3000
  type: LoadBalancer
```

**Secrets:**
```bash
kubectl create secret generic coseal-secrets \
  --from-literal=database-url='postgresql://...' \
  --from-literal=encryption-key='...' \
  --from-literal=api-key='...' \
  -n coseal
```

#### Helm Chart (Roadmap)

A Helm chart is planned for simplified Kubernetes deployments.

---

### 3. Cloud Providers

#### AWS

**Components:**
- **Compute:** ECS Fargate or EKS
- **Database:** RDS for PostgreSQL
- **Storage:** S3
- **Load Balancer:** Application Load Balancer (ALB)
- **SSL/TLS:** AWS Certificate Manager (ACM)

**Example Terraform (simplified):**

```hcl
resource "aws_ecs_cluster" "coseal" {
  name = "coseal-cluster"
}

resource "aws_ecs_task_definition" "coseal_api" {
  family                   = "coseal-api"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = "512"
  memory                   = "1024"

  container_definitions = jsonencode([{
    name  = "coseal-api"
    image = "coseal/coseal:latest"
    portMappings = [{
      containerPort = 3000
      protocol      = "tcp"
    }]
    environment = [
      { name = "DATABASE_URL", value = aws_db_instance.coseal.endpoint },
      { name = "S3_BUCKET", value = aws_s3_bucket.documents.id }
    ]
  }])
}
```

#### GCP

**Components:**
- **Compute:** Cloud Run or GKE
- **Database:** Cloud SQL for PostgreSQL
- **Storage:** Cloud Storage
- **Load Balancer:** Cloud Load Balancing
- **SSL/TLS:** Google-managed certificates

#### Azure

**Components:**
- **Compute:** Azure Container Instances or AKS
- **Database:** Azure Database for PostgreSQL
- **Storage:** Azure Blob Storage
- **Load Balancer:** Azure Load Balancer
- **SSL/TLS:** Azure App Service certificates

---

## TLS/SSL Configuration

CoSeal does not handle TLS termination directly. Use a reverse proxy or cloud load balancer.

### Using Nginx as Reverse Proxy

**nginx.conf:**
```nginx
upstream coseal {
  server localhost:3000;
}

server {
  listen 443 ssl http2;
  server_name coseal.yourcompany.com;

  ssl_certificate /etc/ssl/certs/coseal.crt;
  ssl_certificate_key /etc/ssl/private/coseal.key;

  ssl_protocols TLSv1.2 TLSv1.3;
  ssl_ciphers HIGH:!aNULL:!MD5;

  location / {
    proxy_pass http://coseal;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}

server {
  listen 80;
  server_name coseal.yourcompany.com;
  return 301 https://$server_name$request_uri;
}
```

### Using Traefik

**docker-compose.yml with Traefik:**
```yaml
services:
  traefik:
    image: traefik:v2.10
    command:
      - "--providers.docker=true"
      - "--entrypoints.web.address=:80"
      - "--entrypoints.websecure.address=:443"
      - "--certificatesresolvers.letsencrypt.acme.email=admin@yourcompany.com"
      - "--certificatesresolvers.letsencrypt.acme.storage=/letsencrypt/acme.json"
      - "--certificatesresolvers.letsencrypt.acme.httpchallenge.entrypoint=web"
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - ./letsencrypt:/letsencrypt

  coseal-api:
    image: coseal/coseal:latest
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.coseal.rule=Host(`coseal.yourcompany.com`)"
      - "traefik.http.routers.coseal.entrypoints=websecure"
      - "traefik.http.routers.coseal.tls.certresolver=letsencrypt"
```

---

## Database

### PostgreSQL Requirements

- **Version:** PostgreSQL 12+ (recommended: 16)
- **Extensions:** None required (pure SQL)

### Managed PostgreSQL

#### AWS RDS
```bash
aws rds create-db-instance \
  --db-instance-identifier coseal-db \
  --db-instance-class db.t3.medium \
  --engine postgres \
  --engine-version 16 \
  --master-username coseal \
  --master-user-password <password> \
  --allocated-storage 20
```

#### GCP Cloud SQL
```bash
gcloud sql instances create coseal-db \
  --database-version=POSTGRES_16 \
  --tier=db-f1-micro \
  --region=us-central1
```

### Connection Pooling

For high-traffic environments, use connection pooling (e.g., PgBouncer).

**docker-compose.yml:**
```yaml
services:
  pgbouncer:
    image: pgbouncer/pgbouncer
    environment:
      DATABASES_HOST: db
      DATABASES_PORT: 5432
      DATABASES_DBNAME: coseal
      PGBOUNCER_POOL_MODE: transaction
      PGBOUNCER_MAX_CLIENT_CONN: 1000
      PGBOUNCER_DEFAULT_POOL_SIZE: 25
```

---

## Storage

### S3-Compatible Storage

CoSeal supports any S3-compatible storage:
- **AWS S3**
- **Google Cloud Storage** (with S3 interoperability)
- **Azure Blob Storage** (with S3 API)
- **MinIO** (self-hosted)
- **Backblaze B2**
- **Wasabi**
- **DigitalOcean Spaces**

**Configuration:**
```env
S3_ENDPOINT=https://s3.amazonaws.com
S3_REGION=us-east-1
S3_ACCESS_KEY_ID=<key>
S3_SECRET_ACCESS_KEY=<secret>
S3_BUCKET=coseal-documents
```

### Document Retention

Configure automatic document purging after a retention period:

```env
DOCUMENT_RETENTION_DAYS=2555  # 7 years (compliance requirement for many industries)
```

---

## Backup Strategy

### Database Backups

**Daily backups:**
```bash
# Automated with cron
0 2 * * * pg_dump $DATABASE_URL | gzip > /backups/coseal-$(date +\%Y\%m\%d).sql.gz
```

**Restore:**
```bash
gunzip -c coseal-20260207.sql.gz | psql $DATABASE_URL
```

### Document Backups

S3 objects are automatically replicated if using AWS S3 with cross-region replication enabled.

For self-hosted MinIO:
```bash
mc mirror minio/coseal-documents s3/backup-bucket
```

---

## Monitoring

### Health Checks

**Endpoint:** `GET /health`

**Example with uptime monitoring:**
```bash
curl -f http://localhost:3000/health || exit 1
```

### Logging

CoSeal logs to stdout/stderr. Collect logs with:
- **Docker:** `docker logs coseal-api`
- **Kubernetes:** `kubectl logs -n coseal deployment/coseal-api`
- **Cloud providers:** CloudWatch (AWS), Cloud Logging (GCP), Azure Monitor

### Metrics (Roadmap)

Prometheus metrics endpoint planned for future releases.

---

## Scaling

### Horizontal Scaling

CoSeal is stateless and can be horizontally scaled:

**Kubernetes:**
```bash
kubectl scale deployment coseal-api --replicas=10 -n coseal
```

**ECS:**
```bash
aws ecs update-service --cluster coseal --service coseal-api --desired-count 10
```

### Performance Tuning

- **Database:** Use connection pooling (PgBouncer)
- **Storage:** Enable S3 Transfer Acceleration for faster uploads
- **CDN:** Use CloudFront or equivalent for static assets (signing UI)
- **Caching:** Consider Redis for session caching (future enhancement)

---

## Security Best Practices

1. **Use TLS everywhere** — Encrypt data in transit
2. **Rotate API keys regularly** — At least every 90 days
3. **Enable S3 encryption at rest** — Use AES-256 or KMS
4. **Use managed secrets** — AWS Secrets Manager, GCP Secret Manager, Azure Key Vault
5. **Restrict network access** — Use security groups, firewall rules
6. **Enable audit logging** — CoSeal logs all actions; export audit events regularly
7. **Use strong database passwords** — At least 32 characters, randomly generated
8. **Backup encryption keys** — Store `ENCRYPTION_KEY` securely; losing it means losing document access
9. **Monitor for anomalies** — Set up alerts for unusual activity

---

## High Availability

For mission-critical deployments:

1. **Multi-AZ database** — Use RDS Multi-AZ or equivalent
2. **Load balancer health checks** — Automatically remove unhealthy instances
3. **Auto-scaling** — Scale based on CPU/memory/request count
4. **S3 replication** — Enable cross-region replication
5. **Multiple replicas** — Run at least 3 API instances

---

## Disaster Recovery

**RTO (Recovery Time Objective):** < 1 hour
**RPO (Recovery Point Objective):** < 15 minutes

**Checklist:**
- [ ] Daily database backups
- [ ] S3 versioning enabled
- [ ] Backup encryption keys stored securely offline
- [ ] Documented restore procedure
- [ ] Tested recovery annually

**Recovery steps:**
1. Restore database from latest backup
2. Launch new CoSeal instances
3. Verify document access from S3
4. Run health checks
5. Update DNS to point to new environment

---

## Environment Variables Reference

| Variable                    | Required | Default                  | Description                                  |
|-----------------------------|----------|--------------------------|----------------------------------------------|
| `DATABASE_URL`              | Yes      | -                        | PostgreSQL connection string                 |
| `S3_ENDPOINT`               | Yes      | -                        | S3 endpoint URL                              |
| `S3_REGION`                 | Yes      | `us-east-1`              | S3 region                                    |
| `S3_ACCESS_KEY_ID`          | Yes      | -                        | S3 access key                                |
| `S3_SECRET_ACCESS_KEY`      | Yes      | -                        | S3 secret key                                |
| `S3_BUCKET`                 | Yes      | -                        | S3 bucket name                               |
| `ENCRYPTION_KEY`            | Yes      | -                        | 32+ character encryption key                 |
| `API_KEY`                   | Yes      | -                        | API authentication key                       |
| `BASE_URL`                  | Yes      | `http://localhost:3000`  | Public URL of CoSeal service                 |
| `PORT`                      | No       | `3000`                   | HTTP port                                    |
| `NODE_ENV`                  | No       | `development`            | `development` or `production`                |
| `SENDGRID_API_KEY`          | No       | -                        | SendGrid API key for emails                  |
| `SENDGRID_FROM_EMAIL`       | No       | -                        | From email address                           |
| `TWILIO_ACCOUNT_SID`        | No       | -                        | Twilio account SID                           |
| `TWILIO_AUTH_TOKEN`         | No       | -                        | Twilio auth token                            |
| `TWILIO_PHONE_NUMBER`       | No       | -                        | Twilio phone number for SMS                  |
| `SIGNING_CERT_PATH`         | No       | `./certs/signing-cert.pem` | Path to signing certificate                |
| `SIGNING_KEY_PATH`          | No       | `./certs/signing-key.pem`  | Path to signing private key                |
| `DOCUMENT_RETENTION_DAYS`   | No       | `2555` (7 years)         | Days to retain documents before auto-purge   |

---

## Troubleshooting

### API won't start

**Check:**
- Database connectivity: `psql $DATABASE_URL`
- S3 credentials: `aws s3 ls s3://<bucket>`
- Environment variables: Ensure all required vars are set
- Logs: `docker logs coseal-api`

### Signers not receiving emails

**Check:**
- SendGrid API key is valid
- `SENDGRID_FROM_EMAIL` is verified in SendGrid
- Email not in spam folder
- SMTP fallback is configured if SendGrid is not used

### Document uploads failing

**Check:**
- S3 bucket exists and is accessible
- S3 credentials have write permissions
- File size limits (default: 50MB)

### Sealed PDFs won't open

**Check:**
- Certificates are valid (not expired)
- PDF is not corrupted (re-download)
- Using a modern PDF viewer (Adobe Acrobat, Preview, Foxit)

---

## SSO Configuration

CoSeal supports enterprise Single Sign-On (SSO) via SAML 2.0 and OpenID Connect (OIDC).

### Benefits

- Centralized identity management
- No need for users to create separate accounts
- Leverages existing enterprise IdP (Okta, Azure AD, Google Workspace)
- SSO authentication counts as AES-level identity verification

### Supported Identity Providers

- **Okta** (SAML, OIDC)
- **Azure Active Directory** (SAML, OIDC)
- **Google Workspace** (OIDC)
- **Keycloak** (SAML, OIDC)
- **Auth0** (OIDC)
- Any SAML 2.0 or OIDC-compliant IdP

### Environment Variables

```env
SSO_ENABLED=true
SSO_SP_ENTITY_ID=https://coseal.yourcompany.com/sso
SSO_SP_CERT_PATH=/certs/sso-sp.pem
SSO_SP_KEY_PATH=/certs/sso-sp-key.pem
```

### SAML Setup

#### 1. Configure CoSeal as Service Provider (SP)

Generate SP certificate and key:

```bash
openssl req -x509 -newkey rsa:2048 -keyout sso-sp-key.pem -out sso-sp.pem -days 3650 -nodes -subj "/CN=CoSeal SP"
```

#### 2. Get SP Metadata

```bash
curl -H "Authorization: Bearer <api-key>" \
  http://localhost:3000/api/sso/metadata/your-org-id > sp-metadata.xml
```

#### 3. Configure IdP

**For Okta:**
1. Go to Applications → Create App Integration → SAML 2.0
2. Upload SP metadata or enter manually:
   - Single Sign-On URL: `https://coseal.yourcompany.com/api/sso/callback`
   - Audience URI: `https://coseal.yourcompany.com/sso`
3. Download IdP metadata

**For Azure AD:**
1. Go to Enterprise Applications → New Application → Create your own
2. Select "Integrate any other application you don't find in the gallery (Non-gallery)"
3. Configure SAML:
   - Identifier: `https://coseal.yourcompany.com/sso`
   - Reply URL: `https://coseal.yourcompany.com/api/sso/callback`
4. Download Federation Metadata XML

**For Google Workspace:**
1. Admin Console → Apps → Web and mobile apps → Add SAML app
2. Enter CoSeal details and upload SP metadata
3. Copy IdP entity ID and certificate

#### 4. Register SSO Config in CoSeal

```bash
curl -X POST http://localhost:3000/api/sso/configurations \
  -H "Authorization: Bearer <api-key>" \
  -H "Content-Type: application/json" \
  -d '{
    "organizationId": "acme-corp",
    "providerType": "saml",
    "config": {
      "entryPoint": "https://idp.example.com/sso/saml",
      "issuer": "https://coseal.yourcompany.com/sso",
      "callbackUrl": "https://coseal.yourcompany.com/api/sso/callback",
      "cert": "-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----",
      "allowedDomains": ["acme.com", "acme.co.uk"]
    },
    "enabled": true
  }'
```

### OIDC Setup

#### 1. Configure Application in IdP

**For Okta:**
1. Applications → Create App Integration → OIDC
2. Application type: Web Application
3. Redirect URI: `https://coseal.yourcompany.com/api/sso/callback`
4. Copy Client ID and Client Secret

**For Azure AD:**
1. Azure AD → App registrations → New registration
2. Redirect URI: `https://coseal.yourcompany.com/api/sso/callback`
3. Certificates & secrets → New client secret
4. Copy Application (client) ID and secret
5. Note the issuer URL: `https://login.microsoftonline.com/{tenant-id}/v2.0`

**For Google Workspace:**
1. Google Cloud Console → APIs & Services → Credentials
2. Create OAuth 2.0 Client ID
3. Authorized redirect URI: `https://coseal.yourcompany.com/api/sso/callback`
4. Copy Client ID and Client Secret

#### 2. Register in CoSeal

```bash
curl -X POST http://localhost:3000/api/sso/configurations \
  -H "Authorization: Bearer <api-key>" \
  -H "Content-Type: application/json" \
  -d '{
    "organizationId": "acme-corp",
    "providerType": "oidc",
    "config": {
      "issuerUrl": "https://accounts.google.com",
      "clientId": "your-client-id",
      "clientSecret": "your-client-secret",
      "callbackUrl": "https://coseal.yourcompany.com/api/sso/callback",
      "allowedDomains": ["acme.com"]
    },
    "enabled": true
  }'
```

### Testing SSO

**Local testing with Keycloak:**

1. Run Keycloak:
   ```bash
   docker run -p 8080:8080 -e KEYCLOAK_ADMIN=admin -e KEYCLOAK_ADMIN_PASSWORD=admin quay.io/keycloak/keycloak:latest start-dev
   ```

2. Create a realm and SAML client in Keycloak UI

3. Configure CoSeal to use Keycloak as IdP

4. Test SSO flow:
   - Access signing link
   - Click "Sign in with your organization"
   - Redirected to Keycloak login
   - After login, redirected back to CoSeal signing ceremony

**Testing with samltest.id:**

For SAML-only testing without setting up your own IdP:
1. Visit https://samltest.id
2. Use their test IdP metadata
3. Upload your SP metadata
4. Test SSO flow

### Troubleshooting

**"SAML assertion validation failed"**
- Check that IdP certificate is correct and not expired
- Verify clock synchronization (SAML is time-sensitive)
- Check that SP entity ID matches IdP configuration

**"Unable to discover OIDC issuer"**
- Verify `issuerUrl` is correct (must end with `/.well-known/openid-configuration`)
- Check network connectivity to IdP
- Verify IdP supports OIDC discovery

**"Organization not found for domain"**
- Verify `allowedDomains` is configured in SSO config
- Check that the email domain matches exactly (case-sensitive)

---

## Kubernetes Deployment (Helm)

### Prerequisites

- Kubernetes 1.25+ cluster
- `kubectl` configured to your cluster
- `helm` 3.0+ installed
- PostgreSQL database (RDS, Cloud SQL, or self-hosted)
- S3-compatible storage (AWS S3, GCS, MinIO, etc.)

### Quick Start

```bash
# Install CoSeal via Helm
helm install coseal ./deploy/helm/coseal/ \
  --namespace coseal \
  --create-namespace \
  --set config.baseUrl="https://sign.example.com" \
  --set database.url="postgresql://user:pass@db-host:5432/coseal" \
  --set encryption.key="your-32-char-encryption-key-here" \
  --set auth.apiKey="your-api-key" \
  --set storage.bucket="coseal-documents" \
  --set storage.region="us-east-1"
```

### Production Values

Create a `values-production.yaml`:

```yaml
replicaCount: 3

image:
  repository: ghcr.io/coseal/coseal
  tag: "1.0.0"

config:
  baseUrl: "https://sign.yourcompany.com"
  nodeEnv: "production"

autoscaling:
  enabled: true
  minReplicas: 3
  maxReplicas: 20
  targetCPUUtilizationPercentage: 70

ingress:
  enabled: true
  className: "nginx"
  annotations:
    cert-manager.io/cluster-issuer: "letsencrypt-prod"
  hosts:
    - host: sign.yourcompany.com
      paths:
        - path: /
          pathType: Prefix
  tls:
    - secretName: coseal-tls
      hosts:
        - sign.yourcompany.com

externalSecret:
  enabled: true
  secretStoreName: "aws-secrets-manager"

resources:
  requests:
    cpu: 500m
    memory: 512Mi
  limits:
    cpu: 2000m
    memory: 1Gi
```

Then install:

```bash
helm install coseal ./deploy/helm/coseal/ \
  --namespace coseal \
  --create-namespace \
  -f values-production.yaml
```

### Verify Deployment

```bash
kubectl get pods -n coseal
kubectl get svc -n coseal
kubectl get ingress -n coseal

# Check logs
kubectl logs -n coseal deployment/coseal --tail=100
```

### Upgrade

```bash
helm upgrade coseal ./deploy/helm/coseal/ \
  --namespace coseal \
  -f values-production.yaml
```

### External Secrets

For production, use AWS Secrets Manager, Google Secret Manager, or HashiCorp Vault:

```yaml
externalSecret:
  enabled: true
  secretStoreName: "aws-secrets-manager"
  refreshInterval: "1h"
```

Install External Secrets Operator:

```bash
helm repo add external-secrets https://charts.external-secrets.io
helm install external-secrets external-secrets/external-secrets \
  --namespace external-secrets-system \
  --create-namespace
```

---

## Cloud Deployment (Terraform)

### AWS Deployment

**Prerequisites:**
- AWS CLI configured
- Terraform 1.5+
- AWS account with permissions for VPC, EKS, RDS, S3, KMS

**1. Configure variables:**

Create `terraform.tfvars`:

```hcl
project_name    = "coseal"
environment     = "production"
aws_region      = "us-east-1"
domain_name     = "sign.example.com"
certificate_arn = "arn:aws:acm:..."

db_instance_class = "db.t3.large"
db_username       = "coseal"
db_password       = "<secure-password>"

eks_cluster_version    = "1.29"
eks_node_instance_types = ["t3.large"]
eks_min_nodes          = 2
eks_max_nodes          = 10
```

**2. Deploy infrastructure:**

```bash
cd deploy/terraform/aws
terraform init
terraform plan
terraform apply
```

**3. Configure kubectl:**

```bash
aws eks update-kubeconfig --region us-east-1 --name coseal-production
```

**4. Install CoSeal with Helm:**

```bash
helm install coseal ../../helm/coseal/ \
  --namespace coseal \
  --create-namespace \
  --set config.baseUrl="https://sign.example.com" \
  --set database.url="<from terraform output>" \
  --set storage.bucket="<from terraform output>"
```

**5. Verify:**

```bash
kubectl get all -n coseal
```

### GCP Deployment

**Prerequisites:**
- gcloud CLI configured
- Terraform 1.5+
- GCP project with Compute, GKE, Cloud SQL APIs enabled

**1. Configure variables:**

Create `terraform.tfvars`:

```hcl
project_id   = "your-gcp-project"
project_name = "coseal"
environment  = "production"
region       = "us-central1"
domain_name  = "sign.example.com"

db_tier     = "db-custom-4-8192"
db_password = "<secure-password>"

gke_machine_type = "e2-standard-4"
gke_min_nodes    = 2
gke_max_nodes    = 10
```

**2. Deploy infrastructure:**

```bash
cd deploy/terraform/gcp
terraform init
terraform plan
terraform apply
```

**3. Configure kubectl:**

```bash
gcloud container clusters get-credentials coseal-production \
  --region us-central1 \
  --project your-gcp-project
```

**4. Install CoSeal with Helm:**

```bash
helm install coseal ../../helm/coseal/ \
  --namespace coseal \
  --create-namespace \
  --set config.baseUrl="https://sign.example.com" \
  --set database.url="<from terraform output>" \
  --set storage.bucket="<from terraform output>"
```

### Terraform Outputs

After deployment, Terraform outputs critical values:

```bash
terraform output rds_database_url    # AWS
terraform output database_url        # GCP
terraform output s3_bucket_name      # AWS
terraform output gcs_bucket_name     # GCP
terraform output kms_key_arn         # AWS
terraform output kms_key_name        # GCP
```

Use these values in your Helm `values.yaml`.

---

## Support

- **Documentation:** [https://github.com/coseal/coseal](https://github.com/coseal/coseal)
- **Issues:** [https://github.com/coseal/coseal/issues](https://github.com/coseal/coseal/issues)
- **Enterprise support:** Contact info (TBD)
