# Phase 3 & 4: Identity, Access Management, Security & Compliance

data "azurerm_client_config" "current" {}

# Azure Key Vault — Phase 4: Encrypt sensitive data
resource "azurerm_key_vault" "main" {
  name                        = "${var.project_name}-keyvault"
  location                    = azurerm_resource_group.main.location
  resource_group_name         = azurerm_resource_group.main.name
  enabled_for_disk_encryption = true
  tenant_id                   = var.tenant_id
  soft_delete_retention_days  = 90
  purge_protection_enabled    = true
  sku_name                    = "premium"

  enabled_for_deployment          = true
  enabled_for_template_deployment = true

  network_acls {
    bypass                     = "AzureServices"
    default_action             = "Deny"
    virtual_network_subnet_ids = [azurerm_subnet.aks.id, azurerm_subnet.api.id]
  }

  # Access policy for AKS managed identity
  access_policy {
    tenant_id = var.tenant_id
    object_id = azurerm_kubernetes_cluster.main.identity[0].principal_id

    secret_permissions = ["Get", "List"]
    key_permissions    = ["Get", "UnwrapKey", "WrapKey"]
  }

  tags = var.tags
}

# Store JWT secret in Key Vault
resource "azurerm_key_vault_secret" "jwt_secret" {
  name         = "jwt-secret"
  value        = random_password.jwt_secret.result
  key_vault_id = azurerm_key_vault.main.id

  content_type    = "text/plain"
  expiration_date = "2026-12-31T00:00:00Z"

  tags = var.tags
}

resource "random_password" "jwt_secret" {
  length           = 64
  special          = true
  override_special = "!@#$%^&*"
}

# Key Vault Encryption Key for TDE customer-managed key
resource "azurerm_key_vault_key" "tde_key" {
  name         = "hms-tde-key"
  key_vault_id = azurerm_key_vault.main.id
  key_type     = "RSA"
  key_size     = 2048

  key_opts = ["decrypt", "encrypt", "sign", "unwrapKey", "verify", "wrapKey"]

  rotation_policy {
    automatic {
      time_after_creation = "P1Y"
    }
    expire_after         = "P2Y"
    notify_before_expiry = "P30D"
  }
}

# Azure Active Directory Groups for RBAC — Phase 3: IAM Setup
resource "azuread_group" "patients" {
  display_name     = "HMS-Patients"
  description      = "Healthcare patients with read-only access to their own records"
  security_enabled = true
}

resource "azuread_group" "doctors" {
  display_name     = "HMS-Doctors"
  description      = "Healthcare doctors with access to patient records and EHR management"
  security_enabled = true
}

resource "azuread_group" "administrators" {
  display_name     = "HMS-Administrators"
  description      = "Healthcare system administrators with full access"
  security_enabled = true
}

# Conditional Access Policy — enforces MFA for doctors and admins
resource "azuread_conditional_access_policy" "mfa_doctors_admins" {
  display_name = "HMS-MFA-Required-Doctors-Admins"
  state        = "enabled"

  conditions {
    client_app_types = ["all"]

    applications {
      included_applications = [azuread_application.hms_app.client_id]
    }

    users {
      included_groups = [
        azuread_group.doctors.id,
        azuread_group.administrators.id,
      ]
    }

    locations {
      included_locations = ["All"]
    }
  }

  grant_controls {
    operator          = "OR"
    built_in_controls = ["mfa"]
  }
}

# Microsoft Defender for Cloud — continuous security posture
resource "azurerm_security_center_subscription_pricing" "defender_sql" {
  tier          = "Standard"
  resource_type = "SqlServers"
}

resource "azurerm_security_center_subscription_pricing" "defender_containers" {
  tier          = "Standard"
  resource_type = "Containers"
}

resource "azurerm_security_center_subscription_pricing" "defender_keyvault" {
  tier          = "Standard"
  resource_type = "KeyVaults"
}

# Azure Policy — Enforce HIPAA/GDPR compliance — Phase 8: Governance
# "Deploy SQL DB transparent data encryption" — a DeployIfNotExists built-in.
# This needs a managed identity and a location on the assignment so the policy
# engine can remediate.
resource "azurerm_resource_group_policy_assignment" "sql_tde" {
  name                 = "deploy-sql-tde"
  resource_group_id    = azurerm_resource_group.main.id
  policy_definition_id = "/providers/Microsoft.Authorization/policyDefinitions/86a912f6-9a06-4e26-b447-11b16ba8659f"
  display_name         = "Deploy SQL Transparent Data Encryption"
  location             = azurerm_resource_group.main.location
  enforce              = true

  identity {
    type = "SystemAssigned"
  }
}

resource "azurerm_resource_group_policy_assignment" "keyvault_soft_delete" {
  name                 = "require-kv-soft-delete"
  resource_group_id    = azurerm_resource_group.main.id
  policy_definition_id = "/providers/Microsoft.Authorization/policyDefinitions/1e66c121-a66a-4b1f-9b83-0fd99bf0fc2d"
  display_name         = "Require Key Vault Soft Delete"
  enforce              = true
}

resource "azurerm_resource_group_policy_assignment" "https_only" {
  name                 = "deny-http-traffic"
  resource_group_id    = azurerm_resource_group.main.id
  policy_definition_id = "/providers/Microsoft.Authorization/policyDefinitions/a4af4a39-4135-47fb-b175-47fbdf85311d"
  display_name         = "Deny HTTP-only API connections"
  enforce              = true
}

# Azure Monitor Alert — Security threat detection
resource "azurerm_monitor_action_group" "security_alerts" {
  name                = "hms-security-alerts"
  resource_group_name = azurerm_resource_group.main.name
  short_name          = "HMSAlert"

  email_receiver {
    name                    = "security-team"
    email_address           = "security@healthsys.com"
    use_common_alert_schema = true
  }

  tags = var.tags
}

# Azure Monitor — Cost alert (Phase 8: Cost Management)
resource "azurerm_consumption_budget_resource_group" "main" {
  name              = "hms-monthly-budget"
  resource_group_id = azurerm_resource_group.main.id
  amount            = 5000
  time_grain        = "Monthly"

  # Azure requires the start date to be the first of a month and not in the
  # past relative to when this is applied.
  time_period {
    start_date = "2026-06-01T00:00:00Z"
    end_date   = "2027-12-31T23:59:59Z"
  }

  notification {
    enabled        = true
    threshold      = 80.0
    operator       = "GreaterThan"
    threshold_type = "Actual"
    contact_emails = ["admin@healthsys.com"]
  }

  notification {
    enabled        = true
    threshold      = 100.0
    operator       = "GreaterThan"
    threshold_type = "Forecasted"
    contact_emails = ["admin@healthsys.com"]
  }
}
