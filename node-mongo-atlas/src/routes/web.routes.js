// Rotas principais da aplicação web: autenticação, aluno, funcionário e gestor.
import express from "express";
import multer from "multer";
import { Course } from "../models/Course.js";
import { DeletedStudentProfile } from "../models/DeletedStudentProfile.js";
import { EnrollmentRequest } from "../models/EnrollmentRequest.js";
import { EnrollmentRequestDecision } from "../models/EnrollmentRequestDecision.js";
import { GradeSheet } from "../models/GradeSheet.js";
import { GradeSheetStudent } from "../models/GradeSheetStudent.js";
import { StudentProfile } from "../models/StudentProfile.js";
import { StudentProfileDecision } from "../models/StudentProfileDecision.js";
import { StudyPlan } from "../models/StudyPlan.js";
import { Unit } from "../models/Unit.js";
import { User } from "../models/User.js";
import { clearOldInput, consumeOldInput, peekOldInput, requireAuth, requireRole, setFlash, setOldInput, verifyCsrf } from "../middleware/web.js";
import { cleanText, isStrongPassword, isValidEmail, normalizeEmail, parseGrade, parseOptionalDate, requireObjectId } from "../services/http.js";
import { dashboardPathFor } from "../services/viewHelpers.js";
import { hasSubmissionLimitAvailable, registerSubmissionEvent } from "../services/submissions.js";
import { deleteUploadedFile, saveUploadedProfilePhoto } from "../services/uploads.js";

// Router usado pelo Express para agrupar todas as rotas web.
export const webRouter = express.Router();

// Guarda uploads temporariamente em memória antes de validar e gravar a fotografia.
const upload = multer({ storage: multer.memoryStorage() });
// Envia erros de rotas assíncronas para o middleware final de erro.
const asyncRoute = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);

// Aplica proteção CSRF a pedidos que alteram dados, exceto uploads multipart já tratados na rota.
webRouter.use((req, res, next) => {
  if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method) && !req.is("multipart/form-data")) {
    return verifyCsrf(req, res, next);
  }

  return next();
});

// Guarda na sessão apenas os dados necessários do utilizador autenticado.
function serializeUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt
  };
}

// Valida IDs recebidos por formulário antes de consultar o MongoDB.
function selectedId(value) {
  const id = `${value ?? ""}`.trim();
  return id && /^[a-f\d]{24}$/i.test(id) ? id : null;
}

// Regenera a sessão após login para reduzir risco de reutilização de sessão antiga.
async function regenerateSession(req) {
  await new Promise((resolve, reject) => req.session.regenerate((error) => (error ? reject(error) : resolve())));
}

// Confirma se o aluno já tem ficha aprovada para aceder a matrícula e notas.
async function studentIsUnlocked(userId) {
  const profile = await StudentProfile.findOne({ userId }).select("status").lean();
  return profile?.status === "aprovada";
}

// Adiciona automaticamente à pauta os alunos aprovados em cursos que têm essa UC.
async function attachEligibleStudentsToSheet(sheet) {
  const planEntries = await StudyPlan.find({ unitId: sheet.unitId }).select("courseId").lean();
  const courseIds = planEntries.map((entry) => entry.courseId);
  if (courseIds.length === 0) return 0;

  const studentIds = await EnrollmentRequest.find({ status: "aprovado", courseId: { $in: courseIds } }).distinct("userId");
  if (studentIds.length === 0) return 0;

  const operations = studentIds.map((studentUserId) => ({
    updateOne: {
      filter: { sheetId: sheet._id, studentUserId },
      update: { $setOnInsert: { sheetId: sheet._id, studentUserId } },
      upsert: true
    }
  }));

  const result = await GradeSheetStudent.bulkWrite(operations, { ordered: false });
  return result.upsertedCount ?? 0;
}

// Remove ligações de notas quando um pedido de matrícula é rejeitado.
async function removeRejectedEnrollmentLinks(request) {
  if (!request || request.status !== "rejeitado") return;
  const planEntries = await StudyPlan.find({ courseId: request.courseId }).select("unitId").lean();
  const unitIds = planEntries.map((entry) => entry.unitId);
  const sheetIds = await GradeSheet.find({ unitId: { $in: unitIds } }).distinct("_id");
  if (sheetIds.length) {
    await GradeSheetStudent.deleteMany({ studentUserId: request.userId, sheetId: { $in: sheetIds } });
  }
}

// Entrada inicial: encaminha o utilizador para o painel certo ou para o login.
webRouter.get("/", (req, res) => {
  return res.redirect(req.session.user ? dashboardPathFor(req.session.user.role) : "/login");
});

// Autenticação: login, registo e fim de sessão.
webRouter.get("/login", (req, res) => {
  if (req.session.user) return res.redirect(dashboardPathFor(req.session.user.role));
  return res.render("auth/login", { title: "Gc", oldInput: peekOldInput(req) });
});

// Processa credenciais, valida a palavra-passe e cria a sessão do utilizador.
webRouter.post("/login", asyncRoute(async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const password = `${req.body.password ?? ""}`;

  if (!email || !password) {
    setOldInput(req, { email });
    setFlash(req, "error", "Preenche o e-mail e a palavra-passe.");
    return res.redirect("/login");
  }

  if (!isValidEmail(email)) {
    setOldInput(req, { email });
    setFlash(req, "error", "O e-mail introduzido não é válido.");
    return res.redirect("/login");
  }

  const user = await User.findOne({ email });
  if (!user || !(await user.verifyPassword(password))) {
    setOldInput(req, { email });
    setFlash(req, "error", "Credenciais inválidas.");
    return res.redirect("/login");
  }

  clearOldInput(req);
  await regenerateSession(req);
  req.session.user = serializeUser(user);
  req.session.lastActivityAt = Date.now();
  setFlash(req, "success", "Sessão iniciada com sucesso.");
  return res.redirect(dashboardPathFor(user.role));
}));

webRouter.get("/register", (req, res) => {
  if (req.session.user) return res.redirect(dashboardPathFor(req.session.user.role));
  return res.render("auth/register", { title: "Gc", oldInput: consumeOldInput(req) });
});

// Cria uma nova conta de aluno após validar dados e palavra-passe forte.
webRouter.post("/register", asyncRoute(async (req, res) => {
  const name = cleanText(req.body.name);
  const email = normalizeEmail(req.body.email);
  const password = `${req.body.password ?? ""}`;
  const confirmPassword = `${req.body.confirmPassword ?? req.body.confirm_password ?? ""}`;
  const oldInput = { name, email };

  if (!name || !email || !password || !confirmPassword) {
    setOldInput(req, oldInput);
    setFlash(req, "error", "Preenche todos os campos do registo.");
    return res.redirect("/register");
  }
  if (!isValidEmail(email)) {
    setOldInput(req, oldInput);
    setFlash(req, "error", "O e-mail introduzido não é válido.");
    return res.redirect("/register");
  }
  if (name.length < 3 || name.length > 120) {
    setOldInput(req, oldInput);
    setFlash(req, "error", "O nome deve ter entre 3 e 120 caracteres.");
    return res.redirect("/register");
  }
  if (!isStrongPassword(password)) {
    setOldInput(req, oldInput);
    setFlash(req, "error", "Usa uma palavra-passe com pelo menos 8 caracteres, uma maiúscula, uma minúscula e um número.");
    return res.redirect("/register");
  }
  if (password !== confirmPassword) {
    setOldInput(req, oldInput);
    setFlash(req, "error", "As palavras-passe não coincidem.");
    return res.redirect("/register");
  }

  const exists = await User.findOne({ email }).lean();
  if (exists) {
    setOldInput(req, oldInput);
    setFlash(req, "error", "Já existe uma conta com esse e-mail.");
    return res.redirect("/register");
  }

  const user = await User.create({ name, email, passwordHash: await User.hashPassword(password), role: "aluno" });
  clearOldInput(req);
  await regenerateSession(req);
  req.session.user = serializeUser(user);
  req.session.lastActivityAt = Date.now();
  setFlash(req, "success", "Conta criada com sucesso.");
  return res.redirect("/aluno");
}));

