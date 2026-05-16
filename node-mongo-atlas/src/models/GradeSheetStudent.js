// Modelo que liga alunos às pautas e guarda a nota final de cada aluno.
import mongoose from "mongoose";

const gradeSheetStudentSchema = new mongoose.Schema(
  {
    // ID antigo vindo do MySQL, usado para referência após a migração.
    legacyId: {
      type: Number,
      unique: true,
      sparse: true
    },

    // Pauta onde o aluno está incluído.
    sheetId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "GradeSheet",
      required: true
    },

    // Utilizador aluno associado à pauta.
    studentUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },

    // Nota final lançada pelo funcionário, entre 0 e 20.
    finalGrade: {
      type: Number,
      default: null,
      min: 0,
      max: 20
    }
  },
  {
    collection: "grade_sheet_students",
    versionKey: false,
    timestamps: true
  }
);

// Garante que o mesmo aluno não aparece duas vezes na mesma pauta.
gradeSheetStudentSchema.index({ sheetId: 1, studentUserId: 1 }, { unique: true });

export const GradeSheetStudent = mongoose.model(
  "GradeSheetStudent",
  gradeSheetStudentSchema
);