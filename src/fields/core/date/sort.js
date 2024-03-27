import moment from 'moment';

const sort = (a, b, fieldSchema = null) => {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  const dateFormat = fieldSchema?.options?.format || 'YYYY-MM-DD';
  const dayA = moment(a, dateFormat);
  const dayB = moment(b, dateFormat);
  if (!dayA.isValid() && !dayB.isValid()) return 0;
  if (!dayA.isValid()) return 1;
  if (!dayB.isValid()) return -1;
  
  return dayA.valueOf() - dayB.valueOf();
};

export default sort;