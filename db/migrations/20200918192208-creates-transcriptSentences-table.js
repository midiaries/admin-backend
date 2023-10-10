'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const DataTypes = Sequelize.DataTypes;
    try {
      await queryInterface.createTable('transcriptSentences', {
        id: {
          type: DataTypes.STRING(36) + ' CHARSET utf8',
          defaultValue: Sequelize.UUIDV4,
          allowNull: false,
          primaryKey: true
        },
        transcriptionId: {
          type: DataTypes.STRING(36) + ' CHARSET utf8',
          allowNull: true
        },
        startTime: {
          type: DataTypes.DECIMAL(7,1),
          allowNull: true
        },
        endTime: {
          type: DataTypes.DECIMAL(7,1),
          allowNull: true
        },
        content: {
          type: DataTypes.TEXT('LONG'),
          allowNull: true
        },
        metadata: {
          type: DataTypes.JSON,
          allowNull: true
        },
        edited: {
          type: DataTypes.BOOLEAN,
          defaultValue: false,
          allowNull: false
        },
        active: {
          type: DataTypes.BOOLEAN,
          defaultValue: true,
          allowNull: false
        },
        hidden: {
          type: DataTypes.BOOLEAN,
          defaultValue: false,
          allowNull: false
        },
        createdAt: {
          type: DataTypes.DATE,
          allowNull: true
        },
        updatedAt: {
          type: DataTypes.DATE,
          allowNull: true
        },
        deletedAt: {
          type: DataTypes.DATE,
          allowNull: true
        }
      })
      .then(() => {
        return Promise.resolve();
      })
      .catch(async (err) => {
        console.log('failed, rolling back');
        await module.exports.down(queryInterface, Sequelize);
        throw err;
      })


    } catch (err) {
      return Promise.reject(err);
    }
    /*
      Add altering commands here.
      Return a promise to correctly handle asynchronicity.

      Example:
      return queryInterface.createTable('transcriptSentences', { id: Sequelize.INTEGER });
    */
  },

  down: async (queryInterface, Sequelize) => {
    console.log('dropping table');
    return await queryInterface.dropTable('transcriptSentences');
  }
};
