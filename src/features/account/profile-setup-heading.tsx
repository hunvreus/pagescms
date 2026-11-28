import { Trans as UiTrans } from '@lingui/react/macro'
import { CardHeader, CardTitle, CardDescription } from '#/components/ui/card'

export function ProfileSetupHeading() {
  return (
    <CardHeader>
      <CardTitle>
        <h1>
          <UiTrans>Confirm your details</UiTrans>
        </h1>
      </CardTitle>
      <CardDescription>
        <UiTrans>Check your name and picture before you continue.</UiTrans>
      </CardDescription>
    </CardHeader>
  )
}
