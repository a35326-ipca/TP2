// Modelo usado para guardar fichas de alunos removidas, antes da eliminação definitiva.
import mongoose from "mongoose";

const deletedStudentProfileSchema = new mongoose.Schema(
  {
    // ID antigo vindo do MySQL, mantido para referência dos dados migrados.
    legacyId: {
      type: Number,
      unique: true,
      sparse: true
    },

    // Identificador da ficha original antes de ser movida para retenção.
    originalProfileId: {
      type: String,
      required: true
    },

    // Aluno dono da ficha removida.
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },

    // Curso associado à ficha removida.
    courseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Course",
      required: true
    },

    // Cópia dos dados pessoais que existiam na ficha no momento da remoção.
    fullName: {
      type: String,
      default: ""
    },
    birthDate: {
      type: Date,
      default: null
    },
    contactEmail: {
      type: String,
      default: ""
    },
    phone: {
      type: String,
      default: ""
    },
    address: {
      type: String,
      default: ""
    },
    photoPath: {
      type: String,
      default: null
    },
    notes: {
      type: String,
      default: null
    },

    // Estado que a ficha tinha antes de ser removida.
    status: {
      type: String,
      enum: ["rascunho", "submetida", "aprovada", "rejeitada"],
      default: "rascunho"
    },

    // Dados da última revisão feita pelo gestor.
    reviewNotes: {
      type: String,
      default: null
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null
    },
    reviewedAt: {
      type: Date,
      default: null
    },
    submittedAt: {
      type: Date,
      default: null
    },

    // Datas originais da ficha antes de ser movida para esta collection.
    originalCreatedAt: {
      type: Date,
      default: null
    },
    originalUpdatedAt: {
      type: Date,
      default: null
    },

    // Gestor que removeu a ficha e data da remoção.
    deletedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null
    },
    deletedAt: {
      type: Date,
      default: Date.now
    },

    // Data a partir da qual a ficha pode ser eliminada definitivamente.
    purgeAfter: {
      type: Date,
      required: true
    }
  },
  {
    collection: "deleted_student_profiles",
    versionKey: false
  }
);

// Facilita encontrar fichas cuja retenção já terminou.
deletedStudentProfileSchema.index({ purgeAfter: 1 });

export const DeletedStudentProfile = mongoose.model(
  "DeletedStudentProfile",
  deletedStudentProfileSchema
);