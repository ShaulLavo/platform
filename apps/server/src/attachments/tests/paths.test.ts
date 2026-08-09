import path from 'node:path'
import type { ChatAttachment } from '@workspace/contracts'
import { describe, expect, it } from 'vitest'

import {
  attachmentFileName,
  mimeTypeForAttachmentFileName,
  normalizeAttachmentRelativePath,
  resolveAttachmentRelativePath,
} from '../utils/paths'

const attachmentsDir = path.join(path.sep, 'tmp', 'platform-attachments')

function imageAttachment(overrides: Partial<ChatAttachment> = {}): ChatAttachment {
  return {
    type: 'image',
    id: 'thread-1-abcdef',
    name: 'shot.png',
    mimeType: 'image/png',
    sizeBytes: 4,
    ...overrides,
  }
}

describe('normalizeAttachmentRelativePath', () => {
  it('keeps a plain relative path and forward-slashes it', () => {
    expect(normalizeAttachmentRelativePath('shot.png')).toBe('shot.png')
    expect(normalizeAttachmentRelativePath('./nested/./shot.png')).toBe('nested/shot.png')
  })

  it('rejects empty and dot-only paths', () => {
    expect(normalizeAttachmentRelativePath('')).toBeNull()
    expect(normalizeAttachmentRelativePath('.')).toBeNull()
    expect(normalizeAttachmentRelativePath('..')).toBeNull()
  })

  it('rejects escaping, absolute, and NUL-poisoned paths', () => {
    expect(normalizeAttachmentRelativePath('../../etc/passwd')).toBeNull()
    expect(normalizeAttachmentRelativePath('nested/../../etc/passwd')).toBeNull()
    expect(normalizeAttachmentRelativePath('/etc/passwd')).toBeNull()
    expect(normalizeAttachmentRelativePath('\\\\server\\share\\passwd')).toBeNull()
    expect(normalizeAttachmentRelativePath('shot\0.png')).toBeNull()
  })
})

describe('resolveAttachmentRelativePath', () => {
  it('resolves inside the attachments root', () => {
    expect(resolveAttachmentRelativePath({ attachmentsDir, relativePath: 'shot.png' })).toBe(
      path.join(attachmentsDir, 'shot.png'),
    )
  })

  it('rejects traversal out of the root', () => {
    expect(
      resolveAttachmentRelativePath({ attachmentsDir, relativePath: '../../etc/passwd' }),
    ).toBeNull()
  })

  it('rejects an absolute path', () => {
    expect(
      resolveAttachmentRelativePath({ attachmentsDir, relativePath: '/etc/passwd' }),
    ).toBeNull()
  })

  it('rejects a NUL byte', () => {
    expect(resolveAttachmentRelativePath({ attachmentsDir, relativePath: 'shot\0.png' })).toBeNull()
  })

  it('rejects a sibling directory that merely shares the root prefix', () => {
    expect(
      resolveAttachmentRelativePath({
        attachmentsDir,
        relativePath: '../platform-attachments-evil/x.png',
      }),
    ).toBeNull()
  })
})

describe('mimeTypeForAttachmentFileName', () => {
  it('maps every stored extension back to the type it was written as', () => {
    expect(mimeTypeForAttachmentFileName('a.jpg')).toBe('image/jpeg')
    expect(mimeTypeForAttachmentFileName('a.png')).toBe('image/png')
    expect(mimeTypeForAttachmentFileName('a.gif')).toBe('image/gif')
    expect(mimeTypeForAttachmentFileName('a.WEBP')).toBe('image/webp')
  })

  it('round-trips the name the store writes', () => {
    expect(mimeTypeForAttachmentFileName(attachmentFileName(imageAttachment()) ?? '')).toBe(
      'image/png',
    )
  })

  it('returns null for extensions no attachment is ever written with', () => {
    expect(mimeTypeForAttachmentFileName('a.svg')).toBeNull()
    expect(mimeTypeForAttachmentFileName('a.jpeg')).toBeNull()
    expect(mimeTypeForAttachmentFileName('a.heic')).toBeNull()
    expect(mimeTypeForAttachmentFileName('noextension')).toBeNull()
  })
})

describe('attachmentFileName', () => {
  it('joins the id and the mime extension', () => {
    expect(attachmentFileName(imageAttachment())).toBe('thread-1-abcdef.png')
  })

  it('returns null for an unsupported mime type', () => {
    expect(attachmentFileName(imageAttachment({ mimeType: 'image/svg+xml' }))).toBeNull()
  })

  it('returns null for an id that would break out of a single segment', () => {
    expect(attachmentFileName(imageAttachment({ id: '../evil' }))).toBeNull()
    expect(attachmentFileName(imageAttachment({ id: 'nested/evil' }))).toBeNull()
    expect(attachmentFileName(imageAttachment({ id: '/evil' }))).toBeNull()
  })
})
