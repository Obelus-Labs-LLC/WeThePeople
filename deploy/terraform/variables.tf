# =============================================================================
# WeThePeople — Terraform Variables
# =============================================================================
# All configurable values. Override via terraform.tfvars or -var flags.
# No secrets here — use environment variables for credentials.
# =============================================================================

# ---------------------------------------------------------------------------
# General
# ---------------------------------------------------------------------------

variable "project_name" {
  description = "Project identifier used in resource naming"
  type        = string
  default     = "wethepeople"
}

variable "environment" {
  description = "Deployment environment (production, staging)"
  type        = string
  default     = "production"
}

# ---------------------------------------------------------------------------
# GCP
# ---------------------------------------------------------------------------

variable "gcp_project_id" {
  description = "GCP project ID"
  type        = string
}

variable "gcp_region" {
  description = "GCP region for resources"
  type        = string
  default     = "us-east1"
}

variable "gcp_zone" {
  description = "GCP zone for the VM"
  type        = string
  default     = "us-east1-b"
}

variable "gcp_machine_type" {
  description = "GCP VM machine type"
  type        = string
  default     = "e2-medium"
}

variable "gcp_disk_size_gb" {
  description = "Boot disk size in GB"
  type        = number
  default     = 50
}

variable "gcp_ssh_user" {
  description = "SSH username for the GCP VM"
  type        = string
  default     = "dshon"
}

variable "gcp_ssh_public_key_path" {
  description = "Path to SSH public key for GCP VM access"
  type        = string
  default     = "~/.ssh/id_ed25519.pub"
}

# ---------------------------------------------------------------------------
# Oracle Cloud Infrastructure (OCI)
# ---------------------------------------------------------------------------

variable "oci_tenancy_ocid" {
  description = "OCI tenancy OCID"
  type        = string
}

variable "oci_user_ocid" {
  description = "OCI user OCID"
  type        = string
}

variable "oci_fingerprint" {
  description = "OCI API key fingerprint"
  type        = string
}

variable "oci_private_key_path" {
  description = "Path to OCI API private key"
  type        = string
  default     = "~/.oci/oci_api_key.pem"
}

variable "oci_region" {
  description = "OCI region"
  type        = string
  default     = "us-chicago-1"
}

variable "oci_compartment_id" {
  description = "OCI compartment OCID (defaults to tenancy root)"
  type        = string
}

variable "oci_image_id" {
  description = "OCI ARM VM image OCID (Ubuntu/Oracle Linux)"
  type        = string
}

variable "oci_subnet_id" {
  description = "OCI subnet OCID for VM placement"
  type        = string
}

variable "oci_ssh_public_key_path" {
  description = "Path to SSH public key for OCI VM access"
  type        = string
  default     = "~/.ssh/id_ed25519.pub"
}

variable "oci_adb_admin_password" {
  description = "Admin password for Oracle Autonomous Database"
  type        = string
  sensitive   = true
}

# ---------------------------------------------------------------------------
# DNS
# ---------------------------------------------------------------------------

variable "domain" {
  description = "Primary domain (managed in Vercel DNS)"
  type        = string
  default     = "wethepeopleforus.com"
}

variable "api_subdomain" {
  description = "Subdomain for the API"
  type        = string
  default     = "api"
}

# ---------------------------------------------------------------------------
# Application
# ---------------------------------------------------------------------------

variable "api_port" {
  description = "Port the backend API listens on"
  type        = number
  default     = 8006
}