// Termina a sessão atual e remove o cookie de autenticação.
function logout(req, res, next) {
  req.session.destroy((error) => {
    if (error) return next(error);
    res.clearCookie("tp2.sid");
    return res.redirect("/login");
  });
}

webRouter.post("/logout", logout);
webRouter.get("/logout", logout);

// Perfil da conta autenticada: dados base e alteração de palavra-passe.
webRouter.get("/perfil", requireAuth, asyncRoute(async (req, res) => {
  const user = await User.findById(req.session.user.id).select("-passwordHash").lean();
  return res.render("account/profile", {
    title: "Perfil",
    pageTitle: "Bem-vindo ao Perfil",
    pageDescription: "Área destinada à atualização dos dados da conta de utilizador. Nesta secção é possível alterar informações de acesso e manter os dados pessoais atualizados, garantindo que a conta permanece correta, segura e devidamente configurada para a utilização da plataforma.",
    activeHref: "/perfil",
    cards: [
      { label: "Cargo", value: user.role === "gestor" ? "Gestor" : user.role === "funcionario" ? "Funcionário" : "Aluno" },
      { label: "Conta criada em", value: user.createdAt ? new Date(user.createdAt).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10) }
    ],
    user
  });
}));

// Atualiza os dados da conta autenticada e, se indicado, altera a palavra-passe.
webRouter.post("/perfil", requireAuth, asyncRoute(async (req, res) => {
  const user = await User.findById(req.session.user.id);
  const name = cleanText(req.body.name);
  const email = normalizeEmail(req.body.email);
  const password = `${req.body.password ?? ""}`;
  const confirmPassword = `${req.body.confirmPassword ?? req.body.confirm_password ?? ""}`;

  if (!user || !name || !email) {
    setFlash(req, "error", "Preenche nome e e-mail.");
    return res.redirect("/perfil");
  }
  if (name.length < 3 || name.length > 120) {
    setFlash(req, "error", "O nome deve ter entre 3 e 120 caracteres.");
    return res.redirect("/perfil");
  }
  if (!isValidEmail(email)) {
    setFlash(req, "error", "O e-mail introduzido não é válido.");
    return res.redirect("/perfil");
  }

  const duplicate = await User.findOne({ email, _id: { $ne: user._id } }).lean();
  if (duplicate) {
    setFlash(req, "error", "Já existe outra conta com esse e-mail.");
    return res.redirect("/perfil");
  }

  const sameName = name === (user.name ?? "");
  const sameEmail = email === (user.email ?? "");
  const passwordBlank = password === "" && confirmPassword === "";

  if (sameName && sameEmail && passwordBlank) {
    setFlash(req, "error", "Não existem alterações para guardar.");
    return res.redirect("/perfil");
  }

  if (password || confirmPassword) {
    if (!password || !confirmPassword) {
      setFlash(req, "error", "Preenche os dois campos da nova palavra-passe.");
      return res.redirect("/perfil");
    }
    if (!isStrongPassword(password)) {
      setFlash(req, "error", "Usa uma palavra-passe com pelo menos 8 caracteres, uma maiúscula, uma minúscula e um número.");
      return res.redirect("/perfil");
    }
    if (password !== confirmPassword) {
      setFlash(req, "error", "As palavras-passe não coincidem.");
      return res.redirect("/perfil");
    }
    user.passwordHash = await User.hashPassword(password);
  }

  user.name = name;
  user.email = email;
  await user.save();
  req.session.user = serializeUser(user);
  setFlash(req, "success", "Perfil atualizado com sucesso.");
  return res.redirect("/perfil");
}));

// Área do aluno: hub, ficha pessoal, pedidos de matrícula e consulta de notas.
webRouter.get("/aluno", requireRole("aluno"), asyncRoute(async (req, res) => {
  const userId = req.session.user.id;
  const [profile, lastRequest, enrollmentCount] = await Promise.all([
    StudentProfile.findOne({ userId }).select("status").lean(),
    EnrollmentRequest.findOne({ userId }).sort({ createdAt: -1 }).select("status").lean(),
    EnrollmentRequest.countDocuments({ userId })
  ]);

  return res.render("student/dashboard", {
    title: "Gc",
    pageTitle: "Bem-vindo ao Hub do Aluno",
    pageDescription: "Nesta área podes acompanhar a tua ficha académica, atualizar os teus dados e enviar a tua fotografia. Também te permite criar e acompanhar pedidos de matrícula de forma simples e organizada. Este site foi pensado para funcionar principalmente em ecrãs de desktop ou portátil.",
    activeHref: "/aluno",
    studentAccessUnlocked: await studentIsUnlocked(userId),
    cards: [
      { label: "Estado da ficha", value: profile?.status ?? "sem ficha", hint: "Situação atual da tua ficha." },
      { label: "Pedidos criados", value: enrollmentCount, hint: "Total de matrículas submetidas por ti." },
      { label: "Último pedido", value: lastRequest?.status ?? "sem pedidos", hint: "Estado mais recente da tua matrícula." }
    ]
  });
}));

webRouter.get("/aluno/ficha", requireRole("aluno"), asyncRoute(async (req, res) => {
  const userId = req.session.user.id;
  const [profile, courses] = await Promise.all([
    StudentProfile.findOne({ userId }).populate("courseId", "name").lean(),
    Course.find({ isActive: true }).sort({ name: 1 }).lean()
  ]);

  return res.render("student/profile", {
    title: "Gc",
    pageTitle: "Bem-vindo à Ficha do Aluno",
    pageDescription: "Nesta área podes preencher e atualizar os teus dados pessoais, adicionar a tua fotografia e submeter a ficha para validação pedagógica. Este processo é necessário para formalizar a tua integração como aluno no sistema escolar, garantindo que a tua informação está completa, correta e pronta para análise.",
    activeHref: "/aluno/ficha",
    profile,
    courses,
    editable: !profile || ["rascunho", "rejeitada"].includes(profile.status)
  });
}));

