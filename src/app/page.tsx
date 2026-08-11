"use client";

import App from "../App";

// The console is a single client-rendered shell: it holds the bearer token in
// localStorage and polls the API on an interval, so there is nothing useful to
// render on the server.
export default function Page() {
  return <App />;
}
