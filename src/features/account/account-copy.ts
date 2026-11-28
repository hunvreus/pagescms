import { msg } from '@lingui/core/macro'

export const profileFieldCopy = {
  picture: {
    label: msg({ message: 'Picture' }),
    description: msg({ message: 'Optional. Helps others recognize you.' }),
  },
  name: {
    label: msg({ message: 'Name' }),
    description: msg({
      message: 'Displayed in your profile and collaborator lists.',
    }),
  },
}
export const deleteAccountDescription = msg({
  message: 'Permanently delete your profile and collaborator access.',
})