// Guarda rascunhos ou submete a ficha do aluno, incluindo validação da fotografia.
webRouter.post("/aluno/ficha", requireRole("aluno"), upload.single("photo"), verifyCsrf, asyncRoute(async (req, res) => {
  const userId = req.session.user.id;
  const current = await StudentProfile.findOne({ userId });
  if (current && !["rascunho", "rejeitada"].includes(current.status)) {
    setFlash(req, "error", "A ficha atual não pode ser editada neste estado.");
    return res.redirect("/aluno/ficha");
  }

  const action = `${req.body.action ?? ""}`;
  const status = action === "submit_profile" ? "submetida" : "rascunho";
  const courseId = selectedId(req.body.courseId ?? req.body.course_id);
  if (!courseId) {
    setFlash(req, "error", "Seleciona um curso válido para a ficha.");
    return res.redirect("/aluno/ficha");
  }

  const course = await Course.findOne({ _id: courseId, isActive: true }).lean();
  if (!course) {
    setFlash(req, "error", "O curso selecionado já não está disponível para a ficha.");
    return res.redirect("/aluno/ficha");
  }

  const uploadResult = await saveUploadedProfilePhoto(req.file);
  if (uploadResult.error) {
    setFlash(req, "error", uploadResult.error);
    return res.redirect("/aluno/ficha");
  }

  let birthDate;
  try {
    birthDate = parseOptionalDate(req.body.birthDate ?? req.body.birth_date, "a data de nascimento");
  } catch (_error) {
    if (uploadResult.path) await deleteUploadedFile(uploadResult.path);
    setFlash(req, "error", "Indica uma data válida para a data de nascimento.");
    return res.redirect("/aluno/ficha");
  }

  const photoPath = uploadResult.path ?? current?.photoPath ?? null;
  const data = {
    userId,
    courseId,
    fullName: cleanText(req.body.fullName ?? req.body.full_name) ?? "",
    birthDate,
    contactEmail: normalizeEmail(req.body.contactEmail ?? req.body.contact_email),
    phone: cleanText(req.body.phone) ?? "",
    address: cleanText(req.body.address) ?? "",
    photoPath,
    notes: cleanText(req.body.notes),
    status
  };

  if (data.contactEmail && !isValidEmail(data.contactEmail)) {
    if (uploadResult.path) await deleteUploadedFile(uploadResult.path);
    setFlash(req, "error", "O e-mail de contacto não é válido.");
    return res.redirect("/aluno/ficha");
  }

  if (status === "submetida") {
    if (!data.fullName || !data.birthDate || !data.contactEmail || !data.phone || !data.address || !data.photoPath) {
      if (uploadResult.path) await deleteUploadedFile(uploadResult.path);
      setFlash(req, "error", "Para submeter a ficha tens de preencher nome, data de nascimento, e-mail, telefone, morada e fotografia.");
      return res.redirect("/aluno/ficha");
    }
    if (!(await hasSubmissionLimitAvailable(userId, "student_profile_submission"))) {
      if (uploadResult.path) await deleteUploadedFile(uploadResult.path);
      setFlash(req, "error", "Só podes submeter a ficha 5 vezes em 24 horas. Tenta novamente mais tarde.");
      return res.redirect("/aluno/ficha");
    }
    data.reviewNotes = null;
    data.reviewedBy = null;
    data.reviewedAt = null;
    data.submittedAt = new Date();
  }

  const profile = current ?? new StudentProfile({ userId, courseId });
  Object.assign(profile, data);
  await profile.save();
  if (uploadResult.path && current?.photoPath && current.photoPath !== uploadResult.path) {
    await deleteUploadedFile(current.photoPath);
  }
  if (status === "submetida") await registerSubmissionEvent(userId, "student_profile_submission");
  setFlash(req, "success", status === "submetida" ? "Ficha submetida com sucesso." : "Rascunho guardado com sucesso.");
  return res.redirect("/aluno/ficha");
}));
webRouter.get("/aluno/matriculas", requireRole("aluno"), asyncRoute(async (req, res) => {
  const userId = req.session.user.id;
  if (!(await studentIsUnlocked(userId))) {
    setFlash(req, "error", "Só podes aceder a esta área depois de submeter a ficha e ela ser aprovada.");
    return res.redirect("/aluno/ficha");
  }

  const [courses, requests] = await Promise.all([
    Course.find({ isActive: true }).sort({ name: 1 }).lean(),
    EnrollmentRequest.find({ userId }).populate("courseId", "name").populate("decidedBy", "name").sort({ createdAt: -1 }).lean()
  ]);

  return res.render("student/enrollments", {
    title: "Gc",
    pageTitle: "Bem-vindo ao Pedido de Matrícula",
    pageDescription: "Nesta área podes criar novos pedidos de matrícula e acompanhar o estado de cada submissão ao longo do processo. Também podes consultar as decisões registadas pelo funcionário, de forma simples, clara e organizada.",
    activeHref: "/aluno/matriculas",
    courses,
    requests
  });
}));

// Cria um pedido de matrícula para alunos com ficha aprovada.
webRouter.post("/aluno/matriculas", requireRole("aluno"), asyncRoute(async (req, res) => {
  const userId = req.session.user.id;
  if (!(await studentIsUnlocked(userId))) {
    setFlash(req, "error", "Só podes aceder a esta área depois de submeter a ficha e ela ser aprovada.");
    return res.redirect("/aluno/ficha");
  }

  const courseId = selectedId(req.body.courseId ?? req.body.course_id);
  if (!courseId) {
    setFlash(req, "error", "Seleciona um curso ativo para criar o pedido.");
    return res.redirect("/aluno/matriculas");
  }

  const course = await Course.findOne({ _id: courseId, isActive: true }).lean();
  if (!course) {
    setFlash(req, "error", "O curso selecionado não está disponível.");
    return res.redirect("/aluno/matriculas");
  }

  const pending = await EnrollmentRequest.findOne({ userId, courseId, status: "pendente" }).lean();
  if (pending) {
    setFlash(req, "error", "Já tens um pedido pendente para esse curso.");
    return res.redirect("/aluno/matriculas");
  }

  if (!(await hasSubmissionLimitAvailable(userId, "enrollment_request"))) {
    setFlash(req, "error", "Só podes criar 5 pedidos de matrícula em 24 horas. Tenta novamente mais tarde.");
    return res.redirect("/aluno/matriculas");
  }

  await EnrollmentRequest.create({
    userId,
    courseId,
    studentNotes: cleanText(req.body.studentNotes ?? req.body.student_notes),
    status: "pendente"
  });
  await registerSubmissionEvent(userId, "enrollment_request");
  setFlash(req, "success", "Pedido de matrícula criado com sucesso.");
  return res.redirect("/aluno/matriculas");
}));

