import { msg } from '@lingui/core/macro'
import { createElement } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import UserAccountIcon from '@hugeicons/core-free-icons/UserAccountIcon'
import PreferenceHorizontalIcon from '@hugeicons/core-free-icons/PreferenceHorizontalIcon'
import Login01Icon from '@hugeicons/core-free-icons/Login01Icon'
import Download02Icon from '@hugeicons/core-free-icons/Download02Icon'
import Delete02Icon from '@hugeicons/core-free-icons/Delete02Icon'
import UserGroupIcon from '@hugeicons/core-free-icons/UserGroupIcon'
import Folder01Icon from '@hugeicons/core-free-icons/Folder01Icon'
import DatabaseIcon from '@hugeicons/core-free-icons/DatabaseIcon'
import deployment from '#pagescms/deployment/client'

export const accountNavigation = [
  {
    icon: () =>
      createElement(HugeiconsIcon, {
        icon: UserAccountIcon,
        'aria-hidden': true,
      }),
    id: 'profile',
    label: msg`Profile`,
  },
  {
    icon: () =>
      createElement(HugeiconsIcon, { icon: Login01Icon, 'aria-hidden': true }),
    id: 'security',
    label: msg`Sign-in methods`,
  },
  {
    icon: () =>
      createElement(HugeiconsIcon, {
        icon: PreferenceHorizontalIcon,
        'aria-hidden': true,
      }),
    id: 'preferences',
    label: msg`Preferences`,
  },
  {
    icon: () =>
      createElement(HugeiconsIcon, {
        icon: Download02Icon,
        'aria-hidden': true,
      }),
    id: 'installations',
    label: msg`Installations`,
  },
  ...deployment.accountSettings.map((page) => ({
    id: page.id,
    label: page.label,
    icon: page.icon,
  })),
  {
    icon: () =>
      createElement(HugeiconsIcon, { icon: Delete02Icon, 'aria-hidden': true }),
    id: 'delete-account',
    label: msg`Delete account`,
  },
]

export const adminNavigation = [
  {
    icon: () =>
      createElement(HugeiconsIcon, { icon: Login01Icon, 'aria-hidden': true }),
    id: 'allowlist',
    label: msg`Sign-in access`,
  },
  {
    icon: () =>
      createElement(HugeiconsIcon, {
        icon: UserGroupIcon,
        'aria-hidden': true,
      }),
    id: 'users',
    label: msg`Users`,
  },
  {
    icon: () =>
      createElement(HugeiconsIcon, { icon: Folder01Icon, 'aria-hidden': true }),
    id: 'repositories',
    label: msg`Repositories`,
  },
  {
    icon: () =>
      createElement(HugeiconsIcon, { icon: DatabaseIcon, 'aria-hidden': true }),
    id: 'cache',
    label: msg`Cache`,
  },
]
