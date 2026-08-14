const tenantResolver = async (req, res, next) => {
  try {
    // Never trust tenant context from frontend headers.
    // Tenant context must come from authenticated user (JWT) or URL ssidResolver.
    if (req.tenantId) {
      return next();
    }

    next();
  } catch (error) {
    next();
  }
};

module.exports = tenantResolver;
