// Script manual para garantir que existem contas padrão na base de dados.
import { connectToDatabase } from "../config/database.js";
import { ensureDefaultUsers } from "../services/bootstrap.js";

async function main() {
  // Liga ao MongoDB Atlas antes de criar ou verificar utilizadores.
  await connectToDatabase();

  // Cria as contas padrão apenas se ainda não existirem.
  await ensureDefaultUsers();

  console.log("Contas padrão verificadas com sucesso.");
  process.exit(0);
}

main().catch((error) => {
  // Mostra o erro e termina o processo se o seed falhar.
  console.error("Não foi possível garantir as contas padrão.");
  console.error(error);
  process.exit(1);
});