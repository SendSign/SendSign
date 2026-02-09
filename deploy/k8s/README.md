# CoSeal — Raw Kubernetes Manifests

Minimal Kubernetes manifests for deploying CoSeal without Helm.

## Prerequisites

- Kubernetes cluster (1.25+)
- `kubectl` configured to your cluster
- PostgreSQL database accessible from the cluster
- S3-compatible storage (AWS S3, MinIO, etc.)

## Deployment

### 1. Create secrets

```bash
kubectl create namespace coseal

kubectl create secret generic coseal-secrets \
  --namespace coseal \
  --from-literal=DATABASE_URL="postgresql://coseal:password@db-host:5432/coseal" \
  --from-literal=ENCRYPTION_KEY="your-32-character-encryption-key" \
  --from-literal=API_KEY="your-api-key"
```

### 2. Update configuration

Edit `deployment.yaml` to configure:
- `S3_BUCKET`, `S3_REGION` environment variables
- Image tag (replace `latest` with a specific version)
- Resource limits as needed

Edit `ingress.yaml` to configure:
- Your domain name (replace `sign.example.com`)
- TLS certificate issuer

### 3. Apply manifests

```bash
kubectl apply -f namespace.yaml
kubectl apply -f deployment.yaml
kubectl apply -f service.yaml
kubectl apply -f ingress.yaml
```

### 4. Verify

```bash
kubectl get pods -n coseal
kubectl get svc -n coseal
kubectl get ingress -n coseal
```

## Production Recommendations

For production, consider using the **Helm chart** instead, which provides:
- Horizontal Pod Autoscaler (HPA)
- Pod Disruption Budget (PDB)
- CronJobs for retention, reminders, and expiry
- ConfigMap/Secret separation
- External secrets support
- Templated configuration

See `deploy/helm/coseal/README.md` for details.
