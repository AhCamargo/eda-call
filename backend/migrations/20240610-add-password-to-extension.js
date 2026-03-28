"use strict";

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn("Extensions", "password", {
      type: Sequelize.STRING,
      allowNull: false,
      defaultValue: "1234", // Valor temporário para migração, depois pode ser atualizado
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn("Extensions", "password");
  },
};
