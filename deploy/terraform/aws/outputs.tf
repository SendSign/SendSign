# ─── AWS Terraform Outputs ───────────────────────────────────────────

output "vpc_id" {
  description = "VPC ID"
  value       = aws_vpc.main.id
}

output "eks_cluster_name" {
  description = "EKS cluster name"
  value       = aws_eks_cluster.main.name
}

output "eks_cluster_endpoint" {
  description = "EKS cluster endpoint"
  value       = aws_eks_cluster.main.endpoint
}

output "eks_cluster_ca_certificate" {
  description = "EKS cluster CA certificate"
  value       = aws_eks_cluster.main.certificate_authority[0].data
  sensitive   = true
}

output "rds_endpoint" {
  description = "RDS PostgreSQL endpoint"
  value       = aws_db_instance.main.endpoint
}

output "rds_database_url" {
  description = "Full database connection string"
  value       = "postgresql://${var.db_username}:${var.db_password}@${aws_db_instance.main.endpoint}/${var.db_name}?sslmode=require"
  sensitive   = true
}

output "s3_bucket_name" {
  description = "S3 bucket for document storage"
  value       = aws_s3_bucket.documents.id
}

output "s3_bucket_arn" {
  description = "S3 bucket ARN"
  value       = aws_s3_bucket.documents.arn
}

output "kms_key_arn" {
  description = "KMS key ARN for encryption"
  value       = aws_kms_key.coseal.arn
}

output "kms_key_alias" {
  description = "KMS key alias"
  value       = aws_kms_alias.coseal.name
}

output "cloudwatch_log_group" {
  description = "CloudWatch log group name"
  value       = aws_cloudwatch_log_group.coseal.name
}

output "helm_install_command" {
  description = "Command to install the Helm chart"
  value       = <<-EOT
    # Configure kubectl
    aws eks update-kubeconfig --region ${var.aws_region} --name ${aws_eks_cluster.main.name}

    # Install CoSeal
    helm install coseal deploy/helm/coseal/ \
      --namespace coseal --create-namespace \
      --set config.baseUrl="https://${var.domain_name}" \
      --set database.url="postgresql://${var.db_username}:<password>@${aws_db_instance.main.endpoint}/${var.db_name}?sslmode=require" \
      --set storage.bucket="${aws_s3_bucket.documents.id}" \
      --set storage.region="${var.aws_region}"
  EOT
  sensitive = true
}
