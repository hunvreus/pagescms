import { expect, it } from 'vitest'
import {
  fieldValidationError,
  fieldValidationIssues,
} from '#/shared/field-validation-error'

it('retains indexed errors through an ordinary Error-message transport', () => {
  const issues = [
    { path: 'items.2.title', message: 'Title is required' },
    { path: 'gallery.0', message: 'Disallowed image' },
  ]
  const transported = new Error(fieldValidationError(issues).message)
  expect(fieldValidationIssues(transported)).toEqual(issues)
})
it.each([
  'Ordinary provider failure',
  'Content validation failed: {"path":"title"}',
  'Content validation failed: [{"path":3,"message":"Invalid"}]',
  'Content validation failed: broken JSON',
])('does not swallow unrelated or malformed errors: %s', (message) => {
  expect(fieldValidationIssues(new Error(message))).toBeUndefined()
})
