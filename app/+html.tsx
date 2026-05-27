import { ScrollViewStyleReset } from "expo-router/html";
import type { PropsWithChildren } from "react";

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />
        <meta name="theme-color" content="#2D3A28" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-title" content="Finance Manager" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Onest:wght@400;500;600;700&display=swap" rel="stylesheet" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link rel="icon" href="/favicon.ico" />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function () {
                try {
                  var bg = '#2D3A28';
                  var text = '#FFFFFF';
                  document.documentElement.dataset.theme = 'dark';
                  document.documentElement.style.backgroundColor = bg;
                  document.documentElement.style.setProperty('--app-bg', bg);
                  document.documentElement.style.setProperty('--app-text', text);
                  document.documentElement.style.colorScheme = 'dark';
                  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', bg);
                } catch (error) {}
              })();
            `,
          }}
        />
        <style
          dangerouslySetInnerHTML={{
            __html: `
              html, body { min-height: 100%; background: var(--app-bg, #2D3A28); color: var(--app-text, #FFFFFF); font-family: 'Onest', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
              #root { min-height: 100%; max-width: 430px; margin: 0 auto; background: var(--app-bg, #2D3A28); color: var(--app-text, #FFFFFF); box-shadow: 0 0 0 1px rgba(255,255,255,0.06); }
              html[data-theme="dark"], html[data-theme="dark"] body { background: #2D3A28; }
              * { box-sizing: border-box; }
              body { margin: 0; overscroll-behavior-y: none; }
              input, button, textarea { font: inherit; }
              @media (max-width: 414px) {
                html, body, #root { width: 100%; overflow-x: hidden; }
              }
              @media (max-width: 390px) {
                input, textarea, button { min-height: 44px; }
              }
              @media (max-width: 375px) {
                body { -webkit-text-size-adjust: 100%; }
              }
            `,
          }}
        />
        <ScrollViewStyleReset />
      </head>
      <body>{children}</body>
    </html>
  );
}
