const { BadRequest, Forbidden, NotAuthenticated, TooManyRequests } = require('@feathersjs/errors');
const generate = require('nanoid/generate');
const Sequelize = require('sequelize');

exports.isNotAdmin = roles => context => {
  let rolesToCheck = ['admin', 'super'];
  if (roles) {
    rolesToCheck = [...rolesToCheck, ...roles.split(',')];
  }
  const userRoles = context.params.user.roles.map(role => role.toLowerCase());
  const ret = rolesToCheck.every(adminRole => userRoles.indexOf(adminRole.trim().toLowerCase()) === -1);
  return ret;
};

exports.isAction = (...args) => hook => args.includes(hook.data.action);

exports.cancel = error => hook => {
  throw new Forbidden(error || 'Ha. No. No Touchy.');
}

exports.checkForWorkerKey = (hook) => {
  if ((hook.params && hook.params.query && hook.params.query.remoteWorkerKey) || (hook.data && hook.data.remoteWorkerKey) ) {
    return hook;
  } else {
    return false;
  }
}


exports.checkWorkerKey = (hook) => {
  return async hook => {
    const remoteWorkerKey = hook.method === 'create' ? hook.data.remoteWorkerKey : hook.params.query.remoteWorkerKey;
    if (remoteWorkerKey) {
      await hook.app.service('remoteWorkers').find( { query: {
        secret: remoteWorkerKey,
      }})
      .then((resp) => {
        if (resp && resp.total) {
          const remoteWorker = resp.data[0];
          if (!remoteWorker.enabled) {
            throw new NotAuthenticated('Error: Worker currently deactivated');
          }
          if (hook.method === 'create') {
            hook.data.remoteWorker = {
              id: remoteWorker.id,
              maxConcurrent: remoteWorker.maxConcurrent,
              metadata: remoteWorker.metadata,
            };
          } else {
            hook.params.query.api = true;
          }
        } else {
          throw new NotAuthenticated('Error: Invalid worker secret');
        }
      })
      .catch((err) => {
        throw err;
      })
    } else {
      throw new BadRequest('Error: Worker key required');
    }
  }
}

exports.checkWorkerJobs = (hook) => {
  return async hook => {
    if (hook.data && hook.data.action && hook.data.action == 'checkForWork') {
      const activeJobs = await hook.app.service('processingJobs').find( { query: {
        remoteWorkerId: hook.data.remoteWorker.id,
        $and: [
          { status: { $ne: 999 } },
          { status: { $ne: -1 } },
        ],
        $limit: 0,
      }});
      if (activeJobs && activeJobs.total) {
        if (activeJobs.total >= hook.data.remoteWorker.maxConcurrent) {
          throw new TooManyRequests('Error: Reached maximum number of concurrent jobs');
        }
      }
    }
  }
}

exports.cleanupRemoteWorkerRequest = (hook) => {
  return async hook => {
    if (hook.data && hook.data.remoteWorkerKey) {
      delete hook.data.remoteWorkerKey;
    }
    if (hook.params && hook.params.query && hook.params.query.remoteWorkerKey) {
      delete hook.params.query.remoteWorkerKey;
    }
  }
}

exports.correctedDateTime = (date) => {
  const localDate = date || new Date();
  return new Date(new Date(localDate).getTime() - new Date(localDate).getTimezoneOffset() * 60 * 1000);
}

exports.trimmer = (...args) => hook => {
  if (args) {
    for (const idx in args) {
      if (hook.data[args[idx]]) {
        hook.data[args[idx]] = hook.data[args[idx]].trim();
      }
    }
  }
}

exports.uppercase = (...args) => hook => {
  if (args) {
    for (const idx in args) {
      if (hook.data[args[idx]]) {
        hook.data[args[idx]] = hook.data[args[idx]].toUpperCase();
      }
    }
  }
}

exports.assignNextSID = async hook => {
  const sequelizeClient = hook.app.get('sequelizeClient');

  let rawq = `select (substring_index(shortcode, '-', -1) * 1) + 1 as sid
    from subjects
    where shortcode like '${process.env.SUBJECT_PREFIX}-%'
    order by sid DESC
    limit 1`;

  const ret = await sequelizeClient.query(rawq, { type: Sequelize.QueryTypes.SELECT });
  delete hook.data.assignSID;

  hook.data.shortcode = ret.length ? `${process.env.SUBJECT_PREFIX}-${ret[0].sid.toString().padStart(process.env.SUBJECT_LENGTH, '0')}` : `${process.env.SUBJECT_PREFIX}-${"1".padStart(process.env.SUBJECT_LENGTH, '0')}`;
}

exports.generateRandomShortcode = config => async hook => {
  if (config) {
    config.alphabet = config.alphabet || '0123456789ABCEFGHJKLMNPQRSTWXYZ'
  }
  let tempcodes = [];
  let exists = {total: 1};
  let tries = 0;
  while (exists.total !== 0 && tries < 10) {
    for (let n = 0; n < config.chunks; n += 1) {
      tempcodes.push(generate(config.alphabet, config.lengthEach));
    }
    exists = await hook.app.service(config.service).find({
      query: {
        $limit: 1,
        shortcode: tempcodes.join('-')
      }
    });
    tries = tries + 1;
  }
  if (tries === 10) {
    throw new BadRequest('tried too many times');
  } else {
    hook.data.shortcode = tempcodes.join('-');
  }
}

/** Function that count occurrences of a substring in a string;
 * @author Vitim.us https://gist.github.com/victornpb/7736865
 * @see http://stackoverflow.com/questions/4009756/how-to-count-string-occurrence-in-string/7924240#7924240
 */
exports.occurrences = (string, subString, allowOverlapping = false) => {
  string += "";
  subString += "";
  if (subString.length <= 0) return (string.length + 1);

  var n = 0,
  pos = 0,
  step = allowOverlapping ? 1 : subString.length;

  while (true) {
    pos = string.indexOf(subString, pos);
    if (pos >= 0) {
      ++n;
      pos += step;
    } else break;
  }

  return n;
}
