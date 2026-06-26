# Healthcare Management System

A production-grade, HIPAA/GDPR-compliant healthcare management platform deployed on Microsoft Azure.

## Features

| Feature | Description |
|---------|-------------|
| **User Management** | Patient, Doctor, Admin roles with JWT auth + bcrypt |
| **Appointment Scheduling** | Book, confirm, cancel with conflict detection |
| **Electronic Health Records** | Role-based EHR creation and access |
| **Prescription Management** | Doctor-issued digital prescriptions |
| **Admin Control Panel** | RBAC administration, user management, audit logs |
| **Security Audit Trail** | HIPAA-compliant logging of all data access events |

## Architecture

```
Internet → Azure Front Door → Application Gateway (WAF) → AKS Ingress
                                                              ├── Frontend (Nginx/React)
                                                              └── Backend (Node.js API)
                                                                    ├── Azure SQL (TDE + Geo-replication)
                                                                    ├── Azure Key Vault
                                                                    ├── Azure Redis Cache
                                                                    └── Azure API Management
```

## Project Structure

```
.
├── backend/                  # Node.js/Express REST API
│   ├── src/
│   │   ├── app.js           # Express entry point
│   │   ├── database.js      # SQLite schema (Azure SQL in prod)
│   │   ├── seed.js          # Demo data seeding
│   │   ├── middleware/
│   │   │   ├── auth.js      # JWT + audit logging
│   │   │   └── rbac.js      # Role-Based Access Control
│   │   ├── routes/
│   │   │   ├── auth.js      # Register, login, me
│   │   │   ├── users.js     # User management + admin
│   │   │   ├── appointments.js
│   │   │   ├── ehr.js
│   │   │   └── prescriptions.js
│   │   └── __tests__/       # Jest integration tests
│   └── Dockerfile
├── frontend/                 # React.js SPA
│   ├── src/
│   │   ├── App.jsx          # Routes + protected routes
│   │   ├── api/api.js       # Axios client
│   │   ├── contexts/        # Auth context
│   │   └── pages/           # Patient, Doctor, Admin dashboards
│   ├── nginx.conf
│   └── Dockerfile
├── kubernetes/               # AKS manifests
│   ├── namespace.yaml
│   ├── backend-deployment.yaml
│   ├── frontend-deployment.yaml
│   ├── services.yaml
│   ├── ingress.yaml         # App Gateway + WAF
│   ├── hpa.yaml             # Horizontal Pod Autoscaler
│   └── secrets.yaml         # Azure Key Vault CSI
├── terraform/                # Azure Infrastructure as Code
│   ├── main.tf              # Resource group, App Insights
│   ├── networking.tf        # VNet, subnets, NSGs, Firewall, WAF
│   ├── aks.tf               # AKS cluster + ACR
│   ├── apim.tf              # Azure API Management
│   ├── database.tf          # Azure SQL + Redis Cache
│   ├── security.tf          # Key Vault, Azure AD, Defender, Policy
│   ├── variables.tf
│   └── outputs.tf
├── .github/workflows/
│   └── ci-cd.yml            # GitHub Actions pipeline
└── docker-compose.yml        # Local development
```

## Quick Start (Local)

### Prerequisites
- Node.js 20+
- Docker Desktop

### Run with Docker Compose
```bash
docker-compose up --build
```
App available at http://localhost:3000

### Run without Docker
```bash
# Backend
cd backend
npm install
node src/seed.js    # Create demo users
npm start           # Runs on :3001

# Frontend (new terminal)
cd frontend
npm install
npm start           # Runs on :3000
```

### Demo Credentials
| Role | Email | Password |
|------|-------|----------|
| Admin | admin@healthsys.com | Admin@1234 |
| Doctor | dr.smith@healthsys.com | Doctor@1234 |
| Patient | patient1@example.com | Patient@1234 |

## Azure Deployment

### 1. Provision Infrastructure
```bash
cd terraform
terraform init
terraform plan -var-file="production.tfvars" -out=tfplan
terraform apply tfplan
```

### 2. Configure AKS
```bash
az aks get-credentials --resource-group hms-production-rg --name hms-aks
```

### 3. Build & Push Images
```bash
az acr login --name hmsacr
docker build -t hmsacr.azurecr.io/hms-backend:1.0.0 ./backend
docker build -t hmsacr.azurecr.io/hms-frontend:1.0.0 ./frontend
docker push hmsacr.azurecr.io/hms-backend:1.0.0
docker push hmsacr.azurecr.io/hms-frontend:1.0.0
```

### 4. Deploy to AKS
```bash
kubectl apply -f kubernetes/
kubectl rollout status deployment/hms-backend -n healthcare-system
```

## Security

- **Authentication**: JWT (8h expiry) + bcrypt (cost 12)
- **Authorization**: Role-Based Access Control (PATIENT / DOCTOR / ADMIN)
- **MFA**: Mandatory for DOCTOR and ADMIN via Azure AD Conditional Access
- **Encryption at rest**: AES-256 via Azure SQL TDE with Key Vault-managed keys
- **Encryption in transit**: TLS 1.2+ enforced
- **API security**: Azure API Management + WAF (OWASP 3.2)
- **Network**: VNet isolation, NSGs, Azure Firewall, DDoS Protection
- **Compliance**: HIPAA audit trail, GDPR data minimization

## Running Tests
```bash
cd backend
npm install
npm test
```

## Azure Services Used

| Category | Service |
|----------|---------|
| Compute | Azure Kubernetes Service (AKS) |
| Networking | VNet, NSGs, Application Gateway, Azure Firewall, Front Door |
| Security | Azure AD, Key Vault, Defender for Cloud, DDoS Protection |
| API | Azure API Management (APIM) |
| Database | Azure SQL Database (TDE + Geo-replication), Redis Cache |
| Containers | Azure Container Registry (ACR) |
| Monitoring | Azure Monitor, Log Analytics, Application Insights |
| Governance | Azure Policy, Azure Cost Management, Azure Advisor |

## Compliance
- **HIPAA**: Audit logging, data encryption, access controls, BAA with Azure
- **GDPR**: Data minimization, right to access, breach notification via Defender for Cloud