// Mostra ao aluno as notas finais associadas às suas matrículas aprovadas.
webRouter.get("/aluno/notas", requireRole("aluno"), asyncRoute(async (req, res) => {
  const userId = req.session.user.id;
  if (!(await studentIsUnlocked(userId))) {
    setFlash(req, "error", "Só podes aceder a esta área depois de submeter a ficha e ela ser aprovada.");
    return res.redirect("/aluno/ficha");
  }

  const approvedCourseIds = await EnrollmentRequest.find({ userId, status: "aprovado" }).distinct("courseId");
  const planEntries = await StudyPlan.find({ courseId: { $in: approvedCourseIds } }).populate("courseId", "name").select("courseId unitId").lean();
  const unitCourse = new Map(planEntries.map((entry) => [String(entry.unitId), entry.courseId?.name ?? "-"]));
  const unitIds = planEntries.map((entry) => entry.unitId);
  const grades = await GradeSheetStudent.find({ studentUserId: userId }).populate({ path: "sheetId", populate: { path: "unitId", select: "name" } }).lean();
  const filteredGrades = grades
    .filter((grade) => grade.sheetId?.unitId && unitIds.some((id) => String(id) === String(grade.sheetId.unitId._id)))
    .map((grade) => ({ ...grade, courseName: unitCourse.get(String(grade.sheetId.unitId._id)) ?? "-" }));

  return res.render("student/grades", {
    title: "Gc",
    pageTitle: "Bem-vindo às Notas",
    pageDescription: "Nesta área podes consultar de forma simples e organizada as classificações finais já registadas nas unidades curriculares em que estás inscrito, permitindo acompanhar o teu desempenho académico ao longo do tempo.",
    activeHref: "/aluno/notas",
    cards: [
      { label: "UCs com nota", value: filteredGrades.length, hint: "Total de pautas associadas às tuas UCs." }
    ],
    grades: filteredGrades
  });
}));
// Área do funcionário: decisões de matrícula e gestão de pautas.
webRouter.get("/funcionario", requireRole("funcionario"), asyncRoute(async (_req, res) => {
  const [pendingRequests, gradeSheets, approvedStudents] = await Promise.all([
    EnrollmentRequest.countDocuments({ status: "pendente" }),
    GradeSheet.countDocuments(),
    EnrollmentRequest.distinct("userId", { status: "aprovado" })
  ]);
  return res.render("employee/dashboard", {
    title: "Gc",
    pageTitle: "Bem-vindo ao Hub",
    pageDescription: "Área de trabalho do funcionário que permite acompanhar os pedidos de matrícula, validar decisões e gerir as pautas de avaliação. A partir desta página, é possível aceder rapidamente às principais funcionalidades do sistema, facilitando a organização das tarefas e garantindo um acompanhamento mais simples, claro e eficiente de todo o processo. Este site foi pensado para funcionar principalmente em ecrãs de desktop ou portátil.",
    activeHref: "/funcionario",
    cards: [
      { label: "Pedidos por decidir", value: pendingRequests, hint: "Pedidos de matrícula submetidos que ainda aguardam validação." },
      { label: "Pautas criadas", value: gradeSheets, hint: "Total de pautas já criadas para gestão académica." },
      { label: "Alunos aprovados", value: approvedStudents.length, hint: "Número de alunos com pedidos já aprovados no sistema." }
    ]
  });
}));

webRouter.get("/funcionario/matriculas", requireRole("funcionario"), asyncRoute(async (req, res) => {
  const reviewId = selectedId(req.query.review ?? req.query.id);
  const deleteId = selectedId(req.query.confirm_delete);
  const [requests, reviewingRequestBase, deleteCandidate] = await Promise.all([
    EnrollmentRequest.find().populate("courseId", "name").populate("userId", "name email").populate("decidedBy", "name").sort({ status: 1, createdAt: -1 }).lean(),
    reviewId ? EnrollmentRequest.findById(reviewId).populate("courseId", "name").populate("userId", "name email").populate("decidedBy", "name").lean() : null,
    deleteId ? EnrollmentRequest.findById(deleteId).populate("courseId", "name").populate("userId", "name email").lean() : null
  ]);
  const reviewingRequest = reviewingRequestBase
    ? {
        ...reviewingRequestBase,
        studentPhotoPath: (await StudentProfile.findOne({ userId: reviewingRequestBase.userId?._id }).select("photoPath").lean())?.photoPath ?? null
      }
    : null;
  const decisionHistory = reviewingRequest
    ? await EnrollmentRequestDecision.find({ enrollmentRequestId: reviewingRequest._id }).populate("decidedBy", "name").sort({ createdAt: -1 }).limit(5).lean()
    : [];
  const oldInput = consumeOldInput(req);
  return res.render("employee/requests", {
    title: "Gc",
    pageTitle: "Bem-vindo à Gestão de Pedidos de Matrícula",
    pageDescription: "Área operacional destinada à análise e decisão dos pedidos de matrícula, permitindo também manter um registo organizado de auditoria de todas as decisões tomadas ao longo do processo.",
    activeHref: "/funcionario/matriculas",
    requests,
    reviewingRequest,
    deleteCandidate,
    decisionHistory,
    decisionHistoryCount: reviewingRequest ? await EnrollmentRequestDecision.countDocuments({ enrollmentRequestId: reviewingRequest._id }) : 0,
    selectedDecisionStatus: oldInput.status ?? ((reviewingRequest && ["rejeitado", "aprovado"].includes(reviewingRequest.status || "")) ? reviewingRequest.status : "aprovado"),
    decisionNotesValue: oldInput.decision_notes ?? (reviewingRequest?.decisionNotes || "")
  });
}));

// Regista a decisão do funcionário sobre um pedido de matrícula.
webRouter.post("/funcionario/matriculas/:id/decisao", requireRole("funcionario"), asyncRoute(async (req, res) => {
  const id = requireObjectId(req.params.id);
  const status = `${req.body.status ?? ""}`;
  const request = await EnrollmentRequest.findById(id);
  if (!request || !["aprovado", "rejeitado"].includes(status)) {
    setFlash(req, "error", "Pedido ou decisão inválida.");
    return res.redirect("/funcionario/matriculas");
  }
  const decisionNotes = cleanText(req.body.decisionNotes ?? req.body.decision_notes);
  if (["rejeitado", "aprovado"].includes(request.status) && request.status === status && (request.decisionNotes ?? null) === decisionNotes) {
    setOldInput(req, { status, decision_notes: decisionNotes ?? "" });
    setFlash(req, "error", "Não existem alterações para guardar.");
    return res.redirect(`/funcionario/matriculas?review=${id}`);
  }
  await EnrollmentRequestDecision.create({
    enrollmentRequestId: request._id,
    previousStatus: request.status,
    newStatus: status,
    previousDecisionNotes: request.decisionNotes,
    newDecisionNotes: decisionNotes,
    decidedBy: req.session.user.id
  });
  request.status = status;
  request.decisionNotes = decisionNotes;
  request.decidedBy = req.session.user.id;
  request.decidedAt = new Date();
  await request.save();
  await removeRejectedEnrollmentLinks(request);
  setFlash(req, "success", "Pedido atualizado com sucesso.");
  return res.redirect("/funcionario/matriculas");
}));

webRouter.post("/funcionario/matriculas/:id/delete", requireRole("funcionario"), asyncRoute(async (req, res) => {
  const request = await EnrollmentRequest.findById(requireObjectId(req.params.id));
  if (!request || request.status !== "rejeitado") {
    setFlash(req, "error", "Só é possível apagar pedidos rejeitados.");
    return res.redirect("/funcionario/matriculas");
  }
  await EnrollmentRequest.deleteOne({ _id: request._id });
  setFlash(req, "success", "Pedido rejeitado apagado com sucesso.");
  return res.redirect("/funcionario/matriculas");
}));

