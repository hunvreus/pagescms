type ConfigurationRecord = Record<string, unknown>

function isRecord(value: unknown): value is ConfigurationRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function resolveSettings(configuration?: ConfigurationRecord) {
  return isRecord(configuration?.settings) ? configuration.settings : {}
}

export function isConfigurationEditingEnabled(
  configuration?: ConfigurationRecord,
) {
  const settings = resolveSettings(configuration)
  if (typeof settings.config === 'boolean') return settings.config
  if (typeof settings.hide === 'boolean') return !settings.hide
  return true
}

export function isCacheManagementEnabled(configuration?: ConfigurationRecord) {
  return resolveSettings(configuration).cache === true
}
