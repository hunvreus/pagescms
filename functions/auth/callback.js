export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  
  if (url.searchParams.has('code')) {
    const response = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        client_id: env.GITHUB_CLIENT_ID,
        client_secret: env.GITHUB_CLIENT_SECRET,
        code: url.searchParams.get('code'),
        redirect_uri: `${env.BASE_URL}/auth/callback`,
      }),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(response);
      throw new Error(`Error fetching access token: ${response.statusText}. GitHub says: ${errorText}`);
    }

    const responseData = await response.json();
    
    if (responseData.access_token) {
      return Response.redirect(`${env.BASE_URL}/?access_token=${responseData.access_token}`, 302);
    } else {
      throw new Error('Access token not found');
    }
  }

  return new Response('Invalid request', { status: 400 });
}
