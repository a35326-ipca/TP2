// Serviço responsável por validar, guardar e remover fotografias dos perfis dos alunos.
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { createHttpError } from "./http.js";

// Calcula caminhos absolutos a partir da localização deste ficheiro.
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..", "..");

// Pasta onde ficam guardadas as fotografias submetidas pelos alunos.
const uploadDirectory = path.join(projectRoot, "statics", "uploads", "profiles");

// Formatos aceites para upload de fotografia.
const acceptedMimeTypes = new Map([
  ["image/jpeg", ".jpg"],
  ["image/png", ".png"]
]);

export async function saveUploadedProfilePhoto(file) {
  // Quando não existe ficheiro, a rota pode continuar sem alterar a fotografia atual.
  if (!file) {
    return { path: null, error: null };
  }

  const extension = acceptedMimeTypes.get(file.mimetype);

  // Bloqueia formatos que não sejam JPG ou PNG.
  if (!extension) {
    return { path: null, error: "A fotografia deve estar em formato JPG ou PNG." };
  }

  // Limita o tamanho da fotografia a 2 MB.
  if (file.size > 2 * 1024 * 1024) {
    return { path: null, error: "A fotografia deve ter no máximo 2 MB." };
  }

  // Garante que a pasta de uploads existe antes de gravar o ficheiro.
  await fs.mkdir(uploadDirectory, { recursive: true });

  // Usa um nome único para evitar colisões entre fotografias diferentes.
  const filename = `profile_${randomUUID()}${extension}`;
  const destination = path.join(uploadDirectory, filename);
  await fs.writeFile(destination, file.buffer);

  return { path: `statics/uploads/profiles/${filename}`, error: null };
}

export async function saveBase64ProfilePhoto(photoBase64) {
  // Função auxiliar usada por scripts/importações quando a imagem vem em base64.
  const payload = `${photoBase64 ?? ""}`.trim();

  if (!payload) {
    return null;
  }

  const match = payload.match(/^data:(image\/(?:jpeg|png));base64,([A-Za-z0-9+/=\r\n]+)$/);

  if (!match) {
    throw createHttpError(422, "A fotografia deve ser enviada em base64 como JPG ou PNG.");
  }

  const [, mimeType, encoded] = match;
  const extension = acceptedMimeTypes.get(mimeType);
  const buffer = Buffer.from(encoded.replace(/\s/g, ""), "base64");

  if (buffer.length > 2 * 1024 * 1024) {
    throw createHttpError(422, "A fotografia deve ter no máximo 2 MB.");
  }

  await fs.mkdir(uploadDirectory, { recursive: true });

  const filename = `profile_${randomUUID()}${extension}`;
  const destination = path.join(uploadDirectory, filename);
  await fs.writeFile(destination, buffer);

  return `statics/uploads/profiles/${filename}`;
}

export async function deleteUploadedFile(relativePath) {
  // Ignora pedidos sem caminho para evitar erros desnecessários.
  if (!relativePath) {
    return;
  }

  const resolved = path.resolve(projectRoot, `${relativePath}`.replaceAll("\\", path.sep));
  const uploadsRoot = path.resolve(projectRoot, "statics", "uploads");

  // Garante que só são removidos ficheiros dentro da pasta de uploads.
  if (!resolved.startsWith(uploadsRoot)) {
    return;
  }

  await fs.unlink(resolved).catch(() => undefined);
}