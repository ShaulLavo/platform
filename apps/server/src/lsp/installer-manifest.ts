export type PinnedLspRuntimeId = keyof typeof pinnedLspRuntimeManifest

export type PinnedLspRuntimeManifestEntry = {
  readonly binaryName: string
  readonly version: string
  readonly platforms: Partial<
    Record<
      NodeJS.Platform,
      Partial<
        Record<
          NodeJS.Architecture,
          {
            readonly extractArgs?: readonly string[]
            readonly name: string
            readonly sha256: string
            readonly url: string
          }
        >
      >
    >
  >
}

export const pinnedLspRuntimeManifest = {
  texlab: {
    binaryName: 'texlab',
    version: 'v5.25.1',
    platforms: {
      darwin: {
        arm64: {
          name: 'texlab-aarch64-macos.tar.gz',
          sha256: '3755e9d1d4ad0b25135bdacd2fb453a612e88f48133185f96d660fa550398f66',
          url: 'https://github.com/latex-lsp/texlab/releases/download/v5.25.1/texlab-aarch64-macos.tar.gz',
        },
        x64: {
          name: 'texlab-x86_64-macos.tar.gz',
          sha256: '11289a231f0cf382857a6a4a2eda1ba9f4f4e950af343b455797e3922d13b1ea',
          url: 'https://github.com/latex-lsp/texlab/releases/download/v5.25.1/texlab-x86_64-macos.tar.gz',
        },
      },
      linux: {
        arm64: {
          name: 'texlab-aarch64-linux.tar.gz',
          sha256: 'e0d8e0b27b2e6e3526fa5019323bb3fddb1202a0f0049e527672b5ff323cc15e',
          url: 'https://github.com/latex-lsp/texlab/releases/download/v5.25.1/texlab-aarch64-linux.tar.gz',
        },
        x64: {
          name: 'texlab-x86_64-linux.tar.gz',
          sha256: 'c8260b2fd2849cbad7d1f54c4ffa0389f34664b049392107bc4f7f9c8ec542ba',
          url: 'https://github.com/latex-lsp/texlab/releases/download/v5.25.1/texlab-x86_64-linux.tar.gz',
        },
      },
      win32: {
        arm64: {
          name: 'texlab-aarch64-windows.zip',
          sha256: '04ef3ec3a86dc1dfa9d3beb90bcea5e6e3736cda8428cd6c6469b89f1e786973',
          url: 'https://github.com/latex-lsp/texlab/releases/download/v5.25.1/texlab-aarch64-windows.zip',
        },
        x64: {
          name: 'texlab-x86_64-windows.zip',
          sha256: 'aa5fc1fe6004c17cd83086a57a8c8f28bb3f360914872711bfbb83490dc3c19e',
          url: 'https://github.com/latex-lsp/texlab/releases/download/v5.25.1/texlab-x86_64-windows.zip',
        },
      },
    },
  },
  tinymist: {
    binaryName: 'tinymist',
    version: 'v0.14.18',
    platforms: {
      darwin: {
        arm64: {
          extractArgs: ['--strip-components=1'],
          name: 'tinymist-aarch64-apple-darwin.tar.gz',
          sha256: '98d2f47e7973ff75c40e3716185385c8e7357a6a6f821771041565f222aac940',
          url: 'https://github.com/Myriad-Dreamin/tinymist/releases/download/v0.14.18/tinymist-aarch64-apple-darwin.tar.gz',
        },
        x64: {
          extractArgs: ['--strip-components=1'],
          name: 'tinymist-x86_64-apple-darwin.tar.gz',
          sha256: 'ea0ed898ea6d0fec5ccf14468d5093949585189ee4cb440d6bbb250ea57206f4',
          url: 'https://github.com/Myriad-Dreamin/tinymist/releases/download/v0.14.18/tinymist-x86_64-apple-darwin.tar.gz',
        },
      },
      linux: {
        arm64: {
          extractArgs: ['--strip-components=1'],
          name: 'tinymist-aarch64-unknown-linux-gnu.tar.gz',
          sha256: '19eb636189d42e028c4116777382d0a338827059563ab502161ca2d900ff022a',
          url: 'https://github.com/Myriad-Dreamin/tinymist/releases/download/v0.14.18/tinymist-aarch64-unknown-linux-gnu.tar.gz',
        },
        x64: {
          extractArgs: ['--strip-components=1'],
          name: 'tinymist-x86_64-unknown-linux-gnu.tar.gz',
          sha256: '8033383d691165d567c5ccd83888dca2b629fcc1054da6eef8c81e1715df8ca9',
          url: 'https://github.com/Myriad-Dreamin/tinymist/releases/download/v0.14.18/tinymist-x86_64-unknown-linux-gnu.tar.gz',
        },
      },
      win32: {
        arm64: {
          name: 'tinymist-aarch64-pc-windows-msvc.zip',
          sha256: '4a302734a2a6d6c4911404ca0c62f97ace706ebc62666b18090bc36031baaaa4',
          url: 'https://github.com/Myriad-Dreamin/tinymist/releases/download/v0.14.18/tinymist-aarch64-pc-windows-msvc.zip',
        },
        x64: {
          name: 'tinymist-x86_64-pc-windows-msvc.zip',
          sha256: '2c6433ce8fc5126252d5c78db3e2886d089cec7ccc5ed32f12c7b1847b534a34',
          url: 'https://github.com/Myriad-Dreamin/tinymist/releases/download/v0.14.18/tinymist-x86_64-pc-windows-msvc.zip',
        },
      },
    },
  },
  zls: {
    binaryName: 'zls',
    version: '0.16.0',
    platforms: {
      darwin: {
        arm64: {
          name: 'zls-aarch64-macos.tar.xz',
          sha256: 'b93ec549f8558a7e85984a840e9276d274f1059b54ade4254296ef4982958359',
          url: 'https://github.com/zigtools/zls/releases/download/0.16.0/zls-aarch64-macos.tar.xz',
        },
        x64: {
          name: 'zls-x86_64-macos.tar.xz',
          sha256: '49f716ea96c1aadaecaa5d9c0a50874cbcf443dc42b825f1e7ee35499ad3eb96',
          url: 'https://github.com/zigtools/zls/releases/download/0.16.0/zls-x86_64-macos.tar.xz',
        },
      },
      linux: {
        arm64: {
          name: 'zls-aarch64-linux.tar.xz',
          sha256: '430cd293d201eb70ae2519dbc96c854bf8791b8df7fc9392e8d2dc9680a2bed7',
          url: 'https://github.com/zigtools/zls/releases/download/0.16.0/zls-aarch64-linux.tar.xz',
        },
        x64: {
          name: 'zls-x86_64-linux.tar.xz',
          sha256: 'ded6d562a0b86ee878b1ddf70ffab2797ce3cdca3b02d6077548f9d56dff96b6',
          url: 'https://github.com/zigtools/zls/releases/download/0.16.0/zls-x86_64-linux.tar.xz',
        },
      },
      win32: {
        arm64: {
          name: 'zls-aarch64-windows.zip',
          sha256: 'ef4c5ccb93c80c9f023105c5f558ae8774ac6668d560ba6f92a2f87d95df2311',
          url: 'https://github.com/zigtools/zls/releases/download/0.16.0/zls-aarch64-windows.zip',
        },
        x64: {
          name: 'zls-x86_64-windows.zip',
          sha256: '35cbb7163224e8cf92d21099c1b1391f2aba927f25d389f021b13a21d40b96dd',
          url: 'https://github.com/zigtools/zls/releases/download/0.16.0/zls-x86_64-windows.zip',
        },
      },
    },
  },
} as const satisfies Record<string, PinnedLspRuntimeManifestEntry>
