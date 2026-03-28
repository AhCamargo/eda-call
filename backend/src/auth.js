const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const { User } = require("./db");
const { jwtSecret } = require("./config");

const login = async (req, res) => {
  const { username, password } = req.body;
  const user = await User.findOne({ where: { username } });

  if (!user) {
    return res.status(404).json({ message: "Usuário não encontrado" });
  }

  const validPassword = bcrypt.compareSync(password, user.passwordHash);
  if (!validPassword) {
    return res.status(401).json({ message: "Senha inválida" });
  }

  const token = jwt.sign({ id: user.id, role: user.role, username: user.username }, jwtSecret, {
    expiresIn: "8h",
  });
  return res.json({ token });
};

const verifyToken = (req, res, next) => {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(403).json({ message: "Token ausente" });
  }

  try {
    req.user = jwt.verify(token, jwtSecret);
    return next();
  } catch {
    return res.status(401).json({ message: "Token inválido" });
  }
};

module.exports = { login, verifyToken };
