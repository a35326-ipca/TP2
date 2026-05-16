import { StudentProfile } from "../models/StudentProfile.js";
import { createHttpError } from "./http.js";

export async function requireStudentAccessUnlocked(userId) {
  const profile = await StudentProfile.findOne({ userId }).select("status").lean();

  if (profile?.status !== "aprovada") {
    throw createHttpError(
      403,
      "Só podes aceder a esta área depois de submeter a ficha e ela ser aprovada."
    );
  }
}
