# SendSign — Raw Kubernetes Manifests

Minimal Kubernetes manifests for deploying SendSign without Helm.

## Prerequisites

- Kubernetes cluster (1.25+)
- `kubectl` configured to your cluster
- PostgreSQL database accessible from the cluster
- S3-compatible storage (AWS S3, MinIO, etc.)

## Deployment

### 1. Create secrets

```bash
kubectl create namespace sendsign

kubectl create secret generic sendsign-secrets \
  --namespace sendsign \
  --from-literal=DATABASE_URL="postgresql://sendsign:password@db-host:5432/sendsign" \
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
kubectl get pods -n sendsign
kubectl get svc -n sendsign
kubectl get ingress -n sendsign
```

## Production Recommendations

For production, consider using the **Helm chart** instead, which provides:
- Horizontal Pod Autoscaler (HPA)
- Pod Disruption Budget (PDB)
- CronJobs for retention, reminders, and expiry
- ConfigMap/Secret separation
- External secrets support
- Templated configuration

See `deploy/helm/sendsign/README.md` for details.
