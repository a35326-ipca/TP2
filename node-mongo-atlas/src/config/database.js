// Mongoose é a biblioteca usada para comunicar com o MongoDB Atlas.
import mongoose from "mongoose";

// Importa a string de ligação definida no ficheiro .env.
import { env } from "./env.js";

export async function connectToDatabase() {
  // Impede o arranque da aplicação se a ligação ao MongoDB não estiver configurada.
  if (!env.mongodbUri) {
    throw new Error("Define MONGODB_URI no ficheiro .env antes de arrancar a aplicação.");
  }

  // Mantém as pesquisas do Mongoose mais previsíveis ao seguir o schema definido nos models.
  mongoose.set("strictQuery", true);

  // Abre a ligação ao MongoDB Atlas antes de o servidor começar a responder.
  await mongoose.connect(env.mongodbUri);
}