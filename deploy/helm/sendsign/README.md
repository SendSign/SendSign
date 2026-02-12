# SendSign Helm Chart

Deploy SendSign on Kubernetes with production-ready defaults.

## Quick Start

```bash
# Add the chart repository (when published)
helm repo add sendsign https://charts.sendsign.dev

# Install with custom values
helm install sendsign sendsign/sendsign \
  --namespace sendsign \
  --create-namespace \
  -f values-production.yaml
```

## Local Development

```bash
# From the repo root
helm install sendsign deploy/helm/sendsign/ \
  --namespace sendsign \
  --create-namespace \
  --set config.baseUrl="http://localhost:3000" \
  --set database.url="postgresql://sendsign:password@postgres:5432/sendsign" \
  --set encryption.key="your-32-char-encryption-key-here" \
  --set auth.apiKey="dev-api-key"
```

## Configuration

See `values.yaml` for all available options. Key settings:

| Parameter | Description | Default |
|-----------|-------------|---------|
| `replicaCount` | Number of replicas | `2` |
| `config.baseUrl` | Public URL for signing links | `https://sign.example.com` |
| `database.url` | PostgreSQL connection string | `""` |
| `encryption.key` | AES-256-GCM encryption key | `""` |
| `storage.bucket` | S3 bucket for documents | `sendsign-documents` |
| `autoscaling.enabled` | Enable HPA | `true` |
| `autoscaling.minReplicas` | Minimum replicas | `2` |
| `autoscaling.maxReplicas` | Maximum replicas | `10` |
| `ingress.enabled` | Enable Ingress | `true` |
| `cronJobs.retention.enabled` | Enable retention cron | `true` |

## External Secrets

For production, use an external secret manager instead of Kubernetes secrets:

```yaml
externalSecret:
  enabled: true
  secretStoreName: "aws-secrets-manager"
  refreshInterval: "1h"
```

## Upgrading

```bash
helm upgrade sendsign sendsign/sendsign \
  --namespace sendsign \
  -f values-production.yaml
```

## Uninstalling

```bash
helm uninstall sendsign --namespace sendsign
```
