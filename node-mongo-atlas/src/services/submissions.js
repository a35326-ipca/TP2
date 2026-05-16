// Serviço usado para limitar submissões repetidas dentro de 24 horas.
import { SubmissionEvent } from "../models/SubmissionEvent.js";

export async function hasSubmissionLimitAvailable(userId, eventType, limit = 5) {
  // Conta quantas submissões deste tipo foram feitas pelo utilizador nas últimas 24 horas.
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const count = await SubmissionEvent.countDocuments({
    userId,
    eventType,
    createdAt: { $gte: since }
  });

  return count < limit;
}

export async function registerSubmissionEvent(userId, eventType) {
  // Regista uma submissão para que o limite possa ser aplicado nas próximas tentativas.
  await SubmissionEvent.create({ userId, eventType });
}