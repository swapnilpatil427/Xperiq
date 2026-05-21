# ── OCI Identity ──────────────────────────────────────────────────────────────
variable "tenancy_ocid" {
  description = "OCI tenancy OCID — found in OCI Console → Profile → Tenancy"
  type        = string
}

variable "user_ocid" {
  description = "OCI user OCID — found in OCI Console → Profile → User Settings"
  type        = string
}

variable "fingerprint" {
  description = "API key fingerprint — found in OCI Console → User Settings → API Keys"
  type        = string
}

variable "private_key_path" {
  description = "Path to OCI API private key PEM file (from oci setup config)"
  type        = string
  default     = "~/.oci/oci_api_key.pem"
}

variable "region" {
  description = "OCI region (e.g. us-ashburn-1, eu-frankfurt-1, ap-tokyo-1)"
  type        = string
  default     = "us-ashburn-1"
}

variable "compartment_id" {
  description = "OCI compartment OCID — use tenancy_ocid for the root compartment"
  type        = string
}

# ── VM Configuration ──────────────────────────────────────────────────────────
variable "ssh_public_key" {
  description = "SSH public key content (paste contents of ~/.ssh/id_ed25519.pub)"
  type        = string
}

variable "availability_domain_index" {
  description = "Which AD to use (0, 1, or 2). Try 0 first; if capacity error, try 1 or 2."
  type        = number
  default     = 0
}

variable "instance_ocpus" {
  description = "A1 Flex OCPUs — Always Free max is 4"
  type        = number
  default     = 4
}

variable "instance_memory_gb" {
  description = "A1 Flex RAM in GB — Always Free max is 24"
  type        = number
  default     = 24
}

variable "boot_volume_gb" {
  description = "Boot volume size in GB — Always Free total is 200 GB across all volumes"
  type        = number
  default     = 100
}

# ── Application ───────────────────────────────────────────────────────────────
variable "domain" {
  description = "Your production domain (e.g. yourdomain.com) — used in nginx + certbot"
  type        = string
}

variable "app_repo_url" {
  description = "Git clone URL for the Experient repo (HTTPS or SSH)"
  type        = string
}

variable "app_branch" {
  description = "Branch to deploy"
  type        = string
  default     = "main"
}

# ── Secrets (all marked sensitive — never printed in logs) ────────────────────
variable "db_password" {
  description = "PostgreSQL appuser password — generate with: openssl rand -hex 24"
  type        = string
  sensitive   = true
}

variable "redis_password" {
  description = "Redis requirepass — generate with: openssl rand -hex 24"
  type        = string
  sensitive   = true
}

variable "clerk_secret_key" {
  description = "Clerk sk_live_... secret key (from Clerk dashboard)"
  type        = string
  sensitive   = true
}

variable "openrouter_api_key" {
  description = "OpenRouter API key (sk-or-v1-...)"
  type        = string
  sensitive   = true
}

variable "anthropic_api_key" {
  description = "Anthropic API key (sk-ant-...)"
  type        = string
  sensitive   = true
}

variable "openai_api_key" {
  description = "OpenAI API key (sk-...) — used for text-embedding-3-small"
  type        = string
  sensitive   = true
  default     = ""
}

variable "agents_internal_key" {
  description = "Shared secret between backend and agents — generate with: openssl rand -hex 32"
  type        = string
  sensitive   = true
}

variable "sentry_dsn" {
  description = "Sentry DSN for error tracking (optional)"
  type        = string
  sensitive   = true
  default     = ""
}

variable "clerk_publishable_key" {
  description = "Clerk pk_live_... publishable key (baked into frontend build)"
  type        = string
  default     = ""
}
