// Modelo do histórico de decisões tomadas sobre fichas dos alunos.
import mongoose from "mongoose";

const studentProfileDecisionSchema = new mongoose.Schema(
  {
    // ID antigo vindo do MySQL, usado para preservar referência à migração.
    legacyId: {
      type: Number,
      unique: true,
      sparse: true
    },

    // Ficha do aluno à qual esta decisão pertence.
    studentProfileId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "StudentProfile",
      required: true
    },

    // Estado da ficha antes da análise do gestor.
    previousStatus: {
      type: String,
      enum: ["rascunho", "submetida", "aprovada", "rejeitada"],
      required: true
    },

    // Estado atribuído depois da análise do gestor.
    newStatus: {
      type: String,
      enum: ["rascunho", "submetida", "aprovada", "rejeitada"],
      required: true
    },

    // Observações antes e depois da revisão da ficha.
    previousReviewNotes: {
      type: String,
      default: null
    },
    newReviewNotes: {
      type: String,
      default: null
    },

    // Gestor que aprovou ou rejeitou a ficha.
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null
    },

    // Data em que a decisão foi registada.
    createdAt: {
      type: Date,
      default: Date.now
    }
  },
  {
    collection: "student_profile_decisions",
    versionKey: false
  }
);

// Ajuda a listar as decisões de uma ficha pela ordem em que aconteceram.
studentProfileDecisionSchema.index({ studentProfileId: 1, createdAt: 1 });

export const StudentProfileDecision = mongoose.model(
  "StudentProfileDecision",
  studentProfileDecisionSchema
);