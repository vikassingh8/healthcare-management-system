output "resource_group_name" {
  value       = azurerm_resource_group.main.name
  description = "Name of the Azure Resource Group"
}

output "aks_cluster_name" {
  value       = azurerm_kubernetes_cluster.main.name
  description = "AKS cluster name (use with: az aks get-credentials)"
}

output "acr_login_server" {
  value       = azurerm_container_registry.main.login_server
  description = "Azure Container Registry login server URL"
}

output "key_vault_uri" {
  value       = azurerm_key_vault.main.vault_uri
  description = "Azure Key Vault URI for secret retrieval"
  sensitive   = false
}

output "sql_server_fqdn" {
  value       = azurerm_mssql_server.primary.fully_qualified_domain_name
  description = "Primary Azure SQL Server FQDN"
  sensitive   = false
}

output "sql_failover_fqdn" {
  value       = azurerm_mssql_failover_group.main.id
  description = "SQL Failover Group endpoint"
}

output "redis_hostname" {
  value       = azurerm_redis_cache.main.hostname
  description = "Redis Cache hostname"
}

output "application_insights_connection_string" {
  value       = azurerm_application_insights.main.connection_string
  description = "Application Insights connection string"
  sensitive   = true
}

output "vnet_id" {
  value       = azurerm_virtual_network.main.id
  description = "Virtual Network resource ID"
}
