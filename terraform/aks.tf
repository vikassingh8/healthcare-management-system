# Phase 5: AKS Cluster — Containerized Deployment

resource "azurerm_container_registry" "main" {
  name                = "${replace(var.project_name, "-", "")}acr"
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
  sku                 = var.acr_sku
  admin_enabled       = false

  georeplications {
    location                = var.location_secondary
    zone_redundancy_enabled = true
  }

  network_rule_set {
    default_action = "Deny"
    ip_rule {
      action   = "Allow"
      ip_range = "0.0.0.0/0"  # Restrict to your CI/CD IP in production
    }
  }

  tags = var.tags
}

resource "azurerm_kubernetes_cluster" "main" {
  name                = "${var.project_name}-aks"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  dns_prefix          = "${var.project_name}-aks"
  kubernetes_version  = "1.29"

  default_node_pool {
    name                = "system"
    node_count          = var.aks_node_count
    vm_size             = var.aks_vm_size
    vnet_subnet_id      = azurerm_subnet.aks.id
    enable_auto_scaling = true
    min_count           = var.aks_min_nodes
    max_count           = var.aks_max_nodes
    os_disk_size_gb     = 128
    os_disk_type        = "Managed"
    max_pods            = 110

    node_labels = {
      "nodepool-type" = "system"
      "environment"   = var.environment
    }

    upgrade_settings {
      max_surge = "33%"
    }
  }

  identity {
    type = "SystemAssigned"
  }

  network_profile {
    network_plugin    = "azure"
    network_policy    = "azure"
    load_balancer_sku = "standard"
    outbound_type     = "loadBalancer"
  }

  oms_agent {
    log_analytics_workspace_id      = azurerm_log_analytics_workspace.main.id
    msi_auth_for_monitoring_enabled = true
  }

  microsoft_defender {
    log_analytics_workspace_id = azurerm_log_analytics_workspace.main.id
  }

  azure_active_directory_role_based_access_control {
    managed                = true
    azure_rbac_enabled     = true
    tenant_id              = var.tenant_id
  }

  key_vault_secrets_provider {
    secret_rotation_enabled  = true
    secret_rotation_interval = "2m"
  }

  auto_scaler_profile {
    balance_similar_node_groups  = false
    expander                     = "random"
    max_graceful_termination_sec = 600
    scale_down_delay_after_add   = "10m"
    scale_down_unneeded          = "10m"
    scan_interval                = "10s"
    skip_nodes_with_local_storage = false
    skip_nodes_with_system_pods   = true
  }

  maintenance_window {
    allowed {
      day   = "Sunday"
      hours = [2, 3]
    }
  }

  tags = var.tags
}

# Grant AKS pull access to ACR
resource "azurerm_role_assignment" "aks_acr_pull" {
  principal_id                     = azurerm_kubernetes_cluster.main.kubelet_identity[0].object_id
  role_definition_name             = "AcrPull"
  scope                            = azurerm_container_registry.main.id
  skip_service_principal_aad_check = true
}

# Application Node Pool (separate from system)
resource "azurerm_kubernetes_cluster_node_pool" "app" {
  name                  = "app"
  kubernetes_cluster_id = azurerm_kubernetes_cluster.main.id
  vm_size               = var.aks_vm_size
  vnet_subnet_id        = azurerm_subnet.aks.id
  enable_auto_scaling   = true
  min_count             = 1
  max_count             = 8
  node_count            = 2

  node_labels = {
    "nodepool-type" = "app"
    "tier"          = "application"
  }

  node_taints = ["CriticalAddonsOnly=true:NoSchedule"]

  tags = var.tags
}
