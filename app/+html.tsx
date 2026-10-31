import { ScrollViewStyleReset } from "expo-router/html";
import type { PropsWithChildren } from "react";

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta name="theme-color" content="#F3F7F6" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
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
                var updateAppHeight = function () {
                  var viewport = window.visualViewport;
                  var height = viewport ? viewport.height : window.innerHeight;
                  document.documentElement.style.setProperty('--app-height', Math.round(height) + 'px');
                };
                updateAppHeight();
                window.addEventListener('resize', updateAppHeight, { passive: true });
                window.visualViewport?.addEventListener('resize', updateAppHeight, { passive: true });
                try {
                  var savedTheme = window.localStorage.getItem('finance_app_theme');
                  var isDark = savedTheme === 'dark' || (savedTheme !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches);
                  var bg = isDark ? '#0B1C22' : '#F3F7F6';
                  var text = isDark ? '#FFFFFF' : '#102D39';
                  document.documentElement.dataset.theme = isDark ? 'dark' : 'light';
                  document.documentElement.style.backgroundColor = bg;
                  document.documentElement.style.setProperty('--app-bg', bg);
                  document.documentElement.style.setProperty('--app-text', text);
                  document.documentElement.style.colorScheme = isDark ? 'dark' : 'light';
                  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', bg);
                } catch (error) {}
              })();
            `,
          }}
        />
        <style
          dangerouslySetInnerHTML={{
            __html: `
              html, body { width: 100%; height: var(--app-height, 100dvh); min-height: 0; background: var(--app-bg, #F3F7F6); color: var(--app-text, #102D39); font-family: 'Onest', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; -webkit-text-size-adjust: 100%; text-size-adjust: 100%; overflow: hidden; }
              #root { width: 100%; height: var(--app-height, 100dvh); min-height: 0; margin: 0; background: var(--app-bg, #F3F7F6); color: var(--app-text, #102D39); display: flex; flex-direction: column; overflow: hidden; }
              html[data-theme="dark"], html[data-theme="dark"] body { background: #0B1C22; }
              * { box-sizing: border-box; }
              body { margin: 0; overscroll-behavior-y: none; }
              input, button, textarea { font: inherit; }
              input, textarea, select, [contenteditable="true"] { font-size: 16px !important; touch-action: manipulation; }
              /* iPhone 13 and similar devices */
              @media (max-width: 430px) {
                html, body, #root { width: 100%; max-width: 100%; overflow-x: hidden; }
              }
              /* Landscape mode on mobile */
              @media (orientation: landscape) and (max-height: 500px) {
                #root { max-width: 100%; }
              }
              @media (max-width: 390px) {
                input, textarea, button { min-height: 44px; }
              }
              @media (max-width: 375px) {
                body { -webkit-text-size-adjust: 100%; }
              }
              /* Safe areas for notched devices */
              @supports (padding: env(safe-area-inset-top)) {
                body { padding-left: env(safe-area-inset-left); padding-right: env(safe-area-inset-right); }
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
