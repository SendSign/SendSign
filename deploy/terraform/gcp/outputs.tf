# ─── GCP Terraform Outputs ───────────────────────────────────────────

output "gke_cluster_name" {
  description = "GKE cluster name"
  value       = google_container_cluster.main.name
}

output "gke_cluster_endpoint" {
  description = "GKE cluster endpoint"
  value       = google_container_cluster.main.endpoint
  sensitive   = true
}

output "cloud_sql_connection_name" {
  description = "Cloud SQL connection name (for proxy)"
  value       = google_sql_database_instance.main.connection_name
}

output "cloud_sql_ip" {
  description = "Cloud SQL private IP address"
  value       = google_sql_database_instance.main.private_ip_address
}

output "database_url" {
  description = "PostgreSQL connection string"
  value       = "postgresql://${var.db_user}:${var.db_password}@${google_sql_database_instance.main.private_ip_address}:5432/${var.db_name}?sslmode=require"
  sensitive   = true
}

output "gcs_bucket_name" {
  description = "GCS bucket for document storage"
  value       = google_storage_bucket.documents.name
}

output "kms_key_name" {
  description = "KMS crypto key name"
  value       = google_kms_crypto_key.coseal.id
}

output "service_account_email" {
  description = "GCP service account for CoSeal pods"
  value       = google_service_account.coseal.email
}

output "helm_install_command" {
  description = "Command to install the Helm chart"
  value       = <<-EOT
    # Configure kubectl
    gcloud container clusters get-credentials ${google_container_cluster.main.name} \
      --region ${var.region} --project ${var.project_id}

    # Install CoSeal
    helm install coseal deploy/helm/coseal/ \
      --namespace coseal --create-namespace \
      --set config.baseUrl="https://${var.domain_name}" \
      --set database.url="postgresql://${var.db_user}:<password>@${google_sql_database_instance.main.private_ip_address}:5432/${var.db_name}" \
      --set storage.bucket="${google_storage_bucket.documents.name}" \
      --set storage.region="${var.region}" \
      --set serviceAccount.annotations."iam\\.gke\\.io/gcp-service-account"="${google_service_account.coseal.email}"
  EOT
  sensitive = true
}
