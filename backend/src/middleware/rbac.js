const ROLES = {
  ADMIN: 'ADMIN',
  DOCTOR: 'DOCTOR',
  PATIENT: 'PATIENT',
};

const PERMISSIONS = {
  // User management
  'users:read:all': [ROLES.ADMIN],
  'users:update:role': [ROLES.ADMIN],
  'users:deactivate': [ROLES.ADMIN],

  // Appointments
  'appointments:create': [ROLES.PATIENT, ROLES.ADMIN],
  'appointments:read:own': [ROLES.PATIENT, ROLES.DOCTOR, ROLES.ADMIN],
  'appointments:read:all': [ROLES.ADMIN],
  'appointments:update:status': [ROLES.DOCTOR, ROLES.ADMIN],
  'appointments:cancel': [ROLES.PATIENT, ROLES.DOCTOR, ROLES.ADMIN],

  // EHR Records
  'ehr:create': [ROLES.DOCTOR, ROLES.ADMIN],
  'ehr:read:own': [ROLES.PATIENT],
  'ehr:read:patient': [ROLES.DOCTOR, ROLES.ADMIN],
  'ehr:update': [ROLES.DOCTOR, ROLES.ADMIN],

  // Prescriptions
  'prescriptions:create': [ROLES.DOCTOR],
  'prescriptions:read:own': [ROLES.PATIENT],
  'prescriptions:read:patient': [ROLES.DOCTOR, ROLES.ADMIN],
  'prescriptions:update': [ROLES.DOCTOR],
};

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        error: 'Insufficient permissions',
        required: roles,
        current: req.user.role,
      });
    }
    next();
  };
}

function requirePermission(permission) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    const allowed = PERMISSIONS[permission] || [];
    if (!allowed.includes(req.user.role)) {
      return res.status(403).json({ error: `Permission denied: ${permission}` });
    }
    next();
  };
}

module.exports = { ROLES, PERMISSIONS, requireRole, requirePermission };
