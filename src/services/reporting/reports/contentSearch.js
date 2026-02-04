const Sequelize = require('sequelize');
const errors = require('@feathersjs/errors');

const reportOutput = async (app, { searchString, params: dataParams}, params) => {
  if (!searchString || searchString == ' ' || searchString == '') {
    throw new errors.BadRequest(`Missing or empty search string.`, {
      errors: { $className: 'badParams' }
    });
  }

  searchString = searchString.replace(/'/g, "\\'")

  const queryWhere = [];

  const sequelizeClient = app.get('sequelizeClient');
  let rawq = `SELECT subjects.shortcode AS 'subjectId',
      diaries.id AS 'diaryId',
      diaries.metadata,
      transcriptSentences.id AS 'sentenceId',
      transcriptSentences.startTime,
      transcriptSentences.endTime,
      transcriptSentences.content,
      subjects.metadata AS 'subjectMetadata'
    FROM transcriptSentences
      LEFT JOIN transcriptions ON transcriptions.id = transcriptSentences.transcriptionId
      LEFT JOIN documents ON documents.id = transcriptions.documentId
      LEFT JOIN diaries ON diaries.id = documents.parentId
      LEFT JOIN profiles ON profiles.id = diaries.profileId
      LEFT JOIN subjects ON subjects.id = profiles.subjectId
    WHERE
      `;

  if (dataParams.genderFilter && Array.isArray(dataParams.genderFilter) && dataParams.genderFilter.length > 0) {
    const genderFilter = dataParams.genderFilter
      .map(g => {
        const gender = g.toLowerCase();
        return `(
          (LOWER(subjects.metadata ->> '$.coded.gender') = '${gender}' OR
           (LOWER(subjects.metadata ->> '$.coded.gender') IN ('male', 'female') AND
            CASE
              WHEN LOWER(subjects.metadata ->> '$.coded.gender') = 'male' THEN 'm'
              WHEN LOWER(subjects.metadata ->> '$.coded.gender') = 'female' THEN 'f'
            END = '${gender}')) OR
          (
            (LOWER(subjects.metadata ->> '$.gender') = '${gender}' OR
             (LOWER(subjects.metadata ->> '$.gender') IN ('male', 'female') AND
              CASE
                WHEN LOWER(subjects.metadata ->> '$.gender') = 'male' THEN 'm'
                WHEN LOWER(subjects.metadata ->> '$.gender') = 'female' THEN 'f'
              END = '${gender}'))
          )
        )`;
      })
      .join(' OR ');
    queryWhere.push(`(${genderFilter})`);
  }

  // if (dataParams.subjectIdFilter) {
  //   const subjectIds = dataParams.subjectIdFilter.split(',').map(id => id.trim());
  //   const subjectConditions = subjectIds.map(id => id.startsWith('-') ? `subjects.shortcode NOT LIKE "%${id.slice(1)}%"` : `subjects.shortcode LIKE "%${id}%"`).join(' OR ');
  //   if (subjectConditions) {
  //     queryWhere.push(`(${subjectConditions})`);
  //   }
  // }

  if (dataParams.subjectIdFilter) {
    const subjectIds = dataParams.subjectIdFilter.split(',').map(id => id.trim());
    const subjectConditions = [];

    subjectIds.forEach(id => {
      if (id.startsWith('-')) {
        queryWhere.push(`subjects.shortcode NOT LIKE "%${id.slice(1)}%"`);
      } else {
        subjectConditions.push(`subjects.shortcode LIKE "%${id}%"`);
      }
    });

    if (subjectConditions.length > 0) {
      queryWhere.push(`(${subjectConditions.join(' OR ')})`);
    }
  }

  if (dataParams.categoryFilter && Array.isArray(dataParams.categoryFilter) && dataParams.categoryFilter.length > 0) {
    const categoryFilter = dataParams.categoryFilter
      .map(category => {
        const participant_category = category;
        return `JSON_CONTAINS(subjects.metadata, '"${participant_category}"', '$.participant_category')`;
      })
      .join(' OR ');
    queryWhere.push(`(${categoryFilter})`);
  }

  if (dataParams.completedOnly) {
    queryWhere.push(`diaries.metadata ->> '$.editingStatus' = "Completed"`);
  }

  if (dataParams.regexSearch) {
    // FIX: dirty but it works to convert proper to mysql 5.7 bs
    const mysqlRegex = searchString.replace(/\\b(.*?)\\b/g, '(^|[[:<:]])$1($|[[:>:]])');
    queryWhere.push(`transcriptSentences.content REGEXP '${mysqlRegex}'`);
    //queryWhere.push(`transcriptSentences.content REGEXP '${searchString}'`);
  } else {
    queryWhere.push(`match(transcriptSentences.content) against('${searchString}' IN BOOLEAN MODE)`);
  }

  rawq += queryWhere.join(`
      and `);

  rawq += `
    HAVING
      subjectId IS NOT NULL`;

  const ret = await sequelizeClient.query(rawq, { type: Sequelize.QueryTypes.SELECT });
  return ret;

};

module.exports = reportOutput;
