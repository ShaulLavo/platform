import { http, HttpResponse, type RequestHandler } from 'msw'

// MSW only ever stands in for the *outside world* — third-party hosts the real
// server reaches out to (font downloads, GitHub release assets, provider APIs).
// Our own Elysia server is never mocked here; tests drive it in-process.
export const handlers: RequestHandler[] = [
  http.get('https://www.nerdfonts.com/font-downloads', () =>
    HttpResponse.html(`
      <a href="https://github.com/ryanoasis/nerd-fonts/releases/download/v3.4.0/FiraCode.zip">Download</a>
      <a href="https://github.com/ryanoasis/nerd-fonts/releases/download/v3.4.0/JetBrainsMono.zip">Download</a>
    `),
  ),
]
