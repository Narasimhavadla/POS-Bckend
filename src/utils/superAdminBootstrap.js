const { User } = require('../models');

const DEFAULT_SUPERADMIN = {
  name: 'Super Admin',
  email: 'Admin',
  username: 'Admin',
  password: 'Admin@123',
  role: 'superadmin',
  pin: '0000',
  isActive: true,
  isVerified: true
};

const ensureDefaultSuperAdmin = async () => {
  let superAdmin = await User.findOne({ where: { role: 'superadmin' }, order: [['createdAt', 'ASC']] });

  if (!superAdmin) {
    superAdmin = await User.create(DEFAULT_SUPERADMIN);
    return { created: true, username: superAdmin.username };
  }

  let changed = false;

  if (!superAdmin.isActive) {
    superAdmin.isActive = true;
    changed = true;
  }

  if (!superAdmin.username) {
    superAdmin.username = DEFAULT_SUPERADMIN.username;
    changed = true;
  }

  if (!superAdmin.email) {
    superAdmin.email = DEFAULT_SUPERADMIN.email;
    changed = true;
  }

  // Always normalize to known dev credentials for this environment.
  superAdmin.password = DEFAULT_SUPERADMIN.password;
  superAdmin.pin = DEFAULT_SUPERADMIN.pin;
  changed = true;

  if (changed) {
    await superAdmin.save();
  }

  return { created: false, username: superAdmin.username };
};

module.exports = { ensureDefaultSuperAdmin, DEFAULT_SUPERADMIN };
