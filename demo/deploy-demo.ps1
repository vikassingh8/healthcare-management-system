# Healthcare Management System - free-tier demo deployment
#
# Stands up the parts of the design that have a free (or near-zero) tier, so the
# app and the surrounding Azure services can be shown live in the capstone video.
# The heavy enterprise services (Firewall, DDoS, AKS, APIM, Redis, geo-replicated
# SQL) are NOT deployed here - they cost thousands a month and are presented from
# the Terraform + architecture diagram instead.
#
# Run:  ./deploy-demo.ps1
# Tear down afterwards:  ./teardown-demo.ps1   (do this as soon as you finish recording)
#
# Prereqs: az CLI logged into YOUR account (az login), the containerapp extension
# (az extension add --name containerapp), and Docker not required (images build in
# ACR). Run from the repo root.

$ErrorActionPreference = 'Stop'

# --- names (suffix keeps globally-unique names from clashing) -----------------
$suffix   = -join ((48..57) + (97..122) | Get-Random -Count 6 | ForEach-Object {[char]$_})
$rg       = 'hms-demo-rg'
$loc      = 'eastus2'
$kv       = "hms-kv-$suffix"
$acr      = "hmsacr$suffix"
$sqlUser  = 'hmsadmin'
$sqlPass  = 'Hms@Demo2026!x'      # demo only - never a real password in real life
$sqlName  = "hms-sql-$suffix"

Write-Host "Deploying into subscription:" (az account show --query name -o tsv) "/" (az account show --query user.name -o tsv)
Write-Host "Suffix for this run: $suffix`n"

# --- resource group ----------------------------------------------------------
az group create -n $rg -l $loc --tags project=HMS env=demo purpose=video-demo -o none

# --- networking: VNet, web/data subnets, NSGs --------------------------------
az network vnet create -g $rg -n hms-demo-vnet --address-prefix 10.0.0.0/16 `
  --subnet-name web --subnet-prefix 10.0.1.0/24 -o none
az network vnet subnet create -g $rg --vnet-name hms-demo-vnet -n data --address-prefix 10.0.2.0/24 -o none
az network nsg create -g $rg -n hms-web-nsg -o none
az network nsg create -g $rg -n hms-data-nsg -o none
# the point of the design: the data subnet only accepts SQL from the web subnet
az network nsg rule create -g $rg --nsg-name hms-data-nsg -n allow-sql-from-web `
  --priority 100 --direction Inbound --access Allow --protocol Tcp `
  --source-address-prefixes 10.0.1.0/24 --destination-port-ranges 1433 -o none
az network nsg rule create -g $rg --nsg-name hms-data-nsg -n deny-other-from-vnet `
  --priority 200 --direction Inbound --access Deny --protocol '*' `
  --source-address-prefixes VirtualNetwork --destination-port-ranges '*' -o none
az network nsg rule create -g $rg --nsg-name hms-web-nsg -n allow-https `
  --priority 100 --direction Inbound --access Allow --protocol Tcp `
  --source-address-prefixes Internet --destination-port-ranges 443 -o none
az network vnet subnet update -g $rg --vnet-name hms-demo-vnet -n web --network-security-group hms-web-nsg -o none
az network vnet subnet update -g $rg --vnet-name hms-demo-vnet -n data --network-security-group hms-data-nsg -o none
Write-Host "networking + NSGs done"

# --- Key Vault: a secret and the TDE key -------------------------------------
az keyvault create -g $rg -n $kv -l $loc --enable-rbac-authorization false --sku standard -o none
az keyvault secret set --vault-name $kv -n jwt-secret --value "demo-jwt-signing-secret-$(Get-Random)" -o none
az keyvault key create --vault-name $kv -n tde-key --kty RSA --size 2048 -o none
Write-Host "key vault + secret + key done"

# --- Azure SQL: free-tier serverless DB (TDE is on by default) ---------------
# East US regions were refusing new SQL servers when this was built, so probe a
# few regions and take the first that accepts one. SQL can sit in a different
# region than the rest - it is independent here.
$sqlRegion = $null
foreach ($r in 'eastus2','eastus','westus2','westus3','centralus') {
  $n = "hms-sql-$r-$suffix"
  az sql server create -g $rg -n $n -l $r --admin-user $sqlUser --admin-password $sqlPass -o none 2>$null
  if ($LASTEXITCODE -eq 0) { $sqlRegion = $r; $sqlName = $n; break }
}
if (-not $sqlRegion) { throw "No region accepted a new SQL server - try again later." }
az sql server firewall-rule create -g $rg -s $sqlName -n AllowAzureServices `
  --start-ip-address 0.0.0.0 --end-ip-address 0.0.0.0 -o none
az sql db create -g $rg -s $sqlName -n hms-db --edition GeneralPurpose `
  --compute-model Serverless --family Gen5 --capacity 2 `
  --use-free-limit --free-limit-exhaustion-behavior AutoPause -o none 2>$null
