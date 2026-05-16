// Funções auxiliares para validação e tratamento de dados recebidos nas rotas.
import mongoose from "mongoose";

export function createHttpError(statusCode, message) {
  // Cria um erro com código HTTP para ser tratado pelo middleware final de erro.
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

export function requireObjectId(value, message = "Identificador inválido.") {
  // Valida se o valor recebido pode ser usado como ObjectId do MongoDB.
  const id = `${value ?? ""}`.trim();

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw createHttpError(422, message);
  }

  return id;
}

export function normalizeEmail(value) {
  // Normaliza e-mails para comparação e gravação consistente.
  return `${value ?? ""}`.trim().toLowerCase();
}

export function isValidEmail(value) {
  // Validação simples de formato de e-mail.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(`${value ?? ""}`.trim());
}

export function isStrongPassword(value) {
  // Exige palavra-passe com tamanho mínimo, maiúscula, minúscula e número.
  const password = `${value ?? ""}`;
  return password.length >= 8
    && /[a-z]/.test(password)
    && /[A-Z]/.test(password)
    && /\d/.test(password);
}

export function cleanText(value) {
  // Remove espaços laterais e transforma texto vazio em null.
  const text = `${value ?? ""}`.trim();
  return text === "" ? null : text;
}

export function parseOptionalDate(value, fieldLabel) {
  // Converte uma data opcional no formato YYYY-MM-DD para Date.
  const text = `${value ?? ""}`.trim();

  if (!text) {
    return null;
  }

  const date = new Date(`${text}T00:00:00.000Z`);

  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== text) {
    throw createHttpError(422, `Indica uma data válida para ${fieldLabel}.`);
  }

  return date;
}

export function parseGrade(value) {
  // Converte e valida notas finais entre 0 e 20.
  if (value === null || value === undefined || `${value}`.trim() === "") {
    return null;
  }

  const grade = Number.parseFloat(`${value}`.replace(",", "."));

  if (!Number.isFinite(grade) || grade < 0 || grade > 20) {
    throw createHttpError(422, "A nota final deve estar entre 0 e 20.");
  }

  return Math.round(grade * 100) / 100;
}

export function currentUserId(req) {
  // Obtém o ID do utilizador autenticado ou lança erro se não houver sessão.
  const id = req.session.user?.id;

  if (!id) {
    throw createHttpError(401, "Autenticação necessária.");
  }

  return id;
}