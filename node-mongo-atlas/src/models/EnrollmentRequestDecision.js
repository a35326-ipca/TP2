// Modelo do histórico de decisões tomadas sobre pedidos de matrícula.
import mongoose from "mongoose";

const enrollmentRequestDecisionSchema = new mongoose.Schema(
  {
    // ID antigo vindo do MySQL, usado para rastrear a origem dos dados migrados.
    legacyId: {
      type: Number,
      unique: true,
      sparse: true
    },

    // Pedido de matrícula ao qual esta decisão pertence.
    enrollmentRequestId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "EnrollmentRequest",
      required: true
    },

    // Estado antes da decisão do funcionário.
    previousStatus: {
      type: String,
      enum: ["pendente", "aprovado", "rejeitado"],
      required: true
    },

    // Estado aplicado depois da decisão do funcionário.
    newStatus: {
      type: String,
      enum: ["pendente", "aprovado", "rejeitado"],
      required: true
    },

    // Observações antes e depois da decisão, para manter auditoria do processo.
    previousDecisionNotes: {
      type: String,
      default: null
    },
    newDecisionNotes: {
      type: String,
      default: null
    },

    // Funcionário que registou a decisão.
    decidedBy: {
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
    collection: "enrollment_request_decisions",
    versionKey: false
  }
);

// Ajuda a consultar rapidamente o histórico de decisões de um pedido por ordem temporal.
enrollmentRequestDecisionSchema.index({ enrollmentRequestId: 1, createdAt: 1 });

export const EnrollmentRequestDecision = mongoose.model(
  "EnrollmentRequestDecision",
  enrollmentRequestDecisionSchema
);