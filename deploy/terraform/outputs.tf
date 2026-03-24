# =============================================================================
# WeThePeople — Terraform Outputs
# =============================================================================

# ---------------------------------------------------------------------------
# GCP
# ---------------------------------------------------------------------------

output "gcp_vm_ip" {
  description = "Public IP address of the GCP API server"
  value       = google_compute_address.api.address
}

output "gcp_vm_name" {
  description = "GCP VM instance name"
  value       = google_compute_instance.api.name
}

output "gcp_ssh_command" {
  description = "SSH command to connect to the GCP VM"
  value       = "gcloud compute ssh ${google_compute_instance.api.name} --zone ${var.gcp_zone}"
}

output "gcp_deploy_command" {
  description = "Command to deploy backend updates"
  value       = "gcloud compute ssh ${google_compute_instance.api.name} --zone ${var.gcp_zone} --command \"cd ~/wethepeople-backend && git pull origin main && sudo systemctl restart wethepeople\""
}

# ---------------------------------------------------------------------------
# OCI
# ---------------------------------------------------------------------------

output "oci_adb_connection_string" {
  description = "Oracle Autonomous Database connection info"
  value       = oci_database_autonomous_database.wtp.connection_strings[0].all_connection_strings["LOW"]
  sensitive   = true
}

output "oci_backup_bucket" {
  description = "OCI Object Storage bucket for DB backups"
  value       = oci_objectstorage_bucket.backups.name
}

output "oci_backup_namespace" {
  description = "OCI Object Storage namespace"
  value       = data.oci_objectstorage_namespace.ns.namespace
}

# ---------------------------------------------------------------------------
# Application URLs
# ---------------------------------------------------------------------------

output "api_url" {
  description = "Backend API URL"
  value       = "http://${var.api_subdomain}.${var.domain}:${var.api_port}"
}

output "frontend_url" {
  description = "Frontend URL (Vercel)"
  value       = "https://${var.domain}"
}
