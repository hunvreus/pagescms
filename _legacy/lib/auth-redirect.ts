const getSafeRedirect = (redirectTo?: string) => {
  if (!redirectTo) return "/";
  return redirectTo.startsWith("/") && !redirectTo.startsWith("//")
    ? redirectTo
    : "/";
};

const getAuthCallbackURL = (redirectTo?: string) => {
  const safeRedirect = getSafeRedirect(redirectTo);
  return safeRedirect === "/"
    ? "/"
    : `/auth/redirect?to=${encodeURIComponent(safeRedirect)}`;
};

export { getAuthCallbackURL, getSafeRedirect };