webRouter.get("/funcionario/pautas", requireRole("funcionario"), asyncRoute(async (req, res) => {
  const filterUnitId = selectedId(req.query.filter_unit_id);
  const filterSeason = cleanText(req.query.filter_season);
  const filterAcademicYear = cleanText(req.query.filter_academic_year);

  const sheetFilter = {};
  if (filterUnitId) sheetFilter.unitId = filterUnitId;
  if (filterSeason) sheetFilter.season = filterSeason;
  if (filterAcademicYear) sheetFilter.academicYear = filterAcademicYear;

  const [units, sheets] = await Promise.all([
    Unit.find().sort({ name: 1 }).lean(),
    GradeSheet.find(sheetFilter).populate("unitId", "name").populate("createdBy", "name").sort({ createdAt: -1 }).lean()
  ]);
  const counts = sheets.length
    ? await GradeSheetStudent.aggregate([
      { $match: { sheetId: { $in: sheets.map((sheet) => sheet._id) } } },
      { $group: { _id: "$sheetId", total: { $sum: 1 } } }
    ])
    : [];
  const countBySheet = new Map(counts.map((item) => [`${item._id}`, item.total]));
  const sheetsWithCounts = sheets.map((sheet) => ({ ...sheet, totalStudents: countBySheet.get(`${sheet._id}`) ?? 0 }));

  return res.render("employee/grade-sheets", {
    title: "Gc",
    pageTitle: "Bem-vindo às Pautas de Avaliação",
    pageDescription: "Nesta área é possível criar pautas por Unidade Curricular, ano letivo e época de avaliação. Após a criação, pode aceder ao detalhe de cada pauta para lançar, consultar ou editar as classificações dos alunos, garantindo uma gestão simples e organizada de todo o processo de avaliação.",
    activeHref: "/funcionario/pautas",
    units,
    sheets: sheetsWithCounts,
    filterUnitId,
    filterSeason: filterSeason ?? "",
    filterAcademicYear: filterAcademicYear ?? "",
    hasActiveFilters: Boolean(filterUnitId || filterSeason || filterAcademicYear)
  });
}));

// Cria uma pauta para uma UC, ano letivo e época de avaliação.
webRouter.post("/funcionario/pautas", requireRole("funcionario"), asyncRoute(async (req, res) => {
  const unitId = selectedId(req.body.unitId ?? req.body.unit_id);
  const academicYear = cleanText(req.body.academicYear ?? req.body.academic_year);
  const season = cleanText(req.body.season);

  if (!unitId) {
    setFlash(req, "error", "Seleciona uma UC válida.");
    return res.redirect("/funcionario/pautas");
  }

  if (!academicYear || !season) {
    setFlash(req, "error", "Seleciona uma UC, o ano letivo e a época.");
    return res.redirect("/funcionario/pautas");
  }

  const unit = await Unit.findById(unitId).lean();
  if (!unit) {
    setFlash(req, "error", "Seleciona uma UC válida.");
    return res.redirect("/funcionario/pautas");
  }

  const duplicate = await GradeSheet.findOne({ unitId, academicYear, season }).lean();
  if (duplicate) {
    setFlash(req, "error", "Já existe uma pauta para essa UC, ano letivo e época.");
    return res.redirect("/funcionario/pautas");
  }

  const sheet = await GradeSheet.create({ unitId, academicYear, season, createdBy: req.session.user.id });
  await attachEligibleStudentsToSheet(sheet);
  setFlash(req, "success", "Pauta criada com sucesso.");
  return res.redirect(`/funcionario/pautas/${sheet.id}`);
}));

webRouter.get("/funcionario/pautas/:id", requireRole("funcionario"), asyncRoute(async (req, res) => {
  const id = requireObjectId(req.params.id);
  const sheet = await GradeSheet.findById(id).populate("unitId", "name").lean();
  if (!sheet) {
    setFlash(req, "error", "A pauta selecionada não existe.");
    return res.redirect("/funcionario/pautas");
  }
  const students = await GradeSheetStudent.find({ sheetId: id }).populate("studentUserId", "name email").lean();
  const linkedStudentIds = students.map((row) => row.studentUserId?._id).filter(Boolean);
  const planEntries = await StudyPlan.find({ unitId: sheet.unitId._id }).select("courseId").lean();
  const courseIds = planEntries.map((entry) => entry.courseId);
  const eligibleStudentIds = await EnrollmentRequest.find({ status: "aprovado", courseId: { $in: courseIds } }).distinct("userId");
  const availableStudents = await User.find({ _id: { $in: eligibleStudentIds, $nin: linkedStudentIds }, role: "aluno" }).sort({ name: 1 }).lean();
  return res.render("employee/grade-sheet-detail", {
    title: "Gc",
    pageTitle: "Detalhes da Pauta",
    pageDescription: "Nesta área pode consultar os alunos elegíveis associados à pauta selecionada e lançar as respetivas notas finais. Também pode editar e guardar as classificações de forma simples, mantendo o processo de avaliação organizado e atualizado.",
    activeHref: "/funcionario/pautas",
    headerActions: [
      {
        href: "/funcionario/pautas",
        label: "Voltar às pautas",
        class: "app-button--ghost app-button--icon",
        iconSvg: '<svg viewBox="0 0 24 24" fill="none" stroke-width="1.5" stroke="currentColor" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M9 15 3 9m0 0 6-6M3 9h12a6 6 0 0 1 0 12h-3" /></svg>'
      }
    ],
    sheet,
    students,
    availableStudents
  });
}));

// Adiciona alunos elegíveis à pauta selecionada.
webRouter.post("/funcionario/pautas/:id/alunos", requireRole("funcionario"), asyncRoute(async (req, res) => {
  const sheetId = requireObjectId(req.params.id);
  const sheet = await GradeSheet.findById(sheetId).lean();
  if (!sheet) {
    setFlash(req, "error", "A pauta selecionada não existe.");
    return res.redirect("/funcionario/pautas");
  }

  const rawIds = Array.isArray(req.body.studentUserIds)
    ? req.body.studentUserIds
    : [req.body.studentUserId ?? req.body.student_user_id];
  const ids = rawIds.map((value) => selectedId(value)).filter(Boolean);

  if (!ids.length) {
    setFlash(req, "error", "Seleciona um aluno para adicionar.");
    return res.redirect(`/funcionario/pautas/${sheetId}`);
  }

  let added = 0;
  for (const studentUserId of ids) {
    const student = await User.findOne({ _id: studentUserId, role: "aluno" }).lean();
    if (!student) continue;
    const profile = await StudentProfile.findOne({ userId: studentUserId, status: "aprovada" }).lean();
    if (!profile) continue;
    const result = await GradeSheetStudent.updateOne(
      { sheetId, studentUserId },
      { $setOnInsert: { sheetId, studentUserId } },
      { upsert: true }
    );
    if (result.upsertedCount) added += 1;
  }

  if (!added) {
    setFlash(req, "error", "Não foi possível adicionar o aluno selecionado.");
    return res.redirect(`/funcionario/pautas/${sheetId}`);
  }

  setFlash(req, "success", added === 1 ? "Aluno adicionado à pauta com sucesso." : "Alunos adicionados à pauta com sucesso.");
  return res.redirect(`/funcionario/pautas/${sheetId}`);
}));

