// Modelo da ficha pessoal preenchida pelo aluno.
import mongoose from "mongoose";

const studentProfileSchema = new mongoose.Schema(
  {
    // ID antigo vindo do MySQL, guardado para referência após a migração.
    legacyId: {
      type: Number,
      unique: true,
      sparse: true
    },

    // Utilizador aluno dono desta ficha.
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true
    },

    // Curso pretendido pelo aluno.
    courseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Course",
      required: true
    },

    // Dados pessoais e de contacto preenchidos na ficha.
    fullName: {
      type: String,
      default: "",
      trim: true,
      maxlength: 150
    },
    birthDate: {
      type: Date,
      default: null
    },
    contactEmail: {
      type: String,
      default: "",
      trim: true,
      maxlength: 190
    },
    phone: {
      type: String,
      default: "",
      trim: true,
      maxlength: 40
    },
    address: {
      type: String,
      default: "",
      trim: true,
      maxlength: 255
    },

    // Caminho da fotografia guardada em statics/uploads/profiles.
    photoPath: {
      type: String,
      default: null
    },

    // Observações escritas pelo aluno.
    notes: {
      type: String,
      default: null
    },

    // Estado da ficha dentro do fluxo de validação.
    status: {
      type: String,
      enum: ["rascunho", "submetida", "aprovada", "rejeitada"],
      default: "rascunho"
    },

    // Dados da análise feita pelo gestor.
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

    // Data em que o aluno submeteu a ficha para validação.
    submittedAt: {
      type: Date,
      default: null
    }
  },
  {
    collection: "student_profiles",
    versionKey: false,
    timestamps: true
  }
);

export const StudentProfile = mongoose.model("StudentProfile", studentProfileSchema);