// See http://docs.sequelizejs.com/en/latest/docs/models-definition/
// for more of what you can do here.
const Sequelize = require('sequelize');
const DataTypes = Sequelize.DataTypes;

module.exports = function (app) {
  const sequelizeClient = app.get('sequelizeClient');
  const snippets = sequelizeClient.define('snippets', {
    id: {
      type: DataTypes.STRING(36) + ' CHARSET utf8',
      defaultValue: Sequelize.UUIDV4,
      allowNull: false,
      primaryKey: true
    },
    diaryId: {
      type: DataTypes.STRING(36) + ' CHARSET utf8',
      allowNull: false
    },
    name: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    tags: {
      type: DataTypes.JSON,
      defaultValue: [],
      allowNull: true
    },
    headlineText: { 
      type: DataTypes.TEXT('MEDIUM'),
      allowNull: true
    },
    content: {
      type: DataTypes.TEXT('LONG'),
      allowNull: true
    },
    metadata: {
      type: DataTypes.JSON,
      defaultValue: {},
      allowNull: true
    },
    active: {
      type: DataTypes.TINYINT(1),
      defaultValue: 1,
      allowNull: false
    },
    hidden: {
      type: DataTypes.TINYINT(1),
      defaultValue: 0,
      allowNull: false
    },
  }, {
    hooks: {
      beforeCount(options) {
        options.raw = true;
      }
    },
  });

  // eslint-disable-next-line no-unused-vars
  snippets.associate = function (models) {
    // Define associations here
    // See http://docs.sequelizejs.com/en/latest/docs/associations/
  };

  return snippets;
};