// Guarda alterações nas notas finais dos alunos associados à pauta.
webRouter.post("/funcionario/pautas/:id/notas", requireRole("funcionario"), asyncRoute(async (req, res) => {
  const sheetId = requireObjectId(req.params.id);
  const sheet = await GradeSheet.findById(sheetId).lean();
  if (!sheet) {
    setFlash(req, "error", "A pauta selecionada não existe.");
    return res.redirect("/funcionario/pautas");
  }

  const entries = req.body.grades
    ? Object.entries(req.body.grades).map(([id, finalGrade]) => ({ id, finalGrade }))
    : (Array.isArray(req.body.entries) ? req.body.entries : Object.values(req.body.entries ?? {}));
  let changed = 0;

  for (const entry of entries) {
    const id = selectedId(entry.id);
    if (!id) continue;

    let finalGrade;
    try {
      finalGrade = parseGrade(entry.finalGrade ?? entry.final_grade);
    } catch (error) {
      setFlash(req, "error", error.message || "A nota tem de ser de 0 a 20.");
      return res.redirect(`/funcionario/pautas/${sheetId}`);
    }

    const existingEntry = await GradeSheetStudent.findOne({ _id: id, sheetId }).select("finalGrade").lean();
    if (!existingEntry) continue;

    const currentGrade = existingEntry.finalGrade ?? null;
    const nextGrade = finalGrade ?? null;
    if (currentGrade === nextGrade) continue;

    await GradeSheetStudent.updateOne({ _id: id, sheetId }, { $set: { finalGrade: nextGrade } });
    changed += 1;
  }

  setFlash(req, changed ? "success" : "error", changed ? "Notas guardadas com sucesso." : "Não existem alterações para guardar.");
  return res.redirect(`/funcionario/pautas/${sheetId}`);
}));// Área do gestor: cursos, UCs, plano de estudos, utilizadores e fichas dos alunos.
webRouter.get("/gestor", requireRole("gestor"), asyncRoute(async (_req, res) => {
  const [users, activeCourses, units, studyPlanEntries, submittedProfiles] = await Promise.all([
    User.countDocuments(),
    Course.countDocuments({ isActive: true }),
    Unit.countDocuments(),
    StudyPlan.countDocuments(),
    StudentProfile.countDocuments({ status: "submetida" })
  ]);
  return res.render("manager/dashboard", {
    title: "Gc",
    pageTitle: "Bem-vindo ao Hub",
    pageDescription: "Centro de controlo pedagógico que disponibiliza acesso completo às diferentes áreas de gestão do sistema. Através desta área, é possível supervisionar, organizar e administrar as principais funcionalidades da plataforma, permitindo uma gestão centralizada e eficiente de todos os recursos e processos associados ao funcionamento do sistema. Este site foi pensado para funcionar principalmente em ecrãs de desktop ou portátil.",
    activeHref: "/gestor",
    cards: [
      { label: "Utilizadores", value: users, hint: "Total de contas criadas no sistema." },
      { label: "Cursos ativos", value: activeCourses, hint: "Cursos abertos para candidatura." },
      { label: "UCs", value: units, hint: "UCs registadas na base académica." },
      { label: "Entradas no plano", value: studyPlanEntries, hint: "Ligações entre curso, UC, ano e semestre." },
      { label: "Fichas por validar", value: submittedProfiles, hint: "Fichas submetidas a aguardar decisão." }
    ]
  });
}));

webRouter.get("/gestor/cursos", requireRole("gestor"), asyncRoute(async (req, res) => {
  const editId = selectedId(req.query.edit);
  const deleteId = selectedId(req.query.confirm_delete);
  const [courses, editingCourse, deleteCandidate] = await Promise.all([
    Course.find().sort({ isActive: -1, name: 1 }).lean(),
    editId ? Course.findById(editId).lean() : null,
    deleteId ? Course.findById(deleteId).lean() : null
  ]);
  return res.render("manager/courses", {
    title: "Gc",
    pageTitle: "Bem-vindo à Gestão de Cursos",
    pageDescription: "Esta página permite gerir os cursos disponíveis no sistema, possibilitando a criação de novos cursos, a edição dos existentes e a desativação quando necessário. O seu objetivo é manter a oferta formativa organizada, garantindo que as alterações realizadas não afetam o histórico nem as relações já existentes dentro da plataforma.",
    activeHref: "/gestor/cursos",
    courses,
    editingCourse,
    deleteCandidate
  });
}));

// Cria cursos na área de gestão.
webRouter.post("/gestor/cursos", requireRole("gestor"), asyncRoute(async (req, res) => {
  const name = cleanText(req.body.name);
  if (!name) {
    setFlash(req, "error", "Preenche o nome do curso.");
    return res.redirect("/gestor/cursos");
  }
  await Course.create({ name, isActive: `${req.body.isActive ?? req.body.is_active ?? "1"}` === "1" || req.body.isActive === "on" });
  setFlash(req, "success", "Curso criado com sucesso.");
  return res.redirect("/gestor/cursos");
}));

webRouter.post("/gestor/cursos/:id", requireRole("gestor"), asyncRoute(async (req, res) => {
  const id = requireObjectId(req.params.id);
  if (req.body.intent === "delete") {
    await Course.findByIdAndDelete(id);
    setFlash(req, "success", "Curso apagado com sucesso.");
  } else {
    const course = await Course.findById(id);
    if (!course) {
      setFlash(req, "error", "O curso selecionado não existe.");
      return res.redirect("/gestor/cursos");
    }
    const nextName = cleanText(req.body.name);
    if (!nextName) {
      setFlash(req, "error", "Preenche o nome do curso.");
      return res.redirect(`/gestor/cursos?edit=${id}`);
    }
    const nextIsActive = `${req.body.isActive ?? req.body.is_active ?? "1"}` === "1" || req.body.isActive === "on";
    if ((course.name ?? null) === nextName && Boolean(course.isActive) === nextIsActive) {
      setFlash(req, "error", "Não existem alterações para guardar.");
      return res.redirect(`/gestor/cursos?edit=${id}`);
    }
    await Course.findByIdAndUpdate(id, { name: nextName, isActive: nextIsActive });
    setFlash(req, "success", "Curso atualizado com sucesso.");
  }
  return res.redirect("/gestor/cursos");
}));

webRouter.get("/gestor/ucs", requireRole("gestor"), asyncRoute(async (req, res) => {
  const editId = selectedId(req.query.edit);
  const deleteId = selectedId(req.query.confirm_delete);
  const [units, editingUnit, deleteCandidate] = await Promise.all([
    Unit.find().sort({ name: 1 }).lean(),
    editId ? Unit.findById(editId).lean() : null,
    deleteId ? Unit.findById(deleteId).lean() : null
  ]);
  return res.render("manager/units", {
    title: "Gc",
    pageTitle: "Bem-vindo à Gestão de Unidades Curriculares",
    pageDescription: "Esta página permite gerir a lista de Unidades Curriculares (UCs) utilizadas no sistema. O seu objetivo é garantir que as UCs se mantêm organizadas e consistentes, de forma a serem corretamente utilizadas nos planos de estudo e nas pautas de avaliação.",
    activeHref: "/gestor/ucs",
    units,
    editingUnit,
    deleteCandidate
  });
}));

// Cria Unidades Curriculares na área de gestão.
webRouter.post("/gestor/ucs", requireRole("gestor"), asyncRoute(async (req, res) => {
  const name = cleanText(req.body.name);
  if (!name) {
    setFlash(req, "error", "Preenche o nome da UC.");
    return res.redirect("/gestor/ucs");
  }
  await Unit.create({ name });
  setFlash(req, "success", "UC criada com sucesso.");
  return res.redirect("/gestor/ucs");
}));

