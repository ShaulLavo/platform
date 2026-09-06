import { expect, test } from '../../../test/fixtures'

import { readArguments } from '@/host/utils/arguments'

test.each([
  'not-a-url',
  'ftp://localhost:3001',
  'file:///work/projects/platform',
  'http://username:password@localhost:3001',
  'http://username@localhost:3001',
  'http://localhost:3001/api',
  'http://localhost:3001/?token=value',
  'http://localhost:3001/#settings',
])('rejects an invalid server origin: %s', (origin) => {
  expect(() => readArguments(['--origin', origin], {})).toThrow('Invalid server origin.')
})

test('validates the environment default and preserves an explicit origin override', () => {
  const env = { VITE_SERVER_URL: 'http://username:password@localhost:3001' }
  expect(() => readArguments([], env)).toThrow('Invalid server origin.')
  expect(readArguments(['--origin', 'https://localhost:3443/'], env).origin).toBe(
    'https://localhost:3443',
  )
})

test('accepts IPv6 loopback origins', () => {
  expect(readArguments(['--origin', 'http://[::1]:3001'], {}).origin).toBe('http://[::1]:3001')
})
