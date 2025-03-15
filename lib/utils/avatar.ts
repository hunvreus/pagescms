/**
 * Helper function to get the name initials for a user avatar.
 */

const getInitialsFromName = (name?: string) => {
  if (!name) return 'U';

  const nameParts = name.trim().split(' ');

  if (nameParts.length === 1) {
    return nameParts[0].substring(0, 2).toUpperCase();
  }

  const firstNameInitial = nameParts[0].charAt(0).toUpperCase();
  const lastNameInitial = nameParts[nameParts.length - 1].charAt(0).toUpperCase();

  return firstNameInitial + lastNameInitial;
};

export { getInitialsFromName };