// eslint-disable-next-line import/prefer-default-export
export const getRequiredEnvVar = (name) => {
  const value = process.env[name]
  if (value === undefined) throw new Error(`Required Environment Variable not set: ${name}`)
  return value
}
