import type { MediaView } from './media-model'

const cookieName = 'pagescms-media-view'

export function readMediaView(): MediaView {
  const value = document.cookie
    .split(';')
    .map((cookie) => cookie.trim())
    .find((cookie) => cookie.startsWith(`${cookieName}=`))
    ?.slice(cookieName.length + 1)
  return value === 'list' ? 'list' : 'grid'
}

export function saveMediaView(view: MediaView) {
  document.cookie = `${cookieName}=${view}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`
}
