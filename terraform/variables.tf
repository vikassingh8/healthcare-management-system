variable "location" {
  description = "Azure region for primary deployment"
  type        = string
  default     = "East US 2"
}

variable "location_secondary" {
  description = "Azure region for geo-replication (DR)"
  type        = string
  default     = "West US 2"
}

variable "resource_group_name" {
  description = "Name of the Azure resource group"
  type        = string
  default     = "hms-production-rg"
}

variable "environment" {
  description = "Deployment environment tag"
  type        = string
  default     = "production"
}

variable "project_name" {
  description = "Project identifier used in resource naming"
  type        = string
  default     = "hms"
}

variable "aks_node_count" {
  description = "Initial AKS node count"
  type        = number
  default     = 3
}

variable "aks_min_nodes" {
  description = "Minimum AKS nodes for auto-scaling"
  type        = number
  default     = 2
}

variable "aks_max_nodes" {
  description = "Maximum AKS nodes for auto-scaling"
  type        = number
  default     = 10
}

variable "aks_vm_size" {
  description = "AKS node VM size"
  type        = string
  default     = "Standard_D4s_v3"
}

variable "sql_admin_username" {
  description = "Azure SQL admin username"
  type        = string
  default     = "hms_admin"
}

variable "sql_admin_password" {
  description = "Azure SQL admin password (stored in Key Vault)"
  type        = string
  sensitive   = true
}

variable "tenant_id" {
  description = "Azure Active Directory Tenant ID"
  type        = string
}

variable "subscription_id" {
  description = "Azure Subscription ID"
  type        = string
}

variable "acr_sku" {
  description = "Azure Container Registry SKU"
  type        = string
  default     = "Premium"
}

variable "tags" {
  description = "Common tags for all resources"
  type        = map(string)
  default = {
    Project     = "Healthcare-Management-System"
    Environment = "Production"
    Compliance  = "HIPAA-GDPR"
    ManagedBy   = "Terraform"
    CostCenter  = "IT-Healthcare"
  }
}
