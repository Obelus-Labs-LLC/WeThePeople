# =============================================================================
# WeThePeople — DNS Configuration
# =============================================================================
# DNS is managed in Vercel's dashboard, not via a Terraform DNS provider.
# This file documents the current DNS records for reference and potential
# future migration to Terraform-managed DNS.
#
# Current records (managed in Vercel DNS):
#   wethepeopleforus.com        -> Vercel (auto-configured)
#   api.wethepeopleforus.com    -> A record -> 34.75.8.107 (GCP VM)
#
# Frontend: Vercel handles DNS + TLS automatically.
# Backend:  A record pointing to GCP static IP, no TLS (HTTP only).
#
# TODO: When migrating to a Terraform-managed DNS provider (e.g., Cloudflare),
# replace these comments with actual resource blocks.
# =============================================================================

# ---------------------------------------------------------------------------
# Reference: DNS records to create when migrating to Terraform DNS
# ---------------------------------------------------------------------------
# Example with Cloudflare (uncomment and configure when ready):
#
# resource "cloudflare_record" "api" {
#   zone_id = var.cloudflare_zone_id
#   name    = var.api_subdomain
#   type    = "A"
#   content = google_compute_address.api.address
#   ttl     = 300
#   proxied = false  # Direct connection for API traffic
# }
#
# resource "cloudflare_record" "root" {
#   zone_id = var.cloudflare_zone_id
#   name    = "@"
#   type    = "CNAME"
#   content = "cname.vercel-dns.com"
#   ttl     = 300
#   proxied = false
# }

# ---------------------------------------------------------------------------
# Output the expected DNS mapping for documentation
# ---------------------------------------------------------------------------
output "dns_records" {
  description = "DNS records that should exist (managed in Vercel DNS)"
  value = {
    "${var.api_subdomain}.${var.domain}" = {
      type  = "A"
      value = google_compute_address.api.address
      note  = "Points to GCP VM running the API"
    }
    "${var.domain}" = {
      type  = "CNAME"
      value = "cname.vercel-dns.com"
      note  = "Managed by Vercel auto-deploy"
    }
  }
}
