import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { notifService } from "./services/notificationService"; // add import

// ── Global error forwarding to the notification banner ──
window.onerror = (message, source, lineno, colno, error) => {
  notifService.push(`Error: ${message} (${source}:${lineno})`);
  return true; // prevents default browser console logging (optional)
};

window.onunhandledrejection = (event) => {
  notifService.push(
    `Unhandled: ${event.reason?.message || String(event.reason)}`,
  );
};

// Also catch errors in console.error (optional but useful in kiosk)
const originalConsoleError = console.error;
console.error = (...args) => {
  notifService.push(`Console: ${args.join(" ")}`);
  originalConsoleError.apply(console, args);
};

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
