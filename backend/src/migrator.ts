import { Umzug, SequelizeStorage } from "umzug";
import fs from "fs";
import path from "path";
import { sequelize } from "./db";

export const migrator = new Umzug({
  migrations: {
    glob: path.join(__dirname, "migrations/*.sql"),
    resolve: ({ name, path: filePath, context }) => ({
      name,
      up: async () => {
        const sql = fs.readFileSync(filePath!, "utf-8");
        await context.query(sql);
      },
    }),
  },
  context: sequelize,
  storage: new SequelizeStorage({ sequelize, tableName: "SequelizeMeta" }),
  logger: console,
});
