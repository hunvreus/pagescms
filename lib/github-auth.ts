const isGithubAuthError = (error: unknown) => {
  if (!(error instanceof Error)) return false;

  const message = error.message.toLowerCase();
  return message.includes("github authentication failed")
    || message.includes("bad credentials");
};

export { isGithubAuthError };
