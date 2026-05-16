// Modelo das pautas de avaliação criadas pelo funcionário.
import mongoose from "mongoose";

const gradeSheetSchema = new mongoose.Schema(
  {
    // ID antigo vindo do MySQL, mantido para referência aos dados migrados.
    legacyId: {
      type: Number,
      unique: true,
      sparse: true
    },

    // Unidade Curricular avaliada nesta pauta.
    unitId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Unit",
      required: true
    },

    // Ano letivo da pauta, por exemplo 2025/2026.
    academicYear: {
      type: String,
      required: true,
      trim: true,
      maxlength: 20
    },

    // Época de avaliação, como Normal, Recurso ou Especial.
    season: {
      type: String,
      required: true,
      trim: true,
      maxlength: 30
    },

    // Funcionário que criou a pauta.
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },

    // Data de criação da pauta.
    createdAt: {
      type: Date,
      default: Date.now
    }
  },
  {
    collection: "grade_sheets",
    versionKey: false
  }
);

// Impede pautas duplicadas para a mesma UC, ano letivo e época.
gradeSheetSchema.index({ unitId: 1, academicYear: 1, season: 1 }, { unique: true });

export const GradeSheet = mongoose.model("GradeSheet", gradeSheetSchema);