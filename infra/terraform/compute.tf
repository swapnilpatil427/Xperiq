# ── A1 Arm VM (Always Free: 4 OCPU / 24 GB RAM) ───────────────────────────────

locals {
  cloud_init = templatefile("${path.module}/cloud-init.yaml.tpl", {
    ssh_public_key      = var.ssh_public_key
    domain              = var.domain
    app_repo_url        = var.app_repo_url
    app_branch          = var.app_branch
    db_password         = var.db_password
    redis_password      = var.redis_password
    clerk_secret_key    = var.clerk_secret_key
    openrouter_api_key  = var.openrouter_api_key
    anthropic_api_key   = var.anthropic_api_key
    openai_api_key      = var.openai_api_key
    agents_internal_key = var.agents_internal_key
    sentry_dsn          = var.sentry_dsn
  })
}

resource "oci_core_instance" "app" {
  compartment_id = var.compartment_id

  # Pick AD by index — change availability_domain_index if capacity is unavailable
  availability_domain = data.oci_identity_availability_domains.ads.availability_domains[
    var.availability_domain_index
  ].name

  display_name = "experient-prod"
  shape        = "VM.Standard.A1.Flex"

  shape_config {
    ocpus         = var.instance_ocpus
    memory_in_gbs = var.instance_memory_gb
  }

  # Latest Ubuntu 22.04 ARM image
  source_details {
    source_type             = "image"
    source_id               = data.oci_core_images.ubuntu_arm.images[0].id
    boot_volume_size_in_gbs = var.boot_volume_gb
  }

  create_vnic_details {
    subnet_id        = oci_core_subnet.public.id
    assign_public_ip = true
    display_name     = "experient-prod-vnic"
  }

  metadata = {
    ssh_authorized_keys = var.ssh_public_key
    # base64-encoded cloud-init runs automatically on first boot
    user_data = base64encode(local.cloud_init)
  }

  # Prevent accidental destroy — remove this line if you want to allow destroy
  lifecycle {
    prevent_destroy = true
  }
}
