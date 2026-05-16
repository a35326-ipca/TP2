// Configuração principal da aplicação Express.
import express from "express";
import session from "express-session";
import MongoStore from "connect-mongo";
import methodOverride from "method-override";
import morgan from "morgan";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Importa configurações do .env e dependências internas da aplicação.
import { env, isProduction } from "./config/env.js";
import { attachViewLocals, enforceSessionTimeout, ensureCsrfToken } from "./middleware/web.js";
import { router } from "./routes/index.js";
import { assetPath, formatDate, iconPath, statusClass } from "./services/viewHelpers.js";

// Converte o caminho deste ficheiro para conseguir localizar views e ficheiros estáticos.
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

export function createApp() {
  // Cria a instância principal do Express.
  const app = express();

  // Define EJS como motor de templates e indica onde estão as views.
  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "views"));

  // Middlewares base para logs, formulários, JSON, método HTTP e ficheiros estáticos.
  app.use(morgan("dev"));
  app.use(express.urlencoded({ extended: true, limit: "6mb" }));
  app.use(express.json({ limit: "6mb" }));
  app.use(methodOverride("_method"));
  app.use("/statics", express.static(path.join(projectRoot, "statics")));

  // Configura sessões de utilizador guardadas no MongoDB Atlas.
  app.use(
    session({
      name: env.sessionCookieName,
      secret: env.sessionSecret,
      resave: false,
      saveUninitialized: false,
      store: MongoStore.create({
        mongoUrl: env.mongodbUri,
        collectionName: "sessions"
      }),
      cookie: {
        httpOnly: true,
        sameSite: "lax",
        secure: isProduction,
        maxAge: 1000 * 60 * 30
      }
    })
  );

  // Middlewares globais para timeout, CSRF e variáveis disponíveis nas views.
  app.use(enforceSessionTimeout);
  app.use(ensureCsrfToken);
  app.use(attachViewLocals);

  // Helpers usados nos ficheiros EJS para ícones, datas, imagens e badges de estado.
  app.locals.iconPath = iconPath;
  app.locals.statusClass = statusClass;
  app.locals.formatDate = formatDate;
  app.locals.assetPath = assetPath;

  // Aplica automaticamente o layout principal às páginas renderizadas.
  app.use((req, res, next) => {
    const render = res.render.bind(res);

    res.render = (view, options = {}, callback) => {
      if (options.layout === false) {
        return render(view, options, callback);
      }

      return render(view, options, (viewError, body) => {
        if (viewError) {
          if (callback) return callback(viewError);
          return next(viewError);
        }

        const layout = options.layout || "layouts/main";
        const layoutOptions = { ...options, body, layout: false };

        return render(layout, layoutOptions, callback || ((layoutError, html) => {
          if (layoutError) return next(layoutError);
          return res.send(html);
        }));
      });
    };

    return next();
  });

  // Regista as rotas principais da aplicação.
  app.use(router);

  // Tratamento final de erros para páginas HTML ou respostas JSON.
  app.use((err, req, res, _next) => {
    const statusCode = Number.isInteger(err?.statusCode) ? err.statusCode : 500;

    if (req.accepts("html")) {
      return res.status(statusCode).render("error", {
        title: "Erro",
        message: err?.message || "Erro interno no servidor."
      });
    }

    return res.status(statusCode).json({
      message: err?.message || "Erro interno no servidor."
    });
  });

  return app;
}