const connectivityErrorMessages = new Set([
  'failed to fetch',
  'fetch failed',
  'networkerror when attempting to fetch resource.',
  'load failed',
  'network error',
  'network request failed',
  'unable to connect. is the computer able to access the url?',
])

export function isConnectivityError(input: unknown): boolean {
  return input instanceof TypeError && connectivityErrorMessages.has(input.message.toLowerCase())
}
