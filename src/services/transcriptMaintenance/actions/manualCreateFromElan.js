const fs = require('fs');
const { parseTiers, buildGroups } = require('./elanParser');

const STATUS_FAILED = -1;
const STATUS_PROCESSING = 1;
const STATUS_EMPTY = 66;
const STATUS_COMPLETE = 99;

const normalizeTierMap = tierMap => {
  let parsed = tierMap;
  if (typeof tierMap === 'string') {
    try {
      parsed = JSON.parse(tierMap);
    } catch (err) {
      throw new Error(`tierMap is not valid JSON: ${err.message}`);
    }
  }
  if (!Array.isArray(parsed) || !parsed.length) {
    throw new Error('tierMap is required: an ELAN import must say which tiers become which transcripts');
  }
  return parsed;
};

const runner = async (app, { audioDocId, textDocId, tierMap }) => {
  const groupMap = normalizeTierMap(tierMap);

  const destination = app.get('uploads');
  const DocumentService = app.service('documents');
  const TranscriptionService = app.service('transcriptions');
  const SentenceService = app.service('transcriptSentences');

  const { id: audioDocumentId } = await DocumentService.get(audioDocId);
  const { id: textDocumentId, fileext: textFileext } = await DocumentService.get(textDocId);
  const fileName = `${textDocumentId}.${textFileext}`;

  let xml;
  try {
    xml = await fs.promises.readFile(`${destination}/${fileName}`, 'utf8');
  } catch (err) {
    throw new Error(`couldn't open file ${fileName}: ${err.message}`);
  }

  const tiers = parseTiers(xml);
  if (!tiers.length) {
    throw new Error(`ELAN document ${fileName} contains no tiers`);
  }
  const groups = buildGroups(tiers, groupMap);

  const curSeq = await TranscriptionService.find({
    query: {
      documentId: audioDocumentId,
      $limit: 0,
    }
  });

  const created = [];
  for (let i = 0; i < groups.length; i += 1) {
    const group = groups[i];
    const transcription = await TranscriptionService.create({
      documentId: audioDocumentId,
      revision: curSeq.total + i + 1,
      metadata: {
        imported: true,
        source: 'elan',
        tierSet: group.label,
      }
    });

    try {
      await TranscriptionService.patch(transcription.id, { status: STATUS_PROCESSING });

      for (const sentence of group.sentences) {
        await SentenceService.create({
          transcriptionId: transcription.id,
          startTime: sentence.startTime,
          endTime: sentence.endTime,
          content: sentence.content,
          metadata: sentence.metadata,
        });
      }

      await TranscriptionService.patch(transcription.id, {
        status: group.sentences.length ? STATUS_COMPLETE : STATUS_EMPTY,
      });
      created.push({
        id: transcription.id,
        revision: transcription.revision,
        label: group.label,
        sentenceCount: group.sentences.length,
      });
    } catch (err) {
      await TranscriptionService.patch(transcription.id, { status: STATUS_FAILED })
        .catch(() => { console.log('couldn\'t flag failed ELAN transcription', transcription.id); });
      throw err;
    }
  }

  return { transcriptions: created };
};

module.exports = runner;
