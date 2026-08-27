export interface ReferenceContext {
  owner: string
  repo: string
  branch: string
  media?: Array<{
    name: string
    label: string
    input: string
    output: string
    extensions: string[]
  }>
}
