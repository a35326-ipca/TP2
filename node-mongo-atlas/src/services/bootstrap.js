// Serviço responsável por garantir contas base para testar a aplicação.
import { User } from "../models/User.js";

// Contas padrão criadas automaticamente se ainda não existirem no MongoDB.
const defaultAccounts = [
  {
    name: "Gestor",
    email: "gestor@site.local",
    password: "Gestor123!",
    role: "gestor"
  },
  {
    name: "Funcionário",
    email: "funcionario@site.local",
    password: "Func12345!",
    role: "funcionario"
  },
  {
    name: "Aluno Base",
    email: "aluno@site.local",
    password: "Aluno12345!",
    role: "aluno"
  }
];

export async function ensureDefaultUsers() {
  // Percorre as contas padrão e cria apenas as que ainda não existem.
  for (const account of defaultAccounts) {
    const existing = await User.findOne({ email: account.email }).lean();

    if (existing) {
      continue;
    }

    // A palavra-passe nunca é guardada em texto simples; é convertida em hash.
    const passwordHash = await User.hashPassword(account.password);

    await User.create({
      name: account.name,
      email: account.email,
      passwordHash,
      role: account.role
    });
  }
}