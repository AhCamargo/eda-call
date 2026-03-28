const config = require("../src/config");

module.exports = {
  development: {
    url: config.databaseUrl,
    dialect: "postgres",
  },
  test: {
    url: config.databaseUrl,
    dialect: "postgres",
  },
  production: {
    url: config.databaseUrl,
    dialect: "postgres",
  },
};
