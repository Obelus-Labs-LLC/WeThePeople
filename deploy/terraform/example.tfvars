# =============================================================================
# WeThePeople — Example Terraform Variables
# =============================================================================
# Copy to production.tfvars and fill in actual values.
# NEVER commit production.tfvars — it's gitignored.
# =============================================================================

# General
project_name = "wethepeople"
environment  = "production"

# GCP
gcp_project_id          = "your-gcp-project-id"
gcp_region              = "us-east1"
gcp_zone                = "us-east1-b"
gcp_machine_type        = "e2-medium"
gcp_disk_size_gb        = 50
gcp_ssh_user            = "dshon"
gcp_ssh_public_key_path = "~/.ssh/id_ed25519.pub"

# OCI
oci_tenancy_ocid        = "ocid1.tenancy.oc1..example"
oci_user_ocid           = "ocid1.user.oc1..example"
oci_fingerprint         = "aa:bb:cc:dd:ee:ff:00:11:22:33:44:55:66:77:88:99"
oci_private_key_path    = "~/.oci/oci_api_key.pem"
oci_region              = "us-chicago-1"
oci_compartment_id      = "ocid1.tenancy.oc1..example"
oci_image_id            = "ocid1.image.oc1.us-chicago-1.example"
oci_subnet_id           = "ocid1.subnet.oc1.us-chicago-1.example"
oci_ssh_public_key_path = "~/.ssh/id_ed25519.pub"
oci_adb_admin_password  = "CHANGE_ME_StrongPassword123!"

# DNS
domain        = "wethepeopleforus.com"
api_subdomain = "api"

# Application
api_port = 8006
