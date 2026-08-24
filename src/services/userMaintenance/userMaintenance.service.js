const errors = require('@feathersjs/errors');
const hooks = require('./userMaintenance.hooks');
const notifier = require('../mailer/notifier');
const { isNotAdmin } = require('../../hooks/helpers');

const getDiariesList = require('./actions/getDiariesList');

const options = {
  path: '/userMaintenance',
  notifier: async () => { },
};

// TODO: move calls inside cases to modules like authManagement

module.exports = function (app) {
  app.use('/userMaintenance', {
    async create (data, params) {
      switch (data.action) {
        case 'diary:getList':
          return await getDiariesList(app, data, params);
          break;
        case 'options':
          return options;
        default:
          throw new errors.BadRequest(`Action '${data.action}' is invalid.`, {
            errors: { $className: 'badParams' }
          });
      }
    }
  });

  const service = app.service('userMaintenance');
  service.hooks(hooks);
  
};

