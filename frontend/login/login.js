import { API_URL } from "../js/config.js";

const logForm = document.getElementById("auth-form");

if (logForm) {
  logForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const login = document.getElementById("login").value;
    const password = document.getElementById("password").value;

    try {
      const response = await fetch(`${API_URL}/api/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ login, password }),
      });

      const data = await response.json();

      if (response.ok) {
        localStorage.setItem("token", data.token);
        localStorage.setItem("isLoggedIn", "true");

        showToast("Вы успешно зашли!");

        window.location.href = "/index/index.html";
      } else {
        showToast("Ошибка: " + data.message);
      }
    } catch (error) {
      console.error("Ошибка запроса:", error.message);
      showToast("Сервер не отвечает.");
    }
  });
}
