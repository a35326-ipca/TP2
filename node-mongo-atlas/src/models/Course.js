// Modelo dos cursos disponíveis na plataforma.
import mongoose from "mongoose";

const courseSchema = new mongoose.Schema(
  {
    // ID antigo vindo do MySQL, usado para preservar a ligação aos dados migrados.
    legacyId: {
      type: Number,
      unique: true,
      sparse: true
    },

    // Nome do curso, único para evitar cursos duplicados.
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      maxlength: 150
    },

    // Indica se o curso está disponível para novas fichas e matrículas.
    isActive: {
      type: Boolean,
      default: true
    }
  },
  {
    collection: "courses",
    versionKey: false,
    timestamps: true
  }
);

export const Course = mongoose.model("Course", courseSchema);