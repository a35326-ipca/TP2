// Modelo do plano de estudos, ligando cursos a Unidades Curriculares por ano e semestre.
import mongoose from "mongoose";

const studyPlanSchema = new mongoose.Schema(
  {
    // ID antigo vindo do MySQL, mantido para rastrear a origem dos dados migrados.
    legacyId: {
      type: Number,
      unique: true,
      sparse: true
    },

    // Curso ao qual esta entrada do plano pertence.
    courseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Course",
      required: true
    },

    // Unidade Curricular associada ao curso.
    unitId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Unit",
      required: true
    },

    // Ano curricular em que a UC aparece no curso.
    yearNumber: {
      type: Number,
      required: true,
      min: 1
    },

    // Semestre em que a UC é lecionada.
    semester: {
      type: Number,
      required: true,
      min: 1
    },

    // Data de criação da entrada no plano.
    createdAt: {
      type: Date,
      default: Date.now
    }
  },
  {
    collection: "study_plans",
    versionKey: false
  }
);

// Impede que a mesma UC seja repetida no mesmo curso, ano e semestre.
studyPlanSchema.index(
  { courseId: 1, unitId: 1, yearNumber: 1, semester: 1 },
  { unique: true }
);

export const StudyPlan = mongoose.model("StudyPlan", studyPlanSchema);