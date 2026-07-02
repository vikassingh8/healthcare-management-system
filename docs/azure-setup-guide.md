# Azure setup guide

This is the step-by-step for standing the system up on Azure. It follows the
order I'd actually do it in, because a lot of these resources depend on each
other (you can't put secrets in a Key Vault that doesn't exist yet). Most of it
is automated with the Terraform in `terraform/` — I'll point at the file that
does each piece rather than retyping every resource by hand, and call out the
manual steps where there are any.

Everything here describes the production deployment. For just running the app
locally, see the README — this guide is the cloud side.

## 0. Before you start

You need:

- An Azure subscription with Owner (or Contributor + User Access Administrator).
- `az` CLI, `terraform`, `kubectl`, and `docker` installed.
- Log in: `az login`, then `az account set --subscription "<your-sub-id>"`.

Set your own values in `terraform/variables.tf` — at minimum the region, the
tenant id, and the AAD admin group object id (there's a placeholder
`00000000-...` in `database.tf` that must be replaced with a real group).

## 1. Networking (VNet, subnets, firewall, gateway)

Handled by `terraform/networking.tf`.

What it builds and the order it matters in:

1. A **DDoS protection plan**, attached to the VNet (`ddos_protection_plan` block on the VNet).
2. The **virtual network** `10.0.0.0/16`.
3. **Subnets**, one per tier, so traffic between tiers can be controlled rather than open: `web` (10.0.1.0/24), `api` (10.0.2.0/24), `aks` (10.0.3.0/23), `database` (10.0.5.0/24), `appgw` (10.0.6.0/27), and `AzureFirewallSubnet` (10.0.7.0/26).
4. **Network security groups** for web, api and database, each with an explicit allow rule and a deny-all fallback. The database NSG only accepts 1433 from the api subnet — nothing from the internet.
5. **Azure Firewall** (Premium) for outbound control.
6. The **WAF policy** (OWASP 3.2 + bot rules) and the **Application Gateway** (WAF_v2) that enforces it on inbound traffic.
7. **Azure Front Door** (Standard) as the global front, routing to the Application Gateway.

To apply just this layer first if you want to do it in stages:

```bash
cd terraform
terraform init
terraform apply -target=azurerm_virtual_network.main -target=azurerm_firewall.main -target=azurerm_application_gateway.main
```

(In practice I just run a full `terraform apply` and let it work out the order.)

## 2. Identity and access management

Handled by `terraform/main.tf` (the app registration) and `terraform/security.tf` (groups, MFA).

- An **Azure AD app registration** (`azuread_application.hms_app`) is the OAuth2 / OpenID Connect identity for user sign-in.
- Three **security groups** — `HMS-Patients`, `HMS-Doctors`, `HMS-Administrators` — map to the application's three roles.
- A **Conditional Access policy** forces **MFA** for anyone in the doctors or admins groups. Patients sign in without the extra step; the higher-privilege accounts don't get a choice.

Manual step after apply: add real users to the three groups in the Azure portal (Entra ID > Groups). The app's own JWT-based RBAC (in code) then enforces per-endpoint permissions on top of this.

## 3. Security and compliance

Handled by `terraform/security.tf`.

- **Key Vault** (Premium, purge protection on, network-restricted to the AKS and API subnets). It holds the JWT signing secret, the DB connection string, and the RSA key used for SQL TDE.
- **Microsoft Defender for Cloud** plans turned on for SQL, containers and Key Vault.
- **Azure Policy** assignments that enforce the security baseline: deploy TDE on SQL, require Key Vault soft-delete, deny HTTP-only connections.
- A **security alert action group** that emails on triggered alerts.

Encryption is covered in two places: at rest by SQL TDE with the Key Vault key (section 5), and in transit by TLS 1.2+ enforced on the gateway, the SQL server (`minimum_tls_version = "1.2"`), Redis, and the storage account.

## 4. Containerisation and registry

Handled by `terraform/aks.tf` (the registry) and the two `Dockerfile`s.

1. Terraform creates the **Azure Container Registry** (with geo-replication and `admin_enabled = false` — pulls use the AKS managed identity, not a shared admin password).
2. Build and push the images:

   ```bash
   az acr login --name <youracr>
   docker build -t <youracr>.azurecr.io/hms-backend:1.0.0 ./backend
   docker build -t <youracr>.azurecr.io/hms-frontend:1.0.0 ./frontend
   docker push <youracr>.azurecr.io/hms-backend:1.0.0
   docker push <youracr>.azurecr.io/hms-frontend:1.0.0
   ```

   (The CI pipeline in `.github/workflows/ci-cd.yml` does this automatically on a push to main, tagged with the commit SHA.)

## 5. Database (Azure SQL + TDE + geo-replication)

Handled by `terraform/database.tf`.

- A primary **Azure SQL** server and database, with **TDE** on (customer-managed key from Key Vault) and TLS 1.2 minimum.
- A **secondary** server in the secondary region and a **failover group** with automatic failover — this is the geo-replication and the high-availability story.
- **Backups**: 35-day short-term retention plus long-term weekly/monthly/yearly retention.
- **Auditing** to a dedicated GRS storage account, and a **VNet rule** so the server only accepts connections from the AKS subnet.
- **Redis Cache** (Standard, non-SSL port disabled) for caching.

After apply, store the database connection string in Key Vault under
`db-connection-string` so the pods can read it (see section 6) — the secret name
is referenced in `kubernetes/secrets.yaml`.

## 6. Deploy to AKS (automated)

Handled by `terraform/aks.tf` and the manifests in `kubernetes/`.

1. Terraform creates the **AKS cluster** with: a system and an application node pool (both autoscaling), Azure CNI + network policy, the **Key Vault CSI** secrets provider, the **AGIC** add-on (so the Ingress drives the Application Gateway), AAD-integrated RBAC, and the monitoring agent.
2. Get credentials and apply the manifests:

   ```bash
   az aks get-credentials -g <rg> -n <cluster>
   kubectl apply -f kubernetes/
   kubectl rollout status deployment/hms-backend -n healthcare-system
   ```

The manifests bring up: the namespace, the `SecretProviderClass` that pulls
secrets from Key Vault, the two deployments (non-root, with probes, resource
limits and pod anti-affinity), the services, the Ingress (WAF-protected, TLS via
cert-manager), and the **horizontal pod autoscalers**.

## 7. Monitoring and performance

Handled by `terraform/main.tf` and `kubernetes/hpa.yaml`.

- **Log Analytics workspace** + **Application Insights** for logs, metrics and request tracing. The AKS monitoring agent ships cluster telemetry into the same workspace.
- The **HPAs** scale the backend (2–10 pods) and frontend (2–8) on CPU/memory.
- **Redis** and the database **indexes** (defined in the app schema) are the application-level performance levers.

## 8. Governance

Handled by `terraform/security.tf` (policy assignments) and resource tagging.

- **Azure Policy** (from section 3) is the main lever — it stops non-compliant resources being created (wrong region, oversized SKU, TDE off, Key Vault soft-delete disabled).
- Everything is **tagged** (`env`, `owner`) so ownership and scope are always clear.
- After deployment, review **Azure Advisor** in the portal for reliability and security recommendations.

## Tearing it down

Because some of these resources bill by the hour while they exist (the firewall and
gateway especially), destroy everything when you're done demonstrating:

```bash
cd terraform
terraform destroy
```

Key Vault has purge protection and a 90-day soft-delete, so its name stays
reserved for a while after destroy — worth knowing if you re-deploy with the
same names.
