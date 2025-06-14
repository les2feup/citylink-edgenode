export function Layout(
  props: { title: string; children: preact.ComponentChildren },
) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <title>{props.title}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <link rel="stylesheet" href="/styles.css" />
      </head>
      <body class={`min-h-screen flex flex-col bg-white text-gray-800`}>
        <header class={`bg-blue-600 text-white p-4 shadow`}>
          <div class="container mx-auto flex justify-between items-center">
            <a href="/" class="text-2xl font-bold">
              Thing Description Directory
            </a>
            <nav>
              <a href="/" class={`mr-4 hover:underline`}>
                Home
              </a>
              <a href="/adaptation" class={`hover:underline`}>
                Adapt End Node
              </a>
            </nav>
          </div>
        </header>

        <main class={`flex-1 container mx-auto p-4`}>
          {props.children}
        </main>

        <footer class={`bg-gray-100 p-4 text-center text-sm text-gray-600`}>
          Powered by{" "}
          <a href="https://fresh.deno.dev" class={`underline`}>Fresh</a> and {" "}
          <a href="https://www.w3.org/WoT/" class={`underline`}>
            W3C Web of Things
          </a> | {" "} Copyright Tiago André Silva de Amorim, 2025
        </footer>
      </body>
    </html>
  );
}
