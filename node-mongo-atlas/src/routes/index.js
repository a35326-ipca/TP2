// Router principal da aplicação.
import express from "express";
import { webRouter } from "./web.routes.js";

// Agrupa todas as rotas antes de serem registadas no app.js.
export const router = express.Router();

// Regista as rotas web com páginas EJS e ações do portal.
router.use(webRouter);

// Rota simples para confirmar se o servidor está ativo.
router.get("/health", (_req, res) => {
  return res.json({
    status: "ok",
    timestamp: new Date().toISOString()
  });
});