webRouter.post("/gestor/ucs/:id", requireRole("gestor"), asyncRoute(async (req, res) => {
  const id = requireObjectId(req.params.id);
  if (req.body.intent === "delete") {
    await Unit.findByIdAndDelete(id);
    setFlash(req, "success", "UC removida com sucesso.");
  } else {
    const unit = await Unit.findById(id);
    if (!unit) {
      setFlash(req, "error", "A UC selecionada não existe.");
      return res.redirect("/gestor/ucs");
    }
    const nextName = cleanText(req.body.name);
    if (!nextName) {
      setFlash(req, "error", "Preenche o nome da UC.");
      return res.redirect(`/gestor/ucs?edit=${id}`);
    }
    if ((unit.name ?? null) === nextName) {
      setFlash(req, "error", "Não existem alterações para guardar.");
      return res.redirect(`/gestor/ucs?edit=${id}`);
    }
    await Unit.findByIdAndUpdate(id, { name: nextName });
    setFlash(req, "success", "UC atualizada com sucesso.");
  }
  return res.redirect("/gestor/ucs");
}));

webRouter.get("/gestor/plano", requireRole("gestor"), asyncRoute(async (req, res) => {
  const editId = selectedId(req.query.edit);
  const deleteId = selectedId(req.query.confirm_delete);
  const [courses, units, entries, editingEntry, deleteCandidate] = await Promise.all([
    Course.find().sort({ isActive: -1, name: 1 }).lean(),
    Unit.find().sort({ name: 1 }).lean(),
    StudyPlan.find().populate("courseId", "name isActive").populate("unitId", "name").sort({ yearNumber: 1, semester: 1 }).lean(),
    editId ? StudyPlan.findById(editId).populate("courseId", "name isActive").populate("unitId", "name").lean() : null,
    deleteId ? StudyPlan.findById(deleteId).populate("courseId", "name isActive").populate("unitId", "name").lean() : null
  ]);
  return res.render("manager/study-plan", {
    title: "Gc",
    pageTitle: "Bem-vindo ao Plano de Estudos",
    pageDescription: "Esta página permite associar Unidades Curriculares (UCs) aos diferentes cursos do sistema, organizando-as por ano curricular e semestre. O seu objetivo é garantir uma estrutura académica coerente, evitando duplicações incoerentes e assegurando que cada UC está corretamente integrada no plano de estudos.",
    activeHref: "/gestor/plano",
    courses,
    units,
    entries,
    editingEntry,
    deleteCandidate
  });
}));

// Cria entradas no plano de estudos ligando curso, UC, ano e semestre.
webRouter.post("/gestor/plano", requireRole("gestor"), asyncRoute(async (req, res) => {
  const courseId = selectedId(req.body.courseId ?? req.body.course_id);
  const unitId = selectedId(req.body.unitId ?? req.body.unit_id);
  const yearNumber = Number(req.body.yearNumber ?? req.body.year_number);
  const semester = Number(req.body.semester);
  if (!courseId || !unitId || !Number.isInteger(yearNumber) || !Number.isInteger(semester)) {
    setFlash(req, "error", "Seleciona um curso, uma UC, o ano curricular e o semestre.");
    return res.redirect("/gestor/plano");
  }
  await StudyPlan.create({ courseId, unitId, yearNumber, semester });
  setFlash(req, "success", "Entrada criada no plano de estudos.");
  return res.redirect("/gestor/plano");
}));

webRouter.post("/gestor/plano/:id", requireRole("gestor"), asyncRoute(async (req, res) => {
  const id = requireObjectId(req.params.id);
  if (req.body.intent === "delete") {
    await StudyPlan.findByIdAndDelete(id);
    setFlash(req, "success", "Entrada do plano removida com sucesso.");
  } else {
    const entry = await StudyPlan.findById(id);
    if (!entry) {
      setFlash(req, "error", "A entrada selecionada não existe.");
      return res.redirect("/gestor/plano");
    }
    const nextCourseId = selectedId(req.body.courseId ?? req.body.course_id);
    const nextUnitId = selectedId(req.body.unitId ?? req.body.unit_id);
    const nextYearNumber = Number(req.body.yearNumber ?? req.body.year_number);
    const nextSemester = Number(req.body.semester);
    if (!nextCourseId || !nextUnitId || !Number.isInteger(nextYearNumber) || !Number.isInteger(nextSemester)) {
      setFlash(req, "error", "Seleciona um curso, uma UC, o ano curricular e o semestre.");
      return res.redirect(`/gestor/plano?edit=${id}`);
    }
    if (`${entry.courseId}` === `${nextCourseId}` && `${entry.unitId}` === `${nextUnitId}` && Number(entry.yearNumber) === nextYearNumber && Number(entry.semester) === nextSemester) {
      setFlash(req, "error", "Não existem alterações para guardar.");
      return res.redirect(`/gestor/plano?edit=${id}`);
    }
    await StudyPlan.findByIdAndUpdate(id, {
      courseId: nextCourseId,
      unitId: nextUnitId,
      yearNumber: nextYearNumber,
      semester: nextSemester
    });
    setFlash(req, "success", "Entrada do plano atualizada com sucesso.");
  }
  return res.redirect("/gestor/plano");
}));

webRouter.get("/gestor/utilizadores", requireRole("gestor"), asyncRoute(async (req, res) => {
  const editId = selectedId(req.query.edit);
  const deleteId = selectedId(req.query.confirm_delete);
  const [users, editingUser, deleteCandidate] = await Promise.all([
    User.find().select("-passwordHash").sort({ role: 1, name: 1 }).lean(),
    editId ? User.findById(editId).select("-passwordHash").lean() : null,
    deleteId ? User.findById(deleteId).select("-passwordHash").lean() : null
  ]);
  return res.render("manager/users", {
    title: "Gc",
    pageTitle: "Bem-vindo à Gestão de Utilizadores",
    pageDescription: "Esta página permite gerir os acessos ao sistema, bem como organizar os cargos e os dados base das contas existentes. O seu objetivo é garantir que cada utilizador possui as permissões adequadas e que as informações associadas às contas se mantêm organizadas e atualizadas dentro da plataforma.",
    activeHref: "/gestor/utilizadores",
    users,
    editingUser,
    deleteCandidate
  });
}));

// Cria utilizadores com o papel definido pelo gestor.
webRouter.post("/gestor/utilizadores", requireRole("gestor"), asyncRoute(async (req, res) => {
  const name = cleanText(req.body.name);
  const email = normalizeEmail(req.body.email);
  const password = `${req.body.password ?? ""}`;
  const role = ["aluno", "funcionario", "gestor"].includes(req.body.role) ? req.body.role : "aluno";
  if (!name || !email || !password || !isValidEmail(email)) {
    setFlash(req, "error", "Preenche nome, e-mail e palavra-passe.");
    return res.redirect("/gestor/utilizadores");
  }
  await User.create({ name, email, role, passwordHash: await User.hashPassword(password) });
  setFlash(req, "success", "Utilizador criado com sucesso.");
  return res.redirect("/gestor/utilizadores");
}));

