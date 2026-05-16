// Importa a função que cria a aplicação Express já configurada.
import { createApp } from "./app.js";

// Importa a função responsável por ligar ao MongoDB Atlas.
import { connectToDatabase } from "./config/database.js";

// Lê as variáveis de ambiente, como a porta do servidor.
import { env } from "./config/env.js";

async function bootstrap() {
  // Garante que a aplicação só arranca depois da ligação à base de dados.
  await connectToDatabase();

  // Cria a aplicação Express com rotas, sessões, views e ficheiros estáticos.
  const app = createApp();

  // Inicia o servidor HTTP na porta definida no ficheiro .env.
  app.listen(env.port, () => {
    console.log(`Servidor TP2 disponível em http://localhost:${env.port}`);
  });
}

bootstrap().catch((error) => {
  // Apresenta erros críticos e termina o processo se o arranque falhar.
  console.error("Não foi possível arrancar o servidor TP2.");
  console.error(error);
  process.exit(1);
});