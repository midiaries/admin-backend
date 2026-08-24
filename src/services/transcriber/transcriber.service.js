  const speech = require('@google-cloud/speech');
  const { Storage } = require('@google-cloud/storage');
  const { v4: uuidv4 } = require('uuid');
  const fs = require('fs');
  //const fetch = require('node-fetch')
  const axios = require('axios');
  const FormData = require('form-data');
  const ffmpeg = require('fluent-ffmpeg');
  const wavinfo = require('wav-file-info');

  // Creates a client
  const speechClient = new speech.SpeechClient({keyFilename: process.env.GCS_PRIVATE_KEY_PATH});
  const storage = new Storage({keyFilename: process.env.GCS_PRIVATE_KEY_PATH});

  const upload = async (destination, fileName) => {
    console.log('uploading...');
    const [fileinfo] = process.env.GCS_USE_FOLDER
      ? await storage.bucket(process.env.GCS_BUCKET_NAME).upload(destination + '/' + fileName, { destination: `${process.env.GCS_FOLDER_NAME}/${fileName}`})
      : await storage.bucket(process.env.GCS_BUCKET_NAME).upload(destination + '/' + fileName)
    const gcsPath = 'gs://' + fileinfo.bucket.name + '/' + fileinfo.name;
    return gcsPath;
  };

  const removeFile = async (destination, fileName) => {
    console.log('removing GCS file...');
    try {
      process.env.GCS_USE_FOLDER
      ? await storage.bucket(process.env.GCS_BUCKET_NAME).file(`${process.env.GCS_FOLDER_NAME}/${fileName}`).delete().then(data => { console.log('GCS delete result:', data[0].statusCode)})
      : await storage.bucket(process.env.GCS_BUCKET_NAME).file(fileName).delete().then(data => { console.log('GCS delete result:', data[0].statusCode)})
    }
    catch {(err) => { console.log('couldn\'t remove GCS file') }}
    /*
    // leaving converted wav now for reuse and analysis
    console.log('removing local temp file...');
    try {
      fs.unlink(destination + '/' + fileName, () => {});
    }
    catch {(err) => { console.log('couldn\'t remove temp') }}
    */
  };

  const getTime = wordTime => wordTime.seconds + '.' + wordTime.nanos / 100000000;

  const sentenceToObject = (sentence, confidence) => {
    return {
      startTime: getTime(sentence[0].startTime),
      endTime: getTime(sentence[sentence.length - 1].endTime),
      content: sentence.map(cur => cur.word).join(' '),
      metadata: {
        confidence: confidence,
        wordCount: sentence.length,
        speaker: 1,
        header2: "SID",
      }
    }
  };

  //TODO: Enable swapping between GCS or wav2vec2 or whisper
  //This may ideally require an additional page in the frontend for selecting ASR method and settings

  const processTranscript = async (results) => {
    const ret = [];
    const sentences = [];
    results.forEach(result => {
      const sentence = result.alternatives[0].words;
      const confidence = result.alternatives[0].confidence;
      let i = 0;
      while (i < sentence.length) {
        if (sentence[i].word.includes('.')) {
          ret.push(sentenceToObject(sentence.splice(0, i + 1), confidence));
          i = 0;
        } else {
          i += 1;
        }
      }
      //push remainder if any
      if (sentence.length !== 0) {
        ret.push(sentenceToObject(sentence, confidence));
      }
    })
    return ret;
  };

  module.exports = async function (app, documentId) {
    const documentService = app.service('documents');
    const transcriptionService = app.service('transcriptions');
    const sentenceService = app.service('transcriptSentences');
    console.log("Choosing transcription service")
    if (process.env.ASR_SERVICE == "GCS" || process.env.ASR_SERVICE === undefined) {
      const destination = app.get('uploads') + '/wav';
      const config = {
        //model: 'PHONE_CALL',
        model: 'LATEST_LONG',
        useEnhanced: true,
        enableWordTimeOffsets: true,
        enableAutomaticPunctuation: true,
        encoding: 'LINEAR16',
        sampleRateHertz: 0,
        languageCode: 'en-US',
      };

      return new Promise(async (resolve, reject) => {
        const curSeq = await transcriptionService.find({ query: {
            documentId,
            $limit: 0}
          });
        const transcription = await transcriptionService.create({
          documentId,
          revision: curSeq.total + 1
        });
        const doc = await documentService.get(documentId);
        const fileName = doc.id + '.' + doc.fileext;
        await transcriptionService.patch(
          transcription.id, {
            // 1: processing
            status: 1
          });
        wavinfo.infoByFilename(destination + '/' + doc.id + '.wav', (err, info) => {
          if (err) throw err;
          config.sampleRateHertz = info.header.sample_rate;
        });
        upload(destination, doc.id + '.wav')
          .then(async (gs_uri) => {
            const request = {
              config: config,
              audio: { uri: gs_uri },
            };
            const [operation] = await speechClient.longRunningRecognize(request);
            console.log(operation.name, 'operation started');
            const [response, metadata, content] = await operation.promise();
            console.log(content.name, 'operation finished');
            console.log(content)
            console.log(response)
            console.log(metadata)
            try {
              processTranscript(response.results)
                .then(async ret => {
                  await ret.forEach(async s => {
                    await sentenceService.create({transcriptionId: transcription.id, ...s})
                  });
                  await transcriptionService.patch(
                    transcription.id, {
                      // 99: completed
                      // 66: empty
                      status: (ret.length) ? 99 : 66,
                    });
                  resolve(ret);
                })
                .catch((err) => { throw err; });
            }
            catch (err) { reject(err); }
          })            
          .finally(() => {
            removeFile(destination, doc.id + '.wav');
          });
      });
    }
    if (process.env.ASR_SERVICE == "custom") {
    
      return new Promise(async (resolve, reject) => {
        console.log("Activating transcription service")
        const curSeq = await transcriptionService.find({ query: {
            documentId,
            $limit: 0}
          });
        const transcription = await transcriptionService.create({
          documentId,
          revision: curSeq.total + 1
        });
        const doc = await documentService.get(documentId);
        const fileName = doc.id + '.' + "wav";
        const destination = app.get('uploads') + '\\wav'
        await transcriptionService.patch(
          transcription.id, {
          // 1: processing
          status: 1
        });
        wavinfo.infoByFilename(destination + '/' + doc.id + '.wav', (err, info) => {
          if (err) throw err;
          const sampleRateHertz = info.header.sample_rate;
        });
        console.log("Attempting to transcribe file...")
        const formData = new FormData();
        formData.append('file', fs.createReadStream(destination + '\\' + fileName), fileName);
        formData.maxDataSize = 1000 *1024 *1024;
        //console.log(formData)
        try {
          const axiosInstance = axios.create({
              maxBodyLength: 1000 * 1024 * 1024,
              maxContentLength: 1000 * 1024 * 1024,
              headers: {"api-key" : process.env.CUSTOM_ASR_KEY,
                "model" : process.env.CUSTOM_ASR_MODEL,
                "language" : process.env.CUSTOM_ASR_LANGUAGE
              },
            });
          
          const response = await axiosInstance.post(`http://${process.env.CUSTOM_ASR_ADDRESS}/upload`, formData, {
              headers: formData.getHeaders(),
          }
        
        ).catch(err => console.error(err))
          console.log('File transcribed successfully:', response.data);
          console.log("Attempt to process transcript")
          try {
            ret = response.data.results
            ret.forEach(async s => {
                  console.log(s)
                  await sentenceService.create({transcriptionId: transcription.id, ...s})
                });
            await transcriptionService.patch(
              transcription.id, {
                // 99: completed
                // 66: empty
                status: (ret.length) ? 99 : 66,
              });
                resolve(ret);
                console.log("Transcript processed successfully")
            }
            catch (err) { throw err; }
          } 
          catch (error) { 
            await transcriptionService.patch(transcription.id, {status : 66})
            throw error; 
            
          }
      });
    }
  }
