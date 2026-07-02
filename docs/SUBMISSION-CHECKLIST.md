# Submission checklist

A quick map of what the graders are looking for and where it lives, so nothing
slips through the cracks before I submit.

## Required submission components

| Component | Where it is | Done? |
|---|---|---|
| Project report (document) | `docs/Healthcare_Management_System_Report.docx` (generated from `docs/project-report.md`) | yes |
| Code repository link | push this folder to GitHub/GitLab and paste the link | to do |

## Rubric coverage

| Category | Weight | Covered by |
|---|---|---|
| Project Planning & Design | 15 | `docs/project-report.md` §1–2, `docs/architecture.md`, `docs/azure-setup-guide.md`, the diagram |
| Networking & Security Implementation | 15 | `terraform/networking.tf` (VNet, NSGs, Firewall, App Gateway + WAF, Front Door, DDoS), `docs/azure-setup-guide.md` §1, report §3 |
| Identity & Access Management | 10 | `backend/src/middleware/auth.js` + `rbac.js`, report §4, `terraform/security.tf` |
| Security & Compliance | 10 | report §5, Key Vault + TDE in `terraform/`, audit logging in the app |
| Containerisation & Deployment | 10 | `backend/Dockerfile`, `frontend/Dockerfile`, `kubernetes/`, `.github/workflows/ci-cd.yml` |
| Governance & Performance | 10 | `kubernetes/hpa.yaml`, report §7 + §9, `terraform/security.tf` (policy) |
| Database & Secure Data | 10 | `backend/src/database.js`, `terraform/database.tf`, report §8 |
| Final Presentation & Documentation | 10 | this docs folder + the report |
| Overall Functionality & Innovation | 10 | the running app + 19 passing tests (`backend/npm test`) |

## Before I hit submit

- [ ] Push to GitHub/GitLab and grab the repo link. Make sure `node_modules/` and the local `*.db` files aren't committed (there's a `.gitignore` for that — double check).
- [ ] Open the `.docx` once to confirm the diagram and my name show up correctly.
- [ ] Skim the docs one more time in my own voice — change a word here and there if anything doesn't sound like me.

## Quick sanity commands

```bash
# app builds and tests pass
cd backend && npm test          # expect 19/19
cd ../frontend && npm run build # expect "Compiled successfully"

# full thing runs for the demo
docker-compose up --build       # then open http://localhost:3000
```
