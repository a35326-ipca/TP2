// Carrega as variáveis definidas no ficheiro .env para process.env.
import dotenv from "dotenv";

dotenv.config();

// Lê uma variável de ambiente e aplica um valor padrão quando ela não existe.
function readEnv(name, fallback = "") {
  const value = process.env[name];
  return value === undefined || value === null || value === "" ? fallback : value;
}

// Agrupa as configurações usadas pela aplicação e pelos scripts auxiliares.
export const env = {
  // Ambiente atual da aplicação: development ou production.
  nodeEnv: readEnv("NODE_ENV", "development"),

  // Porta onde o servidor Express fica disponível.
  port: Number.parseInt(readEnv("PORT", "3000"), 10),

  // String de ligação ao MongoDB Atlas.
  mongodbUri: readEnv("MONGODB_URI"),

  // Configurações da sessão de autenticação.
  sessionSecret: readEnv("SESSION_SECRET", "troca-este-segredo"),
  sessionCookieName: readEnv("SESSION_COOKIE_NAME", "tp2.sid"),

  // Dados de MySQL usados apenas pelo script de migração antigo.
  mysql: {
    host: readEnv("MYSQL_HOST", "127.0.0.1"),
    port: Number.parseInt(readEnv("MYSQL_PORT", "3306"), 10),
    database: readEnv("MYSQL_DATABASE", "Tp1GcDataBase"),
    user: readEnv("MYSQL_USER", "root"),
    password: readEnv("MYSQL_PASSWORD", "")
  }
};

// Indica se a aplicação está a correr em modo de produção.
export const isProduction = env.nodeEnv === "production";