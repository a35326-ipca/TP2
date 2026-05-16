// Script usado para migrar dados da base MySQL antiga para MongoDB Atlas.
import mysql from "mysql2/promise";
import mongoose from "mongoose";
import { connectToDatabase } from "../config/database.js";
import { env } from "../config/env.js";
import { Course } from "../models/Course.js";
import { DeletedStudentProfile } from "../models/DeletedStudentProfile.js";
import { EnrollmentRequest } from "../models/EnrollmentRequest.js";
import { EnrollmentRequestDecision } from "../models/EnrollmentRequestDecision.js";
import { GradeSheet } from "../models/GradeSheet.js";
import { GradeSheetStudent } from "../models/GradeSheetStudent.js";
import { StudentProfile } from "../models/StudentProfile.js";
import { StudentProfileDecision } from "../models/StudentProfileDecision.js";
import { StudyPlan } from "../models/StudyPlan.js";
import { SubmissionEvent } from "../models/SubmissionEvent.js";
import { Unit } from "../models/Unit.js";
import { User } from "../models/User.js";

function asDate(value) {
  // Converte datas vindas do MySQL para objetos Date do JavaScript.
  return value ? new Date(value) : null;
}

async function importRows(Model, rows, mapRow, uniqueFilterForRow = null) {
  // Importa linhas de uma tabela MySQL para uma collection MongoDB.
  for (const row of rows) {
    const mapped = mapRow(row);
    const filters = [{ legacyId: row.id }];
    const uniqueFilter = uniqueFilterForRow?.(row, mapped);

    // Além do legacyId, usa filtros únicos naturais para evitar duplicados.
    if (uniqueFilter) {
      filters.push(uniqueFilter);
    }

    await Model.updateOne(
      filters.length === 1 ? filters[0] : { $or: filters },
      { $set: mapped },
      { upsert: true }
    );
  }
}

