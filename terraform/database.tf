# Phase 7: Secure Patient Data Management & Database Setup

resource "random_string" "sql_suffix" {
  length  = 6
  special = false
  upper   = false
}

# Azure SQL Server — Primary
resource "azurerm_mssql_server" "primary" {
  name                         = "${var.project_name}-sqlserver-${random_string.sql_suffix.result}"
  resource_group_name          = azurerm_resource_group.main.name
  location                     = azurerm_resource_group.main.location
  version                      = "12.0"
  administrator_login          = var.sql_admin_username
  administrator_login_password = var.sql_admin_password
  minimum_tls_version          = "1.2"

  azuread_administrator {
    login_username = "HMS-DBA-Group"
    object_id      = "00000000-0000-0000-0000-000000000000"  # Set to actual AAD group object ID
    tenant_id      = var.tenant_id
  }

  identity {
    type = "SystemAssigned"
  }

  tags = var.tags
}

# Azure SQL Database with TDE
resource "azurerm_mssql_database" "main" {
  name                        = "hms-database"
  server_id                   = azurerm_mssql_server.primary.id
  collation                   = "SQL_Latin1_General_CP1_CI_AS"
  sku_name                    = "GP_Gen5_4"
  max_size_gb                 = 256
  zone_redundant              = true
  read_scale                  = true
  auto_pause_delay_in_minutes = -1

  # Transparent Data Encryption is enabled by default on Azure SQL

  short_term_retention_policy {
    retention_days           = 35
    backup_interval_in_hours = 12
  }

  long_term_retention_policy {
    weekly_retention  = "P4W"
    monthly_retention = "P12M"
    yearly_retention  = "P5Y"
    week_of_year      = 1
  }

  threat_detection_policy {
    state                      = "Enabled"
    email_account_admins       = true
    retention_days             = 90
  }

  tags = var.tags
}

# Geo-Replication — Secondary SQL Server
resource "azurerm_mssql_server" "secondary" {
  name                         = "${var.project_name}-sqlserver-dr-${random_string.sql_suffix.result}"
  resource_group_name          = azurerm_resource_group.main.name
  location                     = var.location_secondary
  version                      = "12.0"
  administrator_login          = var.sql_admin_username
  administrator_login_password = var.sql_admin_password
  minimum_tls_version          = "1.2"

  identity {
    type = "SystemAssigned"
  }

  tags = var.tags
}

resource "azurerm_mssql_failover_group" "main" {
  name      = "${var.project_name}-failover-group"
  server_id = azurerm_mssql_server.primary.id
  databases = [azurerm_mssql_database.main.id]

  partner_server {
    id = azurerm_mssql_server.secondary.id
  }

  read_write_endpoint_failover_policy {
    mode          = "Automatic"
    grace_minutes = 60
  }

  readonly_endpoint_failover_policy_enabled = true
}

# SQL Firewall — Allow only from AKS subnet via VNet service endpoint
resource "azurerm_mssql_virtual_network_rule" "aks" {
  name      = "aks-subnet-rule"
  server_id = azurerm_mssql_server.primary.id
  subnet_id = azurerm_subnet.aks.id
}

# Microsoft Defender for SQL — Advanced Threat Protection
resource "azurerm_mssql_server_microsoft_support_auditing_policy" "main" {
  server_id                  = azurerm_mssql_server.primary.id
  blob_storage_endpoint      = azurerm_storage_account.audit.primary_blob_endpoint
  storage_account_access_key = azurerm_storage_account.audit.primary_access_key
  storage_account_access_key_is_secondary = false
  enabled                    = true
  log_monitoring_enabled     = true
}

# Azure Redis Cache — Phase 6: Caching for Performance
resource "azurerm_redis_cache" "main" {
  name                = "${var.project_name}-redis"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  capacity            = 2
  family              = "C"
  sku_name            = "Standard"
  enable_non_ssl_port = false
  minimum_tls_version = "1.2"

  redis_configuration {
    enable_authentication         = true
    maxmemory_reserved            = 50
    maxmemory_delta               = 50
    maxmemory_policy              = "allkeys-lru"
    rdb_backup_enabled            = true
    rdb_backup_frequency          = 60
    rdb_backup_max_snapshot_count = 1
  }

  patch_schedule {
    day_of_week    = "Sunday"
    start_hour_utc = 2
  }

  tags = var.tags
}

# Storage account for SQL audit logs
resource "azurerm_storage_account" "audit" {
  name                     = "${replace(var.project_name, "-", "")}auditlogs"
  resource_group_name      = azurerm_resource_group.main.name
  location                 = azurerm_resource_group.main.location
  account_tier             = "Standard"
  account_replication_type = "GRS"
  min_tls_version          = "TLS1_2"
  https_traffic_only_enabled = true

  blob_properties {
    delete_retention_policy {
      days = 35
    }
    versioning_enabled = true
  }

  tags = var.tags
}
