# =============================================================================
# WeThePeople — Oracle Cloud Infrastructure Resources
# =============================================================================
# Free tier resources:
#   - ARM VM (VM.Standard.A1.Flex): 1 OCPU / 6 GB — planned migration target
#   - Autonomous Database (Always Free): 20 GB — provisioned as WTPDB
#   - Object Storage: wtp-backups bucket for daily DB backups
#
# NOTE: ARM VMs are capacity-constrained. The oracle_retry.sh script handles
# retrying instance creation until capacity is available.
# =============================================================================

# ---------------------------------------------------------------------------
# Object Storage — DB backups
# ---------------------------------------------------------------------------
resource "oci_objectstorage_bucket" "backups" {
  compartment_id = var.oci_compartment_id
  namespace      = data.oci_objectstorage_namespace.ns.namespace
  name           = "wtp-backups"
  access_type    = "NoPublicAccess"
  storage_tier   = "Standard"

  freeform_tags = {
    project     = var.project_name
    environment = var.environment
    managed_by  = "terraform"
  }
}

data "oci_objectstorage_namespace" "ns" {
  compartment_id = var.oci_compartment_id
}

# ---------------------------------------------------------------------------
# Autonomous Database — Always Free tier
# ---------------------------------------------------------------------------
resource "oci_database_autonomous_database" "wtp" {
  compartment_id           = var.oci_compartment_id
  display_name             = "WTPDB"
  db_name                  = "WTPDB"
  db_workload              = "OLTP"
  is_free_tier             = true
  cpu_core_count           = 1
  data_storage_size_in_tbs = 1
  admin_password           = var.oci_adb_admin_password
  is_auto_scaling_enabled  = false

  # 20 GB storage on free tier
  # ECPU model for Always Free

  freeform_tags = {
    project     = var.project_name
    environment = var.environment
    managed_by  = "terraform"
  }

  lifecycle {
    prevent_destroy = true
  }
}

# ---------------------------------------------------------------------------
# ARM VM — Free tier (A1.Flex)
# ---------------------------------------------------------------------------
# NOTE: Free tier ARM instances are perpetually capacity-constrained.
# This resource may fail to create. Use oracle_retry.sh as a fallback.
# Uncomment when ready to manage via Terraform.
# ---------------------------------------------------------------------------
# resource "oci_core_instance" "wtp_prod" {
#   compartment_id      = var.oci_compartment_id
#   availability_domain = data.oci_identity_availability_domains.ads.availability_domains[0].name
#   display_name        = "wtp-prod"
#   shape               = "VM.Standard.A1.Flex"
#
#   shape_config {
#     ocpus         = 1
#     memory_in_gbs = 6
#   }
#
#   source_details {
#     source_type = "image"
#     source_id   = var.oci_image_id
#   }
#
#   create_vnic_details {
#     subnet_id        = var.oci_subnet_id
#     assign_public_ip = true
#   }
#
#   metadata = {
#     ssh_authorized_keys = file(var.oci_ssh_public_key_path)
#   }
#
#   freeform_tags = {
#     project     = var.project_name
#     environment = var.environment
#     managed_by  = "terraform"
#   }
#
#   lifecycle {
#     prevent_destroy = true
#   }
# }

data "oci_identity_availability_domains" "ads" {
  compartment_id = var.oci_tenancy_ocid
}