if ($LASTEXITCODE -ne 0) {
  # free offer already used or unavailable - fall back to serverless auto-pause (cents)
  az sql db create -g $rg -s $sqlName -n hms-db --edition GeneralPurpose `
    --compute-model Serverless --family Gen5 --capacity 2 --auto-pause-delay 60 `
    --backup-storage-redundancy Local -o none
}
Write-Host "azure sql ($sqlRegion) done - TDE on by default"

# --- monitoring: Log Analytics + Application Insights ------------------------
az monitor log-analytics workspace create -g $rg -n hms-demo-logs -l $loc -o none
$laId = az monitor log-analytics workspace show -g $rg -n hms-demo-logs --query id -o tsv
az monitor app-insights component create --app hms-demo-appi -g $rg -l $loc --workspace $laId -o none
Write-Host "log analytics + app insights done"

# --- governance: an Azure Policy assignment ----------------------------------
$rgId = az group show -n $rg --query id -o tsv
az policy assignment create --name hms-allowed-locations --display-name "HMS demo - allowed locations" `
  --scope $rgId --policy e56962a6-4747-49cd-b67b-bf8b01975c4c `
  --params '{\"listOfAllowedLocations\":{\"value\":[\"eastus2\",\"eastus\",\"westus2\",\"centralus\",\"global\"]}}' -o none
Write-Host "azure policy assigned"

# --- identity: Entra ID groups + OIDC app registration -----------------------
# These are directory-level changes; if your account can't create them, skip and
# show identity via the app's own RBAC + the Terraform azuread resources instead.
foreach ($g in 'HMS-Patients','HMS-Doctors','HMS-Administrators') {
  az ad group create --display-name $g --mail-nickname $g -o none 2>$null
}
az ad app create --display-name "HMS-Healthcare-App" `
  --web-redirect-uris "https://hms-demo.azurecontainerapps.io/auth/callback" `
  --enable-id-token-issuance true --sign-in-audience AzureADMyOrg -o none 2>$null
Write-Host "entra id groups + app registration attempted"

# --- the app, live on Azure Container Apps -----------------------------------
az acr create -g $rg -n $acr --sku Basic --admin-enabled true -o none
$acrUser = az acr credential show -n $acr --query username -o tsv
$acrPass = az acr credential show -n $acr --query "passwords[0].value" -o tsv

# backend image (cloud build - no local Docker needed)
az acr build -r $acr -t hms-backend:v1 ./backend -o none

# Container Apps environment wired to our Log Analytics
$laCid = az monitor log-analytics workspace show -g $rg -n hms-demo-logs --query customerId -o tsv
$laKey = az monitor log-analytics workspace get-shared-keys -g $rg -n hms-demo-logs --query primarySharedKey -o tsv
az containerapp env create -n hms-demo-env -g $rg -l $loc `
  --logs-destination log-analytics --logs-workspace-id $laCid --logs-workspace-key $laKey -o none

# backend app - external ingress on 3001, seeds itself on first boot
$jwt = az keyvault secret show --vault-name $kv -n jwt-secret --query value -o tsv
az containerapp create -n hms-backend -g $rg --environment hms-demo-env `
  --image "$acr.azurecr.io/hms-backend:v1" --registry-server "$acr.azurecr.io" `
  --registry-username $acrUser --registry-password $acrPass `
  --target-port 3001 --ingress external --min-replicas 1 --max-replicas 2 `
  --cpu 0.5 --memory 1.0Gi `
  --env-vars NODE_ENV=production PORT=3001 SEED_ON_START=true JWT_SECRET=$jwt -o none
$backendFqdn = az containerapp show -n hms-backend -g $rg --query properties.configuration.ingress.fqdn -o tsv

# frontend image - bake the backend URL in at build time so the browser calls it directly
az acr build -r $acr -t hms-frontend:v1 --build-arg REACT_APP_API_URL="https://$backendFqdn/api" ./frontend -o none
az containerapp create -n hms-frontend -g $rg --environment hms-demo-env `
  --image "$acr.azurecr.io/hms-frontend:v1" --registry-server "$acr.azurecr.io" `
  --registry-username $acrUser --registry-password $acrPass `
  --target-port 80 --ingress external --min-replicas 1 --max-replicas 2 `
  --cpu 0.5 --memory 1.0Gi -o none
$frontendFqdn = az containerapp show -n hms-frontend -g $rg --query properties.configuration.ingress.fqdn -o tsv

# let the backend accept the frontend origin (CORS)
az containerapp update -n hms-backend -g $rg --set-env-vars ALLOWED_ORIGINS="https://$frontendFqdn" -o none

Write-Host "`n============================================================"
Write-Host "  App is live:  https://$frontendFqdn"
Write-Host "  Backend API:  https://$backendFqdn/health"
Write-Host "  Logins: patient1@example.com / Patient@1234  (admin@healthsys.com / Admin@1234)"
Write-Host "  Suffix for this run: $suffix"
Write-Host "  When you finish recording, run ./teardown-demo.ps1"
Write-Host "============================================================"
