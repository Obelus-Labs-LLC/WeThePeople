# =============================================================================
# WeThePeople — Terraform Main Configuration
# =============================================================================
# Represents the CURRENT infrastructure state:
#   - GCP e2-medium VM (production API + scheduler)
#   - Oracle Cloud free tier (Autonomous DB + Object Storage + planned ARM VMs)
#   - DNS: api.wethepeopleforus.com -> GCP VM
#   - Frontend: Vercel (not managed by Terraform — auto-deploys via GitHub)
#
# Usage:
#   cd deploy/terraform
#   terraform init
#   terraform plan -var-file="production.tfvars"
#   terraform apply -var-file="production.tfvars"
#
# NOTE: This codifies existing infrastructure. Import existing resources
# before applying to avoid recreation:
#   terraform import google_compute_instance.api projects/PROJECT/zones/us-east1-b/instances/wethepeople
# =============================================================================

terraform {
  required_version = ">= 1.5.0"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
    oci = {
      source  = "oracle/oci"
      version = "~> 5.0"
    }
  }

  # Remote state (optional — uncomment to use GCS or OCI Object Storage)
  # backend "gcs" {
  #   bucket = "wethepeople-tfstate"
  #   prefix = "terraform/state"
  # }
}

# ---------------------------------------------------------------------------
# Provider: Google Cloud Platform
# ---------------------------------------------------------------------------
provider "google" {
  project = var.gcp_project_id
  region  = var.gcp_region
  zone    = var.gcp_zone
  # Credentials: set GOOGLE_APPLICATION_CREDENTIALS env var or use gcloud auth
}

# ---------------------------------------------------------------------------
# Provider: Oracle Cloud Infrastructure
# ---------------------------------------------------------------------------
provider "oci" {
  tenancy_ocid     = var.oci_tenancy_ocid
  user_ocid        = var.oci_user_ocid
  fingerprint      = var.oci_fingerprint
  private_key_path = var.oci_private_key_path
  region           = var.oci_region
}
