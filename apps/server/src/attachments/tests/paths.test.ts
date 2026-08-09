import path from 'node:path'
import type { ChatAttachment } from '@workspace/contracts'
import { describe, expect, it } from 'vitest'

import {
  attachmentFileName,
  extensionForMimeType,
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

describe('extensionForMimeType', () => {
  it('maps the four types Anthropic accepts', () => {
    expect(extensionForMimeType('image/jpeg')).toBe('.jpg')
    expect(extensionForMimeType('image/png')).toBe('.png')
    expect(extensionForMimeType('image/gif')).toBe('.gif')
    expect(extensionForMimeType('IMAGE/WEBP')).toBe('.webp')
  })

  it('returns null for image types the contract regex allows but Claude rejects', () => {
    expect(extensionForMimeType('image/svg+xml')).toBeNull()
    expect(extensionForMimeType('image/bmp')).toBeNull()
    expect(extensionForMimeType('image/heic')).toBeNull()
    expect(extensionForMimeType('image/jpg')).toBeNull()
    expect(extensionForMimeType('application/pdf')).toBeNull()
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
