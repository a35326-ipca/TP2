// Modelo dos utilizadores da plataforma: gestores, funcionários e alunos.
import bcrypt from "bcryptjs";
import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    // ID antigo vindo do MySQL, usado para manter referência à migração.
    legacyId: {
      type: Number,
      unique: true,
      sparse: true
    },

    // Nome visível do utilizador.
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120
    },

    // E-mail usado no login e como identificador único da conta.
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: 190
    },

    // Hash da palavra-passe; a palavra-passe real nunca é guardada.
    passwordHash: {
      type: String,
      required: true
    },

    // Papel do utilizador, usado para controlar permissões nas rotas.
    role: {
      type: String,
      enum: ["gestor", "funcionario", "aluno"],
      default: "aluno"
    },

    // Data de criação da conta.
    createdAt: {
      type: Date,
      default: Date.now
    }
  },
  {
    collection: "users",
    versionKey: false
  }
);

// Compara a palavra-passe introduzida com o hash guardado na base de dados.
userSchema.methods.verifyPassword = function verifyPassword(password) {
  return bcrypt.compare(password, this.passwordHash);
};

// Cria o hash seguro da palavra-passe antes de guardar o utilizador.
userSchema.statics.hashPassword = function hashPassword(password) {
  return bcrypt.hash(password, 12);
};

export const User = mongoose.model("User", userSchema);