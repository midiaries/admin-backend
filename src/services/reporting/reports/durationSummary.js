const Sequelize = require('sequelize');

const reportOutput = async (app, { date1, date2, params: dataParams}, params) => {
  if (!date2) {
    date2 = date1;
  }
  if (date2 < date1) {
    const temp = date2;
    date2 = date1;
    date1 = temp;
  }
  const sequelizeClient = app.get('sequelizeClient');
  /*
  let rawq = `select
      profiles.subjectId, 
      count(diaries.id) as 'diaryCount',
      sum(diaries.metadata->>"$.duration") / 60 as 'diaryLengthTotal',
      ANY_VALUE(profiles.metadata) as profileMetadata,
      paymentGroups.shortName as paymentGroup
    from diaries
    left join profiles on profiles.id = diaries.profileId
    left join paymentGroups on paymentGroups.id = profiles.metadata->>"$.paymentGroup"`
  if (date1) {
    rawq += `
      where diaries.metadata ->> '$.diaryDate' between "${date1}" and "${date2}"`;
  }
  rawq += `
    group by profiles.subjectId
    order by profiles.subjectId`;

  */
  let rawq = `select
      subjects.shortcode as 'subjectId', 
      subjects.first as 'Name',
      subjects.email as 'Email',
      count(diaries.id) as 'diaryCount',
      sum(diaries.metadata->>"$.duration") / 60 as 'diaryLengthTotal',
      ANY_VALUE(subjects.metadata) as subjectMetadata,
      paymentGroups.shortName as paymentGroup
    from diaries
    left join profiles on profiles.id = diaries.profileId
    left join subjects on subjects.id = profiles.subjectId
    left join paymentGroups on paymentGroups.id = subjects.metadata->>"$.paymentGroup"
    where profiles.subjectId is not null`
  if (date1) {
    rawq += `
      and diaries.metadata ->> '$.diaryDate' between "${date1}" and "${date2}"`;
  }
  rawq += `
    group by profiles.subjectId
    order by subjects.shortcode`;

  const ret = await sequelizeClient.query(rawq, { type: Sequelize.QueryTypes.SELECT });
  return ret;

};

module.exports = reportOutput;
