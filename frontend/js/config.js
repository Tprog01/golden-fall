const API_URL =
  window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
    ? "http://localhost:3000" // Укажи здесь тот порт, на котором запускаешь бэкенд ЛОКАЛЬНО
    : "https://onrender.com";