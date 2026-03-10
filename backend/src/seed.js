const bcrypt = require("bcryptjs");
const { User } = require("./db");

const seedAdmin = async () => {
  const existing = await User.findOne({ where: { username: "admin" } });
  if (existing) {
    return;
  }

  const passwordHash = bcrypt.hashSync("123456", 10);
  await User.create({ username: "admin", passwordHash, role: "admin" });
};

module.exports = { seedAdmin };
