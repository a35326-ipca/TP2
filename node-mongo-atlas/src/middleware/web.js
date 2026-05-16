// Middleware web partilhado por todas as rotas da aplicação.
import crypto from "node:crypto";
import { StudentProfile } from "../models/StudentProfile.js";
import { dashboardPathFor, navForRole, roleLabel } from "../services/viewHelpers.js";

// Tempo máximo de inatividade antes da sessão expirar.
const SESSION_TIMEOUT_MS = 1000 * 60 * 30;

export function setFlash(req, type, message) {
  // Guarda uma mensagem temporária para ser mostrada como toast na próxima página.
  req.session.flash = { type, message };
}

export function consumeOldInput(req) {
  // Recupera dados antigos de formulário e remove-os da sessão depois de usados.
  const oldInput = req.session.oldInput ?? {};
  delete req.session.oldInput;
  return oldInput;
}

export function setOldInput(req, data) {
  // Guarda valores submetidos para preencher novamente o formulário após erro.
  req.session.oldInput = data;
}

export function ensureCsrfToken(req, _res, next) {
  // Garante que cada sessão tem um token CSRF para proteger formulários.
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomUUID();
  }

  return next();
}

export function verifyCsrf(req, res, next) {
  // Compara o token recebido com o token guardado na sessão.
  const token = `${req.body.csrf_token ?? req.query.csrf_token ?? ""}`;

  if (!req.session.csrfToken || token !== req.session.csrfToken) {
    setFlash(req, "error", "Pedido inválido. Tenta novamente.");
    return res.redirect(req.get("Referrer") || "/");
  }

  return next();
}

export function enforceSessionTimeout(req, res, next) {
  // Se não existir utilizador autenticado, não há timeout a aplicar.
  if (!req.session.user) return next();

  const now = Date.now();
  const lastActivity = Number(req.session.lastActivityAt ?? now);

  // Termina a sessão quando o utilizador fica demasiado tempo inativo.
  if (now - lastActivity > SESSION_TIMEOUT_MS) {
    return req.session.destroy(() => {
      res.clearCookie("tp2.sid");
      return res.redirect("/login");
    });
  }

  req.session.lastActivityAt = now;
  return next();
}

export async function attachViewLocals(req, res, next) {
  // Prepara variáveis globais usadas pelos templates EJS.
  const user = req.session.user ?? null;
  let studentUnlocked = false;

  if (user?.role === "aluno") {
    const profile = await StudentProfile.findOne({ userId: user.id }).select("status").lean();
    studentUnlocked = profile?.status === "aprovada";
  }

  res.locals.currentUser = user;
  res.locals.flash = req.session.flash ?? null;
  res.locals.csrfToken = req.session.csrfToken;
  res.locals.navItems = user ? navForRole(user.role, studentUnlocked) : [];
  res.locals.roleLabel = roleLabel;
  res.locals.studentUnlocked = studentUnlocked;
  delete req.session.flash;
  next();
}

export function requireAuth(req, res, next) {
  // Bloqueia páginas que exigem login.
  if (!req.session.user) {
    setFlash(req, "error", "Precisas de iniciar sessão para continuar.");
    return res.redirect("/login");
  }

  return next();
}

export function requireRole(...roles) {
  // Bloqueia páginas que exigem um papel específico, como gestor, funcionário ou aluno.
  return (req, res, next) => {
    if (!req.session.user) {
      setFlash(req, "error", "Precisas de iniciar sessão para continuar.");
      return res.redirect("/login");
    }

    if (!roles.includes(req.session.user.role)) {
      setFlash(req, "error", "Não tens permissão para aceder a esta área.");
      return res.redirect(dashboardPathFor(req.session.user.role));
    }

    return next();
  };
}