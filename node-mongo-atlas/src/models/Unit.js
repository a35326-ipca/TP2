// Modelo das Unidades Curriculares usadas nos planos de estudo e nas pautas.
import mongoose from "mongoose";

const unitSchema = new mongoose.Schema(
  {
    // ID antigo vindo do MySQL, usado para referência durante a migração.
    legacyId: {
      type: Number,
      unique: true,
      sparse: true
    },

    // Nome da UC, único para evitar duplicação de unidades curriculares.
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      maxlength: 150
    }
  },
  {
    collection: "units",
    versionKey: false,
    timestamps: true
  }
);

export const Unit = mongoose.model("Unit", unitSchema);