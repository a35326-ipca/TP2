// Modelo que regista submissões para aplicar limites de utilização em 24 horas.
import mongoose from "mongoose";

const submissionEventSchema = new mongoose.Schema(
  {
    // ID antigo vindo do MySQL, usado apenas para referência após a migração.
    legacyId: {
      type: Number,
      unique: true,
      sparse: true
    },

    // Utilizador que realizou a submissão.
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },

    // Tipo de evento, por exemplo submissão de ficha ou pedido de matrícula.
    eventType: {
      type: String,
      required: true,
      trim: true,
      maxlength: 80
    },

    // Data em que a submissão aconteceu.
    createdAt: {
      type: Date,
      default: Date.now
    }
  },
  {
    collection: "submission_events",
    versionKey: false
  }
);

// Índice usado para contar rapidamente submissões recentes por utilizador e tipo.
submissionEventSchema.index({ userId: 1, eventType: 1, createdAt: 1 });

export const SubmissionEvent = mongoose.model("SubmissionEvent", submissionEventSchema);