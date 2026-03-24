# =============================================================================
# WeThePeople — GCP Resources
# =============================================================================
# Current production: e2-medium VM in us-east1-b running the API + scheduler.
# Static IP: 34.75.8.107
# =============================================================================

# ---------------------------------------------------------------------------
# Static external IP
# ---------------------------------------------------------------------------
resource "google_compute_address" "api" {
  name         = "${var.project_name}-api-ip"
  region       = var.gcp_region
  address_type = "EXTERNAL"
  description  = "Static IP for WeThePeople API server"
}

# ---------------------------------------------------------------------------
# Firewall: allow HTTP (8006) + SSH
# ---------------------------------------------------------------------------
resource "google_compute_firewall" "api" {
  name    = "${var.project_name}-api-allow"
  network = "default"

  allow {
    protocol = "tcp"
    ports    = [tostring(var.api_port), "22"]
  }

  source_ranges = ["0.0.0.0/0"]
  target_tags   = ["${var.project_name}-api"]
  description   = "Allow API traffic on port ${var.api_port} and SSH"
}

# ---------------------------------------------------------------------------
# Compute Instance — API Server
# ---------------------------------------------------------------------------
resource "google_compute_instance" "api" {
  name         = var.project_name
  machine_type = var.gcp_machine_type
  zone         = var.gcp_zone
  tags         = ["${var.project_name}-api"]

  boot_disk {
    initialize_params {
      image = "ubuntu-os-cloud/ubuntu-2204-lts"
      size  = var.gcp_disk_size_gb
      type  = "pd-standard"
    }
  }

  network_interface {
    network = "default"
    access_config {
      nat_ip = google_compute_address.api.address
    }
  }

  metadata = {
    ssh-keys = "${var.gcp_ssh_user}:${file(var.gcp_ssh_public_key_path)}"
  }

  # Startup script: install deps, clone repo, set up systemd services
  metadata_startup_script = <<-EOF
    #!/bin/bash
    set -e

    # Only run on first boot
    if [ -f /opt/wtp-initialized ]; then exit 0; fi

    apt-get update && apt-get install -y python3.11 python3.11-venv python3-pip git curl libcairo2

    # Create app directory
    sudo -u ${var.gcp_ssh_user} bash -c '
      cd ~
      git clone https://github.com/Obelus-Labs-LLC/WeThePeople.git wethepeople-backend
      cd wethepeople-backend
      python3.11 -m venv .venv
      .venv/bin/pip install -r requirements.txt
    '

    touch /opt/wtp-initialized
  EOF

  labels = {
    project     = var.project_name
    environment = var.environment
    managed_by  = "terraform"
  }

  # Prevent accidental destruction
  lifecycle {
    prevent_destroy = true
  }
}
