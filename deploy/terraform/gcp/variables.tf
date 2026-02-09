# ─── GCP Terraform Variables ─────────────────────────────────────────

variable "project_id" {
  description = "GCP project ID"
  type        = string
}

variable "project_name" {
  description = "Project name used for resource naming"
  type        = string
  default     = "coseal"
}

variable "environment" {
  description = "Environment (dev, staging, production)"
  type        = string
  default     = "production"
}

variable "region" {
  description = "GCP region"
  type        = string
  default     = "us-central1"
}

variable "zone" {
  description = "GCP zone"
  type        = string
  default     = "us-central1-a"
}

# ─── Database ────────────────────────────────────────────────────────

variable "db_tier" {
  description = "Cloud SQL instance tier"
  type        = string
  default     = "db-custom-2-4096"
}

variable "db_name" {
  description = "Database name"
  type        = string
  default     = "coseal"
}

variable "db_user" {
  description = "Database user"
  type        = string
  default     = "coseal"
  sensitive   = true
}

variable "db_password" {
  description = "Database password"
  type        = string
  sensitive   = true
}

# ─── GKE ─────────────────────────────────────────────────────────────

variable "gke_node_count" {
  description = "Number of GKE nodes"
  type        = number
  default     = 3
}

variable "gke_machine_type" {
  description = "GKE node machine type"
  type        = string
  default     = "e2-medium"
}

variable "gke_min_nodes" {
  description = "Minimum nodes for autoscaling"
  type        = number
  default     = 2
}

variable "gke_max_nodes" {
  description = "Maximum nodes for autoscaling"
  type        = number
  default     = 10
}

# ─── Storage ─────────────────────────────────────────────────────────

variable "gcs_bucket_name" {
  description = "GCS bucket name for document storage"
  type        = string
  default     = ""
}

variable "gcs_location" {
  description = "GCS bucket location"
  type        = string
  default     = "US"
}

# ─── Domain ──────────────────────────────────────────────────────────

variable "domain_name" {
  description = "Domain name for the signing UI"
  type        = string
  default     = ""
}

# ─── Labels ──────────────────────────────────────────────────────────

variable "labels" {
  description = "Labels to apply to all resources"
  type        = map(string)
  default = {
    project    = "coseal"
    managed-by = "terraform"
  }
}
