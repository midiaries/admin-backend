const { Forbidden, BadRequest } = require('@feathersjs/errors');
const fs = require('fs');
const mailer = require('../../mailer/notifier');

const runner = async (app, data) => {
  let ret = false;
  let [ relatedDocumentCount, relatedTranscriptionCount, relatedTranscriptSentenceCount ] = [ 0, 0, 0 ];

  const DiaryService = app.service('diaries');
  const DocumentService = app.service('documents');
  const TranscriptionService = app.service('transcriptions');
  const TranscriptSentenceService = app.service('transcriptSentences');

  if (!data.id) {
    throw new BadRequest('Oops - You must include the diary ID to be deleted');
  }

  const diary = await DiaryService.get(data.id);

  if (!diary.id) {
    throw new BadRequest('No diary by this ID found?');
  }

  const relatedDocuments = await DocumentService.find({ query: { parentId: diary.id }, sequelize: { paranoid: false } });
  let relatedTranscriptions = {};
  let relatedTranscriptSentences = {};
  
  relatedDocumentCount = relatedDocuments.total;

  for (const relatedDocument of relatedDocuments.data) {
    relatedTranscriptions = await TranscriptionService.find({ query: { documentId: relatedDocument.id }, sequelize: { paranoid: false } });
    relatedTranscriptionCount += relatedTranscriptions.total;
    for (const relatedTranscription of relatedTranscriptions.data) {
      relatedTranscriptSentences = await TranscriptSentenceService.find({ query: { transcriptionId: relatedTranscription.id }, sequelize: { paranoid: false } });
      relatedTranscriptSentenceCount += relatedTranscriptSentences.total;
    }
  }

  if (data.actuallyDelete) {
    try {
      const destination = app.get('uploads');
      if (relatedTranscriptionCount > 0) {
        for (const relatedTranscriptSentence of relatedTranscriptSentences.data) {
          TranscriptSentenceService.remove(relatedTranscriptSentence.id);
        }
        for (const relatedTranscription of relatedTranscriptions.data) {
          TranscriptionService.remove(relatedTranscription.id);
        }
      }
      for (const relatedDocument of relatedDocuments.data) {
        DocumentService.remove(relatedDocument.id);
        try {
          fs.unlink(`${destination}/${relatedDocument.id}.${relatedDocument.fileext}`, () => {});
          fs.unlink(`${destination}/wav/${relatedDocument.id}.wav`, () => {});
          fs.unlink(`${destination}/stream/${relatedDocument.id}.mp3`, () => {});
        } catch {}
      }
      await DiaryService.remove(diary.id);
      ret = true;
    } catch (err) {
      throw new BadRequest(err);
    }
  } else {
    ret = {
      relatedDocumentCount,
      relatedTranscriptionCount,
      relatedTranscriptSentenceCount,
    }
  }

  return ret;
};

module.exports = runner;
