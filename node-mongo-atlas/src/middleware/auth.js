export function requireAuth(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ message: "Autenticação necessária." });
  }

  return next();
}

export function requireRole(...allowedRoles) {
  return (req, res, next) => {
    const role = req.session.user?.role;

    if (!role) {
      return res.status(401).json({ message: "Autenticação necessária." });
    }

    if (!allowedRoles.includes(role)) {
      return res.status(403).json({ message: "Sem permissão para esta operação." });
    }

    return next();
  };
}