async function main() {
  // Abre ligação ao MySQL antigo, usando as variáveis MYSQL_* do .env.
  const mysqlConnection = await mysql.createConnection({
    host: env.mysql.host,
    port: env.mysql.port,
    database: env.mysql.database,
    user: env.mysql.user,
    password: env.mysql.password
  });

  // Abre ligação ao MongoDB Atlas, que é a base final da aplicação.
  await connectToDatabase();

  // Migra utilizadores e mantém o hash de palavra-passe vindo do sistema PHP.
  const [userRows] = await mysqlConnection.query("SELECT * FROM users ORDER BY id");
  await importRows(User, userRows, (row) => ({
    legacyId: row.id,
    name: row.name,
    email: row.email,
    passwordHash: row.password_hash,
    role: row.role,
    createdAt: asDate(row.created_at) ?? new Date()
  }), (row) => ({ email: row.email }));

  // Mapa entre IDs antigos do MySQL e ObjectIds novos do MongoDB.
  const userMap = new Map((await User.find({ legacyId: { $ne: null } }, { legacyId: 1 }).lean()).map((doc) => [doc.legacyId, doc._id]));

  // Migra cursos.
  const [courseRows] = await mysqlConnection.query("SELECT * FROM courses ORDER BY id");
  await importRows(Course, courseRows, (row) => ({
    legacyId: row.id,
    name: row.name,
    isActive: Boolean(row.is_active),
    createdAt: asDate(row.created_at) ?? new Date(),
    updatedAt: asDate(row.updated_at) ?? new Date()
  }), (row) => ({ name: row.name }));
  const courseMap = new Map((await Course.find({ legacyId: { $ne: null } }, { legacyId: 1 }).lean()).map((doc) => [doc.legacyId, doc._id]));

  // Migra Unidades Curriculares.
  const [unitRows] = await mysqlConnection.query("SELECT * FROM units ORDER BY id");
  await importRows(Unit, unitRows, (row) => ({
    legacyId: row.id,
    name: row.name,
    createdAt: asDate(row.created_at) ?? new Date(),
    updatedAt: asDate(row.updated_at) ?? new Date()
  }), (row) => ({ name: row.name }));
  const unitMap = new Map((await Unit.find({ legacyId: { $ne: null } }, { legacyId: 1 }).lean()).map((doc) => [doc.legacyId, doc._id]));

  // Migra o plano de estudos, convertendo course_id e unit_id em ObjectId.
  const [studyPlanRows] = await mysqlConnection.query("SELECT * FROM study_plan ORDER BY id");
  await importRows(StudyPlan, studyPlanRows, (row) => ({
    legacyId: row.id,
    courseId: courseMap.get(row.course_id),
    unitId: unitMap.get(row.unit_id),
    yearNumber: row.year_number,
    semester: row.semester,
    createdAt: asDate(row.created_at) ?? new Date()
  }), (_row, mapped) => ({
    courseId: mapped.courseId,
    unitId: mapped.unitId,
    yearNumber: mapped.yearNumber,
    semester: mapped.semester
  }));
  const studyPlanMap = new Map((await StudyPlan.find({ legacyId: { $ne: null } }, { legacyId: 1 }).lean()).map((doc) => [doc.legacyId, doc._id]));

  // Migra fichas dos alunos.
  const [studentProfileRows] = await mysqlConnection.query("SELECT * FROM student_profiles ORDER BY id");
  await importRows(StudentProfile, studentProfileRows, (row) => ({
    legacyId: row.id,
    userId: userMap.get(row.user_id),
    courseId: courseMap.get(row.course_id),
    fullName: row.full_name,
    birthDate: asDate(row.birth_date),
    contactEmail: row.contact_email,
    phone: row.phone,
    address: row.address,
    photoPath: row.photo_path,
    notes: row.notes,
    status: row.status,
    reviewNotes: row.review_notes,
    reviewedBy: userMap.get(row.reviewed_by) ?? null,
    reviewedAt: asDate(row.reviewed_at),
    submittedAt: asDate(row.submitted_at),
    createdAt: asDate(row.created_at) ?? new Date(),
    updatedAt: asDate(row.updated_at) ?? new Date()
  }), (_row, mapped) => ({ userId: mapped.userId }));
  const studentProfileMap = new Map((await StudentProfile.find({ legacyId: { $ne: null } }, { legacyId: 1 }).lean()).map((doc) => [doc.legacyId, doc._id]));

  // Migra fichas removidas que ainda existem em retenção.
  const [deletedStudentProfileRows] = await mysqlConnection.query("SELECT * FROM deleted_student_profiles ORDER BY id");
  await importRows(DeletedStudentProfile, deletedStudentProfileRows, (row) => ({
    legacyId: row.id,
    originalProfileId: row.original_profile_id,
    userId: userMap.get(row.user_id),
    courseId: courseMap.get(row.course_id),
    fullName: row.full_name,
    birthDate: asDate(row.birth_date),
    contactEmail: row.contact_email,
    phone: row.phone,
    address: row.address,
    photoPath: row.photo_path,
    notes: row.notes,
    status: row.status,
    reviewNotes: row.review_notes,
    reviewedBy: userMap.get(row.reviewed_by) ?? null,
    reviewedAt: asDate(row.reviewed_at),
    submittedAt: asDate(row.submitted_at),
    originalCreatedAt: asDate(row.original_created_at),
    originalUpdatedAt: asDate(row.original_updated_at),
    deletedBy: userMap.get(row.deleted_by) ?? null,
    deletedAt: asDate(row.deleted_at) ?? new Date(),
    purgeAfter: asDate(row.purge_after) ?? new Date()
  }));

  // Migra histórico de decisões sobre fichas dos alunos.
  const [studentProfileDecisionRows] = await mysqlConnection.query("SELECT * FROM student_profile_decisions ORDER BY id");
  await importRows(StudentProfileDecision, studentProfileDecisionRows, (row) => ({
    legacyId: row.id,
    studentProfileId: studentProfileMap.get(row.student_profile_id),
    previousStatus: row.previous_status,
    newStatus: row.new_status,
    previousReviewNotes: row.previous_review_notes,
    newReviewNotes: row.new_review_notes,
    reviewedBy: userMap.get(row.reviewed_by) ?? null,
    createdAt: asDate(row.created_at) ?? new Date()
  }));

  // Migra pedidos de matrícula.
  const [enrollmentRequestRows] = await mysqlConnection.query("SELECT * FROM enrollment_requests ORDER BY id");
  await importRows(EnrollmentRequest, enrollmentRequestRows, (row) => ({
    legacyId: row.id,
    userId: userMap.get(row.user_id),
    courseId: courseMap.get(row.course_id),
    status: row.status,
    studentNotes: row.student_notes,
    decisionNotes: row.decision_notes,
    decidedBy: userMap.get(row.decided_by) ?? null,
    decidedAt: asDate(row.decided_at),
    createdAt: asDate(row.created_at) ?? new Date(),
    updatedAt: asDate(row.updated_at) ?? new Date()
  }));
  const enrollmentRequestMap = new Map((await EnrollmentRequest.find({ legacyId: { $ne: null } }, { legacyId: 1 }).lean()).map((doc) => [doc.legacyId, doc._id]));

  // Migra histórico de decisões sobre pedidos de matrícula.
  const [enrollmentRequestDecisionRows] = await mysqlConnection.query("SELECT * FROM enrollment_request_decisions ORDER BY id");
  await importRows(EnrollmentRequestDecision, enrollmentRequestDecisionRows, (row) => ({
    legacyId: row.id,
    enrollmentRequestId: enrollmentRequestMap.get(row.enrollment_request_id),
    previousStatus: row.previous_status,
    newStatus: row.new_status,
    previousDecisionNotes: row.previous_decision_notes,
    newDecisionNotes: row.new_decision_notes,
    decidedBy: userMap.get(row.decided_by) ?? null,
    createdAt: asDate(row.created_at) ?? new Date()
  }));

  // Migra eventos usados para limitar submissões em 24 horas.
  const [submissionEventRows] = await mysqlConnection.query("SELECT * FROM submission_events ORDER BY id");
  await importRows(SubmissionEvent, submissionEventRows, (row) => ({
    legacyId: row.id,
    userId: userMap.get(row.user_id),
    eventType: row.event_type,
    createdAt: asDate(row.created_at) ?? new Date()
  }));

  // Migra pautas de avaliação.
  const [gradeSheetRows] = await mysqlConnection.query("SELECT * FROM grade_sheets ORDER BY id");
  await importRows(GradeSheet, gradeSheetRows, (row) => ({
    legacyId: row.id,
    unitId: unitMap.get(row.unit_id),
    academicYear: row.academic_year,
    season: row.season,
    createdBy: userMap.get(row.created_by),
    createdAt: asDate(row.created_at) ?? new Date()
  }), (_row, mapped) => ({
    unitId: mapped.unitId,
    academicYear: mapped.academicYear,
    season: mapped.season
  }));
  const gradeSheetMap = new Map((await GradeSheet.find({ legacyId: { $ne: null } }, { legacyId: 1 }).lean()).map((doc) => [doc.legacyId, doc._id]));

  // Migra alunos associados às pautas e respetivas notas finais.
  const [gradeSheetStudentRows] = await mysqlConnection.query("SELECT * FROM grade_sheet_students ORDER BY id");
  await importRows(GradeSheetStudent, gradeSheetStudentRows, (row) => ({
    legacyId: row.id,
    sheetId: gradeSheetMap.get(row.sheet_id),
    studentUserId: userMap.get(row.student_user_id),
    finalGrade: row.final_grade === null ? null : Number(row.final_grade),
    createdAt: asDate(row.created_at) ?? new Date(),
    updatedAt: asDate(row.updated_at) ?? new Date()
  }), (_row, mapped) => ({
    sheetId: mapped.sheetId,
    studentUserId: mapped.studentUserId
  }));

  await mysqlConnection.end();

  console.log("Dados MySQL importados para MongoDB.");
  console.log(`Utilizadores: ${userRows.length}`);
  console.log(`Cursos: ${courseRows.length}`);
  console.log(`UCs: ${unitRows.length}`);
  console.log(`Entradas no plano de estudos: ${studyPlanRows.length}`);
  console.log(`Fichas de alunos: ${studentProfileRows.length}`);
  console.log(`Pedidos de matrícula: ${enrollmentRequestRows.length}`);
  console.log(`Pautas: ${gradeSheetRows.length}`);
  console.log(`Alunos em pautas: ${gradeSheetStudentRows.length}`);
  console.log("Referências resolvidas com mapas de ObjectId para utilizadores, cursos, UCs e pedidos.");
  console.log(`Tamanho do mapa do plano de estudos: ${studyPlanMap.size}`);

  await mongoose.disconnect();
}

main().catch((error) => {
  console.error("Falha ao migrar dados de MySQL para MongoDB.");
  console.error(error);
  process.exit(1);
});