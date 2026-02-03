const Sequelize = require('sequelize');
const errors = require('@feathersjs/errors');

const reportOutput = async (app, { params: dataParams }, params) => {
  const sequelizeClient = app.get('sequelizeClient');

  const queryWhere = [];
  const queryHaving = ['subjectId IS NOT NULL'];
  const subqueryWhere = [];

  const minDiaryDuration = dataParams.minDiaryDuration || null;
  const minDiaryTotal = dataParams.minDiaryTotal || null;

  if (minDiaryDuration) {
    queryWhere.push(`diaries.metadata->>"$.duration" >= ${minDiaryDuration * 60}`);
    subqueryWhere.push(`diaries.metadata->>"$.duration" >= ${minDiaryDuration * 60}`);
  }

  if (dataParams.completedOnly) {
    queryWhere.push(`diaries.metadata ->> '$.editingStatus' = "Completed"`);
    subqueryWhere.push(`diaries.metadata ->> '$.editingStatus' = "Completed"`);
  }

  if (minDiaryTotal) {
    queryHaving.push(`subjectTotalDuration >= ${minDiaryTotal * 60}`);
  }

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

  if (dataParams.categoryFilter && Array.isArray(dataParams.categoryFilter) && dataParams.categoryFilter.length > 0) {
    const categoryFilter = dataParams.categoryFilter
      .map(category => {
        const participant_category = category;
        return `JSON_CONTAINS(subjects.metadata, '"${participant_category}"', '$.participant_category')`;
      })
      .join(' OR ');
    queryWhere.push(`(${categoryFilter})`);
  }

  let rawq = `
    SELECT
      subjects.shortcode AS subjectId,
      diaries.id AS diaryId,
      diaries.metadata,
      subjectDiaries.diaryCount,
      subjectDiaries.subjectTotalDuration,
      subjects.metadata AS subjectMetadata
    FROM diaries
      LEFT JOIN profiles ON profiles.id = diaries.profileId
      LEFT JOIN subjects ON subjects.id = profiles.subjectId
      INNER JOIN (
        SELECT
          profiles.subjectId,
          COUNT(diaries.id) AS diaryCount,
          SUM(diaries.metadata->>"$.duration") AS subjectTotalDuration
        FROM diaries
        LEFT JOIN profiles ON profiles.id = diaries.profileId`
      if (subqueryWhere.length > 0) {
        rawq += `
        WHERE
          ${subqueryWhere.join(' AND ')}`;
      }
      rawq += `
        GROUP BY profiles.subjectId
      ) subjectDiaries ON subjectDiaries.subjectId = subjects.id`;

  if (queryWhere.length > 0) {
    rawq += `
    WHERE
      ${queryWhere.join(' AND ')}`;
  }

  if (queryHaving.length > 0) {
    rawq += `
    HAVING
      ${queryHaving.join(' AND ')}`;
  }

  rawq += `
    ORDER BY subjects.shortcode, diaries.metadata->>"$.diaryDate", diaries.metadata->>"$.sequence"
  `;

  const ret = await sequelizeClient.query(rawq, { type: Sequelize.QueryTypes.SELECT });
  return ret;
};

module.exports = reportOutput;