webRouter.post("/gestor/utilizadores/:id", requireRole("gestor"), asyncRoute(async (req, res) => {
  const id = requireObjectId(req.params.id);
  if (req.body.intent === "delete") {
    if (`${id}` === `${req.session.user.id}`) {
      setFlash(req, "error", "Não podes remover a tua própria conta.");
      return res.redirect("/gestor/utilizadores");
    }
    await User.findByIdAndDelete(id);
    setFlash(req, "success", "Utilizador removido com sucesso.");
  } else {
    const user = await User.findById(id).select("-passwordHash");
    if (!user) {
      setFlash(req, "error", "O utilizador selecionado não existe.");
      return res.redirect("/gestor/utilizadores");
    }
    const update = { name: cleanText(req.body.name), email: normalizeEmail(req.body.email), role: `${req.body.role ?? "aluno"}` };
    const password = `${req.body.password ?? ""}`.trim();
    if (!update.name || !update.email || !isValidEmail(update.email) || !["aluno", "funcionario", "gestor"].includes(update.role)) {
      setFlash(req, "error", "Preenche nome, e-mail e cargo válidos.");
      return res.redirect(`/gestor/utilizadores?edit=${id}`);
    }
    if ((user.name ?? null) === update.name && (user.email ?? null) === update.email && (user.role ?? null) === update.role && !password) {
      setFlash(req, "error", "Não existem alterações para guardar.");
      return res.redirect(`/gestor/utilizadores?edit=${id}`);
    }
    if (password) {
      update.passwordHash = await User.hashPassword(`${req.body.password}`);
    }
    await User.findByIdAndUpdate(id, update);
    setFlash(req, "success", "Utilizador atualizado com sucesso.");
  }
  return res.redirect("/gestor/utilizadores");
}));
webRouter.get("/gestor/fichas", requireRole("gestor"), asyncRoute(async (req, res) => {
  const reviewId = selectedId(req.query.review ?? req.query.id);
  const deleteId = selectedId(req.query.confirm_delete);
  const [profiles, reviewingProfile, deleteCandidate] = await Promise.all([
    StudentProfile.find().populate("userId", "name email").populate("courseId", "name").populate("reviewedBy", "name").sort({ status: 1, submittedAt: -1 }).lean(),
    reviewId ? StudentProfile.findById(reviewId).populate("userId", "name email").populate("courseId", "name").populate("reviewedBy", "name").lean() : null,
    deleteId ? StudentProfile.findById(deleteId).populate("courseId", "name").lean() : null
  ]);
  const decisionHistory = reviewingProfile
    ? await StudentProfileDecision.find({ studentProfileId: reviewingProfile._id }).populate("reviewedBy", "name").sort({ createdAt: -1 }).limit(5).lean()
    : [];
  const oldInput = consumeOldInput(req);
  return res.render("manager/profiles", {
    title: "Gc",
    pageTitle: "Bem-vindo à Gestão de Fichas",
    pageDescription: "Esta página permite consultar e validar as fichas submetidas pelos alunos ao sistema. Através desta secção, é possível analisar cada submissão, aprovar ou rejeitar as fichas e adicionar observações sempre que necessário. Todas as ações realizadas ficam registadas num sistema de auditoria, garantindo controlo, transparência e um acompanhamento detalhado de todo o processo.",
    activeHref: "/gestor/fichas",
    profiles,
    reviewingProfile,
    deleteCandidate,
    decisionHistory,
    decisionHistoryCount: reviewingProfile ? await StudentProfileDecision.countDocuments({ studentProfileId: reviewingProfile._id }) : 0,
    selectedReviewStatus: oldInput.status ?? ((reviewingProfile && ["rejeitada", "aprovada"].includes(reviewingProfile.status || "")) ? reviewingProfile.status : "aprovada"),
    reviewNotesValue: oldInput.review_notes ?? (reviewingProfile?.reviewNotes || "")
  });
}));

// Aprova ou rejeita fichas submetidas pelos alunos.
webRouter.post("/gestor/fichas/:id/revisao", requireRole("gestor"), asyncRoute(async (req, res) => {
  const profile = await StudentProfile.findById(requireObjectId(req.params.id));
  const status = `${req.body.status ?? ""}`;
  const reviewNotes = cleanText(req.body.reviewNotes ?? req.body.review_notes);
  if (profile && ["aprovada", "rejeitada"].includes(status)) {
    if (["rejeitada", "aprovada"].includes(profile.status ?? "") && profile.status === status && (profile.reviewNotes ?? null) === reviewNotes) {
      setOldInput(req, { status, review_notes: reviewNotes ?? "" });
      setFlash(req, "error", "Não existem alterações para guardar.");
      return res.redirect(`/gestor/fichas?review=${profile.id}`);
    }
    await StudentProfileDecision.create({ studentProfileId: profile._id, previousStatus: profile.status, newStatus: status, previousReviewNotes: profile.reviewNotes, newReviewNotes: reviewNotes, reviewedBy: req.session.user.id });
    profile.status = status;
    profile.reviewNotes = reviewNotes;
    profile.reviewedBy = req.session.user.id;
    profile.reviewedAt = new Date();
    await profile.save();
    setFlash(req, "success", "Ficha revista com sucesso.");
  }
  return res.redirect("/gestor/fichas");
}));

// Remove fichas aprovadas ou rejeitadas, respeitando a retenção quando necessário.
webRouter.post("/gestor/fichas/:id/delete", requireRole("gestor"), asyncRoute(async (req, res) => {
  const profile = await StudentProfile.findById(requireObjectId(req.params.id));
  if (!profile) {
    setFlash(req, "error", "A ficha selecionada não existe.");
    return res.redirect("/gestor/fichas");
  }
  if (!["rejeitada", "aprovada"].includes(profile.status ?? "")) {
    setFlash(req, "error", "Só podes eliminar fichas rejeitadas ou aprovadas.");
    return res.redirect("/gestor/fichas");
  }
  const shouldRetainDeletedProfile = profile.status === "rejeitada";
  if (shouldRetainDeletedProfile) {
    await DeletedStudentProfile.create({
      originalProfileId: `${profile._id}`,
      userId: profile.userId,
      courseId: profile.courseId,
      fullName: profile.fullName,
      birthDate: profile.birthDate,
      contactEmail: profile.contactEmail,
      phone: profile.phone,
      address: profile.address,
      photoPath: profile.photoPath,
      notes: profile.notes,
      status: profile.status,
      reviewNotes: profile.reviewNotes,
      reviewedBy: profile.reviewedBy,
      reviewedAt: profile.reviewedAt,
      submittedAt: profile.submittedAt,
      originalCreatedAt: profile.createdAt,
      originalUpdatedAt: profile.updatedAt,
      deletedBy: req.session.user.id,
      purgeAfter: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000)
    });
  }
  const photoPath = profile.photoPath;
  await StudentProfile.deleteOne({ _id: profile._id });
  if (!shouldRetainDeletedProfile) {
    await deleteUploadedFile(photoPath);
  }
  setFlash(req, "success", shouldRetainDeletedProfile ? "Ficha removida da lista ativa. Por estar rejeitada, ficará em retenção temporária durante 10 dias antes da eliminação definitiva." : "Ficha eliminada de forma imediata com sucesso.");
  return res.redirect("/gestor/fichas");
}));
