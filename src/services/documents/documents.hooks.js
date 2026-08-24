const { authenticate } = require('@feathersjs/authentication');
const { iff, isProvider } = require('feathers-hooks-common');
const { Forbidden } = require('@feathersjs/errors');
const fs = require('fs');
const TranscriberService = require('../transcriber/transcriber.service.js');
const ManualCreateTranscript = require('../transcriptMaintenance/actions/manualCreate.js');
const ManualCreateTranscriptFromElan = require('../transcriptMaintenance/actions/manualCreateFromElan.js');
const { getMetadata, saveStreamCopy, saveWavCopy } = require('../converter/converter.service.js');
const { isNotAdmin, lacksMatchingSubId, cancel } = require('../../hooks/helpers');

const fileTypes = [
  "m4a",
  "mp4",
  "webm",
  "wav",
  "ogg",
  "flac",
  "mp3",
];

const textFileTypes = [
  "txt",
  "tsv"
];

const elanFileTypes = [
  'eaf'
];

const checkKey = (hook) => {
    if (hook.data.secretKey !== process.env.FORM_SECRET) {
      throw new Forbidden('Fatal: no secret key sent');
    }
};

const processManualTranscript = async (hook, docId) => {
  return new Promise(async (resolve, reject) => {
    hook.params.files.forEach(async uploadedTextFile => {
      const textDocId = uploadedTextFile.filename.split('.')[0];
      const textExt = uploadedTextFile.filename.split('.')[1];
      if (textFileTypes.some(textFileType => textExt.includes(textFileType))) {
        ManualCreateTranscript(hook.app, { audioDocId: docId, textDocId })
          .then(ret => {
            console.log('imported transcription for', docId);
            resolve(true);
          })
          .catch(async err => {
            console.log('ManualCreateTranscript error:', err)
          });
      } else if (elanFileTypes.some(elanFileType => textExt.includes(elanFileType))) {
        ManualCreateTranscriptFromElan(hook.app, { audioDocId: docId, textDocId, tierMap: hook.data.tierMap })
          .then(ret => {
            console.log('imported', ret.transcriptions.length, 'ELAN transcription(s) for', docId);
            resolve(true);
          })
          .catch(async err => {
            console.log('ManualCreateTranscriptFromElan error:', err);
          });
      } else {
        resolve(true);
      }
    })
  })
}

module.exports = {
  before: {
    all: [
    ],
    find: [
      authenticate('jwt'),
      iff(isProvider('external'), iff(isNotAdmin('ra, ga'), 
      iff(lacksMatchingSubId, cancel()))),
    ],
    get: [
      authenticate('jwt'),
      iff(isProvider('external'), iff(isNotAdmin('ra, ga'), 
      iff(lacksMatchingSubId, cancel()))),
    ],
    create: [
      iff(isProvider('rest'), checkKey)
        .else(authenticate('jwt'), iff(isNotAdmin('ra, ga'), 
        iff(lacksMatchingSubId, cancel()))),
    ],
    update: [
      authenticate('jwt'),
      iff(isProvider('external'), iff(isNotAdmin('ra, ga'), 
      iff(lacksMatchingSubId, cancel()))),
    ],
    patch: [
      authenticate('jwt'),
      iff(isProvider('external'), iff(isNotAdmin('ra, ga'), 
      iff(lacksMatchingSubId, cancel()))),
    ],
    remove: [
      authenticate('jwt'),
      iff(isProvider('external'), iff(isNotAdmin('ra, ga'), 
      iff(lacksMatchingSubId, cancel()))),
    ]
  },

  after: {
    all: [
    ],
    find: [
    ],
    get: [
    ],
    create: [
      async hook => {
        if (hook.params && hook.params.files) {
          const shouldTranscribe = hook.data.transcribe ? hook.data.transcribe === 'true' : true;
          if (hook.data.audioDocumentId) {
            processManualTranscript(hook, hook.data.audioDocumentId);
          }
          hook.params.files.forEach(async uploadedFile => {
            const docId = uploadedFile.filename.split('.')[0];
            const ext = uploadedFile.filename.split('.')[1];
            if (!hook.data.parentId && fileTypes.some(fileType => ext.includes(fileType))) {
              await saveWavCopy(hook.app, hook.app.get('uploads'), docId, uploadedFile.filename)
                .then(async () => {
                  await processManualTranscript(hook, docId);
                })
                .then(() => {
                  if (shouldTranscribe) {
                    TranscriberService(hook.app, docId)
                      .catch(async err => {console.log('TranscriberService error:', err)});
                    console.log('kicked off transcription for', docId);
                  }
                })
                .catch(async err => {console.log('saveWavCopy error:', err)});
            }
            if (fileTypes.some(fileType => ext.includes(fileType))) {
              getMetadata(hook.app, docId, (hook.data.parentId) ? 'snippets' : 'diaries')
                .catch(async err => { console.log('ffmpeg error:', err)});
              console.log('kicked off metadata gen for', docId);
              saveStreamCopy(hook.app, docId)
                .catch(async err => { console.log('ffmpeg error:', err)});
              console.log('kicked off stream copy for', docId);
            }
          });
        }
      }
    ],
    update: [],
    patch: [],
    remove: [
      hook => {
        fs.unlink(hook.app.get('uploads') + '/' + hook.result.id + '.' + hook.result.fileext, () => {});
      },
    ]
  },

  error: {
    all: [],
    find: [],
    get: [],
    create: [
      hook => {
        if (hook.params.files) {
          hook.params.files.forEach(file => {
            fs.unlink(hook.app.get('uploads') + '/' + file.filename, () => {});
          });
        }
      },
    ],
    update: [],
    patch: [],
    remove: []
  }
};
