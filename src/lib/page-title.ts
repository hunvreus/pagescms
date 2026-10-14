export function pageTitle(
  title: string,
  repository?: { owner: string; repo: string; branch?: string },
) {
  const reference = repository
    ? `${repository.owner}/${repository.repo}${repository.branch ? `@${repository.branch}` : ''}`
    : undefined
  return {
    meta: [
      { title: `${reference ? `${title} - ${reference}` : title} | Pages CMS` },
    ],
  }
}
