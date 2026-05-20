import { ScrollViewStyleReset } from "expo-router/html";
import type { PropsWithChildren } from "react";

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />
        <meta name="theme-color" content="#2E7FF1" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-title" content="Finance Manager" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link rel="icon" href="/favicon.ico" />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function () {
                try {
                  var stored = localStorage.getItem('finance_app_theme');
                  var prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
                  var dark = stored === 'dark' || (!stored || stored === 'system') && prefersDark;
                  var bg = dark ? '#0B0F19' : '#F5F7FB';
                  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
                  document.documentElement.style.backgroundColor = bg;
                  document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
                  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', bg);
                } catch (error) {}
              })();
            `,
          }}
        />
        <style
          dangerouslySetInnerHTML={{
            __html: `
              html, body, #root { min-height: 100%; background: var(--app-bg, #F5F7FB); }
              html[data-theme="dark"], html[data-theme="dark"] body { background: #0B0F19; }
              * { box-sizing: border-box; }
              body { margin: 0; overscroll-behavior-y: none; }
              input, button, textarea { font: inherit; }
            `,
          }}
        />
        <ScrollViewStyleReset />
      </head>
      <body>{children}</body>
    </html>
  );
}
