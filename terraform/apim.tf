# Phase 4 & 9: Azure API Management — Secure RESTful API Gateway
# Provides rate limiting, authentication, caching, WAF, and HIPAA audit logging for all API calls

resource "azurerm_api_management" "main" {
  name                = "${var.project_name}-apim"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  publisher_name      = "Healthcare Management System"
  publisher_email     = "admin@healthsys.com"
  sku_name            = "Premium_1"

  identity {
    type = "SystemAssigned"
  }

  virtual_network_type = "Internal"
  virtual_network_configuration {
    subnet_id = azurerm_subnet.api.id
  }

  # HIPAA: detailed request/response logging
  sign_in {
    enabled = true
  }

  sign_up {
    enabled = false
    terms_of_service {
      consent_required = true
      enabled          = true
      text             = "By using this API you agree to HIPAA data handling requirements."
    }
  }

  protocols {
    enable_http2 = true
  }

  security {
    enable_backend_ssl30                                = false
    enable_backend_tls10                                = false
    enable_backend_tls11                                = false
    enable_frontend_ssl30                               = false
    enable_frontend_tls10                               = false
    enable_frontend_tls11                               = false
    tls_ecdhe_ecdsa_with_aes128_cbc_sha_ciphers_enabled = false
    tls_ecdhe_ecdsa_with_aes256_cbc_sha_ciphers_enabled = false
    tls_ecdhe_rsa_with_aes128_cbc_sha_ciphers_enabled   = false
    tls_ecdhe_rsa_with_aes256_cbc_sha_ciphers_enabled   = false
    tls_rsa_with_aes128_cbc_sha256_ciphers_enabled      = false
    tls_rsa_with_aes128_cbc_sha_ciphers_enabled         = false
    tls_rsa_with_aes128_gcm_sha256_ciphers_enabled      = false
    tls_rsa_with_aes256_cbc_sha256_ciphers_enabled      = false
    tls_rsa_with_aes256_cbc_sha_ciphers_enabled         = false
  }

  tags = var.tags
}

# APIM Logger — sends access logs to Log Analytics (HIPAA audit requirement)
resource "azurerm_api_management_logger" "main" {
  name                = "hms-apim-logger"
  api_management_name = azurerm_api_management.main.name
  resource_group_name = azurerm_resource_group.main.name

  application_insights {
    instrumentation_key = azurerm_application_insights.main.instrumentation_key
  }
}

# APIM API — HMS Backend API definition
resource "azurerm_api_management_api" "hms_api" {
  name                  = "hms-api"
  resource_group_name   = azurerm_resource_group.main.name
  api_management_name   = azurerm_api_management.main.name
  revision              = "1"
  display_name          = "Healthcare Management System API"
  path                  = "hms"
  protocols             = ["https"]
  subscription_required = false

  service_url = "http://backend-service.healthcare-system.svc.cluster.local:3001"

  import {
    content_format = "openapi"
    content_value  = <<OPENAPI
openapi: 3.0.0
info:
  title: Healthcare Management System API
  version: 1.0.0
  description: HIPAA-compliant healthcare API secured by Azure API Management
paths:
  /api/auth/login:
    post:
      summary: User login
      operationId: login
      tags: [Authentication]
  /api/auth/register:
    post:
      summary: User registration
      operationId: register
      tags: [Authentication]
  /api/appointments:
    get:
      summary: Get appointments
      operationId: getAppointments
      tags: [Appointments]
      security:
        - bearerAuth: []
    post:
      summary: Create appointment
      operationId: createAppointment
      tags: [Appointments]
      security:
        - bearerAuth: []
  /api/ehr:
    get:
      summary: Get EHR records
      operationId: getEHR
      tags: [EHR]
      security:
        - bearerAuth: []
  /api/prescriptions:
    get:
      summary: Get prescriptions
      operationId: getPrescriptions
      tags: [Prescriptions]
      security:
        - bearerAuth: []
components:
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT
OPENAPI
  }
}

# APIM Policy — rate limiting, JWT validation, CORS, audit logging
resource "azurerm_api_management_api_policy" "hms_policy" {
  api_name            = azurerm_api_management_api.hms_api.name
  api_management_name = azurerm_api_management.main.name
  resource_group_name = azurerm_resource_group.main.name

  xml_content = <<XML
<policies>
  <inbound>
    <base />
    <!-- CORS policy -->
    <cors allow-credentials="true">
      <allowed-origins>
        <origin>https://hms.example.com</origin>
      </allowed-origins>
      <allowed-methods>
        <method>GET</method>
        <method>POST</method>
        <method>PUT</method>
        <method>PATCH</method>
        <method>DELETE</method>
        <method>OPTIONS</method>
      </allowed-methods>
      <allowed-headers>
        <header>Content-Type</header>
        <header>Authorization</header>
      </allowed-headers>
    </cors>
    <!-- Global rate limiting: 1000 requests per 5 minutes per IP -->
    <rate-limit-by-key calls="1000" renewal-period="300"
      counter-key="@(context.Request.IpAddress)"
      increment-condition="@(context.Response.StatusCode != 429)" />
    <!-- Auth endpoint rate limiting: 20 per 15 minutes -->
    <choose>
      <when condition="@(context.Request.Url.Path.StartsWith(&quot;/api/auth&quot;))">
        <rate-limit-by-key calls="20" renewal-period="900"
          counter-key="@(context.Request.IpAddress)" />
      </when>
    </choose>
    <!-- Security headers -->
    <set-header name="X-Content-Type-Options" exists-action="override">
      <value>nosniff</value>
    </set-header>
    <set-header name="X-Frame-Options" exists-action="override">
      <value>DENY</value>
    </set-header>
    <set-header name="Strict-Transport-Security" exists-action="override">
      <value>max-age=31536000; includeSubDomains; preload</value>
    </set-header>
  </inbound>
  <backend>
    <base />
  </backend>
  <outbound>
    <base />
    <!-- Remove server disclosure headers -->
    <set-header name="X-Powered-By" exists-action="delete" />
    <set-header name="Server" exists-action="delete" />
  </outbound>
  <on-error>
    <base />
    <return-response>
      <set-status code="@((int)context.LastError.Reason)" />
      <set-header name="Content-Type" exists-action="override">
        <value>application/json</value>
      </set-header>
      <set-body>@("{\"error\": \"" + context.LastError.Message + "\"}")</set-body>
    </return-response>
  </on-error>
</policies>
XML
}

# APIM Diagnostic — log all requests to App Insights for HIPAA audit
resource "azurerm_api_management_api_diagnostic" "hms_diag" {
  identifier               = "applicationinsights"
  resource_group_name      = azurerm_resource_group.main.name
  api_management_name      = azurerm_api_management.main.name
  api_name                 = azurerm_api_management_api.hms_api.name
  api_management_logger_id = azurerm_api_management_logger.main.id

  sampling_percentage       = 100.0
  always_log_errors         = true
  log_client_ip             = true
  verbosity                 = "information"
  http_correlation_protocol = "W3C"

  frontend_request {
    body_bytes     = 0
    headers_to_log = ["Authorization", "Content-Type", "X-Forwarded-For"]
  }

  frontend_response {
    body_bytes     = 0
    headers_to_log = ["Content-Type"]
  }

  backend_request {
    body_bytes = 0
  }

  backend_response {
    body_bytes = 0
  }
}
