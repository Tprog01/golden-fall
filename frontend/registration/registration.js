const regForm = document.getElementById("auth-form");

if (regForm) {
  regForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const login = document.getElementById("login").value;
    const username = document.getElementById("username").value;
    const password = document.getElementById("password").value;
    const confirmPassword = document.getElementById("confirm-password").value;

    if (password !== confirmPassword) {
      showToast("Пароли не совпадают");
      return;
    }

    try {
      const response = await fetch(`${API_URL}/register`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ login, username, password, confirmPassword }),
      });

      const data = await response.json();

      if (response.ok) {
        showToast("Успех: " + data.message);
        window.location.href = "../login/login.html";
      } else {
        showToast("Ошибка: " + data.message);
      }
    } catch (error) {
      showToast("Не удалось связаться с сервером");
    }
  });
}
