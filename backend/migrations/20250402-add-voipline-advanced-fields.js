"use strict";

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn("VoipLines", "inboundContext", {
      type: Sequelize.STRING,
      allowNull: true,
      defaultValue: null,
    });
    await queryInterface.addColumn("VoipLines", "type", {
      type: Sequelize.ENUM("peer", "friend", "user"),
      allowNull: false,
      defaultValue: "peer",
    });
    await queryInterface.addColumn("VoipLines", "dtmfmode", {
      type: Sequelize.STRING,
      allowNull: false,
      defaultValue: "rfc2833",
    });
    await queryInterface.addColumn("VoipLines", "fromdomain", {
      type: Sequelize.STRING,
      allowNull: true,
      defaultValue: null,
    });
    await queryInterface.addColumn("VoipLines", "codecs", {
      type: Sequelize.STRING,
      allowNull: false,
      defaultValue: "ulaw,alaw",
    });
    await queryInterface.addColumn("VoipLines", "callLimit", {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0,
    });
    await queryInterface.addColumn("VoipLines", "insecure", {
      type: Sequelize.STRING,
      allowNull: true,
      defaultValue: "invite,port",
    });
  },

  down: async (queryInterface) => {
    await queryInterface.removeColumn("VoipLines", "inboundContext");
    await queryInterface.removeColumn("VoipLines", "type");
    await queryInterface.removeColumn("VoipLines", "dtmfmode");
    await queryInterface.removeColumn("VoipLines", "fromdomain");
    await queryInterface.removeColumn("VoipLines", "codecs");
    await queryInterface.removeColumn("VoipLines", "callLimit");
    await queryInterface.removeColumn("VoipLines", "insecure");
  },
};
