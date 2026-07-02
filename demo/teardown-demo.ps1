# Tears down the free-tier demo. Run this as soon as you've finished recording so
# nothing keeps billing (the ACR and, if the free SQL offer wasn't used, the
# serverless DB are the only things that cost anything, and only pennies a day).

$ErrorActionPreference = 'Continue'
$rg = 'hms-demo-rg'

Write-Host "Deleting resource group $rg (this removes networking, Key Vault, SQL, monitoring, ACR, Container Apps)..."
az group delete -n $rg --yes --no-wait

# Entra ID objects live in the directory, not the resource group, so remove them separately.
Write-Host "Removing Entra ID groups and the app registration..."
foreach ($g in 'HMS-Patients','HMS-Doctors','HMS-Administrators') {
  $id = az ad group show --group $g --query id -o tsv 2>$null
  if ($id) { az ad group delete --group $id 2>$null; Write-Host "  deleted group $g" }
}
$appId = az ad app list --display-name "HMS-Healthcare-App" --query "[0].id" -o tsv 2>$null
if ($appId) { az ad app delete --id $appId 2>$null; Write-Host "  deleted app registration" }

Write-Host "`nDone. The resource group delete runs in the background - check the portal in a few minutes."
Write-Host "Key Vault soft-deletes for 90 days; to free the name sooner:"
Write-Host "  az keyvault purge --name <the hms-kv-... name>"
