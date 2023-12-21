export async function onRequest(context) {
  const { env } = context;
  const REDIRECT_URI = `${new URL(context.request.url).origin}/auth/callback`;

  return Response.redirect(`https://github.com/login/oauth/authorize?client_id=${env.CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&scope=repo`, 302);
}