const sort = (a, b, fieldSchema = null) => {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  const numA = parseFloat(a);
  const numB = parseFloat(b);
  if (isNaN(numA) && isNaN(numB)) return 0;
  if (isNaN(numA)) return 1;
  if (isNaN(numB)) return -1;

  return numA - numB;
};

export default sort;