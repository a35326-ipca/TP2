// Modelo dos pedidos de matrícula criados pelos alunos.
import mongoose from "mongoose";

const enrollmentRequestSchema = new mongoose.Schema(
  {
    // ID antigo vindo do MySQL, usado para manter referência aos dados migrados.
    legacyId: {
      type: Number,
      unique: true,
      sparse: true
    },

    // Aluno que criou o pedido de matrícula.
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },

    // Curso para o qual o aluno pediu matrícula.
    courseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Course",
      required: true
    },

    // Estado da decisão tomada pelo funcionário.
    status: {
      type: String,
      enum: ["pendente", "aprovado", "rejeitado"],
      default: "pendente"
    },

    // Observações submetidas pelo aluno no pedido.
    studentNotes: {
      type: String,
      default: null
    },

    // Observações da decisão registada pelo funcionário.
    decisionNotes: {
      type: String,
      default: null
    },
    decidedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null
    },
    decidedAt: {
      type: Date,
      default: null
    }
  },
  {
    collection: "enrollment_requests",
    versionKey: false,
    timestamps: true
  }
);

export const EnrollmentRequest = mongoose.model(
  "EnrollmentRequest",
  enrollmentRequestSchema
);