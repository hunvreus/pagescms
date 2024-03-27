const sort = (a, b, fieldSchema = null) => {
  // Convert booleans to integers to help with comparison with null/undefined
  const valA = a ? 2 : 1;
  const valB = b ? 2 : 1;
  let comparison = 0;
  if (valA < valB) {
    comparison = -1;
  } else if (valA > valB) {
    comparison = 1;
  }
  return comparison;
};

export default sort;