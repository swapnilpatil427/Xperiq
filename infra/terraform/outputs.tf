output "vm_public_ip" {
  description = "Public IP of the VM — add this as an A record in Cloudflare DNS"
  value       = oci_core_instance.app.public_ip
}

output "vm_ssh_command" {
  description = "SSH command to connect to the VM"
  value       = "ssh -i ~/.ssh/id_ed25519 appuser@${oci_core_instance.app.public_ip}"
}

output "cloud_init_log_command" {
  description = "Watch cloud-init progress (run this after SSHing in)"
  value       = "ssh -i ~/.ssh/id_ed25519 appuser@${oci_core_instance.app.public_ip} 'sudo tail -f /var/log/cloud-init-output.log'"
}

output "ssl_setup_command" {
  description = "Run this AFTER DNS has propagated to the VM IP"
  value       = "ssh -i ~/.ssh/id_ed25519 appuser@${oci_core_instance.app.public_ip} '/home/appuser/setup-ssl.sh'"
}

output "backup_bucket" {
  description = "OCI Object Storage bucket name for database backups"
  value       = oci_objectstorage_bucket.backups.name
}

output "next_steps" {
  description = "What to do after terraform apply"
  value       = <<-EOT
    ✅ Infrastructure created.

    Next steps:
    1. Add this A record in Cloudflare DNS:
         ${var.domain}  →  ${oci_core_instance.app.public_ip}

    2. Watch cloud-init complete (~8-12 min):
         ${oci_core_instance.app.public_ip} tail -f /var/log/cloud-init-output.log

    3. After DNS propagates (~5 min on Cloudflare):
         ssh appuser@${oci_core_instance.app.public_ip} '/home/appuser/setup-ssl.sh'

    4. Build and deploy frontend:
         cd app && npm run build:app
         scp -r dist/ appuser@${oci_core_instance.app.public_ip}:/home/appuser/app/app/dist/

    5. Visit https://${var.domain}
  EOT
}
