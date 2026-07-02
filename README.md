# Healthcare Management System

This is my capstone project for the Cloud Architecture & Azure module. It's a working healthcare app (patients, doctors, admins) that I built to run locally with Docker, plus the full Azure design and infrastructure-as-code for how it would be deployed in the cloud.

A quick note on scope: I built and tested the application end to end, and I wrote the Terraform/Kubernetes for the Azure side. I did **not** leave the heavy Azure resources (Azure Firewall, DDoS Standard, geo-replicated SQL) running on a student subscription — I ran the cheaper parts and treated the rest as design-and-IaC. The docs are explicit about what's actually deployed versus what the architecture specifies.

## What it does

- **Accounts and login** for three roles: patient, doctor, admin. Passwords are hashed with bcrypt, sessions use JWTs.
- **Appointments** — patients book a slot with a doctor, the app checks for clashes, doctors confirm or complete them.
- **Electronic Health Records** — doctors write up a visit (diagnosis, vitals, treatment). A patient can read their own records and nobody else's.
- **Prescriptions** — doctors issue them digitally, patients see their own list.
- **Admin panel** — manage users, change roles, deactivate accounts.
- **Audit log** — every login and every record access gets written to an audit table, which is the kind of thing HIPAA expects you to have.

## How the pieces fit together

In production the request path looks like this:

```
Internet
   │
   ▼
Azure Front Door  ──►  Application Gateway (WAF)  ──►  AKS Ingress
                                                          │
                                          ┌───────────────┴───────────────┐
                                          ▼                               ▼
                                   Frontend pod                     Backend pod
                                   (React + Nginx)                  (Node/Express)
                                                                         │
                            ┌──────────────┬──────────────┬─────────────┘
                            ▼              ▼              ▼
                       Azure SQL      Key Vault      Redis Cache
                       (TDE + geo-    (secrets,      (sessions,
                        replication)   TDE keys)      query cache)
```

Locally it's simpler: the React build is served by Nginx, which proxies `/api` to the Node backend, and the backend talks to a SQLite file instead of Azure SQL. Same code, smaller database. I kept the data layer behind one module (`backend/src/database.js`), so moving to Azure SQL is contained to that file — swap the `better-sqlite3` driver for an mssql one and read the connection string from Key Vault. The routes don't change. It's not literally zero work, but it's one module instead of every endpoint.

## Folder layout

```
backend/        Node/Express REST API + Jest tests
frontend/       React single-page app, served by Nginx
kubernetes/     AKS manifests (deployments, ingress, HPA, Key Vault CSI)
terraform/      Azure infra as code (VNet, AKS, SQL, Key Vault, APIM...)
docs/           Report and architecture notes
docker-compose.yml
```

## Running it locally

You'll need Node 20+ and Docker Desktop.

### The easy way (Docker)

```bash
docker-compose up --build
```

Then open http://localhost:3000. The backend comes up on :3001 behind the scenes.

### Without Docker

```bash
# terminal 1 — backend
cd backend
npm install
node src/seed.js     # creates the demo users
npm start            # listens on :3001

# terminal 2 — frontend
cd frontend
npm install
npm start            # opens on :3000
```

### Demo logins

| Role    | Email                   | Password     |
|---------|-------------------------|--------------|
| Admin   | admin@healthsys.com     | Admin@1234   |
| Doctor  | dr.smith@healthsys.com  | Doctor@1234  |
| Patient | patient1@example.com    | Patient@1234 |

(There's a second doctor and a second patient in the seed file too, if you want to test the "can't see other people's records" rule.)

## Tests

```bash
cd backend
npm test
```

There are 19 integration tests covering registration, login, the RBAC rules, and each resource. The interesting ones are the negative cases — a patient trying to read another patient's EHR gets a 403, a patient trying to write a prescription gets blocked, and so on. Those are the tests that actually prove the access control works.

## Deploying to Azure (the real version)

I'm not going to pretend this is a one-click deploy. The order that worked for me:

1. **Infrastructure** — `cd terraform && terraform init && terraform apply`. This stands up the resource group, VNet, AKS, ACR, SQL, Key Vault, etc. Read `variables.tf` first; you'll want to set your own region and admin object IDs.
2. **Get cluster creds** — `az aks get-credentials -g hms-production-rg -n hms-aks`.
3. **Build and push images** to ACR:
   ```bash
   az acr login --name hmsacr
   docker build -t hmsacr.azurecr.io/hms-backend:1.0.0 ./backend
   docker build -t hmsacr.azurecr.io/hms-frontend:1.0.0 ./frontend
   docker push hmsacr.azurecr.io/hms-backend:1.0.0
   docker push hmsacr.azurecr.io/hms-frontend:1.0.0
   ```
4. **Apply the manifests** — `kubectl apply -f kubernetes/` and wait for the rollout.

The GitHub Actions workflow in `.github/workflows/ci-cd.yml` does steps 3 and 4 automatically on a push to `main` (it runs the tests first and won't deploy if they fail).

## Security, in one place

- Auth: JWT with an 8-hour expiry, bcrypt at cost factor 12.
- Authorization: role checks plus a permission map in `backend/src/middleware/rbac.js`. A patient literally cannot call the EHR-create endpoint.
- MFA: enforced for doctors and admins through Azure AD Conditional Access (configured in `terraform/security.tf`).
- Encryption at rest: Azure SQL TDE with the key in Key Vault. At rest locally it's just a file, which is fine for a demo but I call that out in the report.
- In transit: TLS 1.2+ end to end, HSTS set in the app via Helmet.
- Network: the database subnet has no public route; it's reachable only from the AKS subnet via NSG rules. WAF sits in front for the OWASP top-10 stuff.
- Compliance: audit logging for HIPAA, data-minimisation and "export my data" thinking for GDPR. I treat these as design goals I can point to, not a certification.

## Azure services used

Networking — VNet, subnets, NSGs, Application Gateway, Azure Firewall, Front Door, DDoS Protection.
Identity — Azure AD, RBAC, MFA, OAuth2/OIDC.
Security — Key Vault, Defender for Cloud, WAF.
Compute & containers — AKS, ACR, Docker.
Data — Azure SQL (TDE + geo-replication), Redis Cache.
API — Azure API Management.
Monitoring — Azure Monitor, Log Analytics, Application Insights.
Governance — Azure Policy, Advisor.

There's a service-by-service rationale (why each one, and the cheaper alternative where there is one) in `docs/architecture.md`.
