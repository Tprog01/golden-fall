import { API_URL } from "../js/config.js";

document.addEventListener("DOMContentLoaded", async () => {
  try {
    const urlParams = new URLSearchParams(window.location.search);
    const type = urlParams.get("type");

    if (!type) {
      throw new Error("Ошибка при получении категории товаров");
    }

    const response = await fetch(`${API_URL}/api/products?type=${type}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        authorization: `Bearer ${localStorage.getItem("token")}`,
      },
    });
    if (!response.ok) throw new Error("Ошибка при получении данных");

    const products = await response.json();
    const container = document.querySelector(".categories-grid");

    if (!container)
      return console.error("Контейнер .categories-grid не найден!");

    container.innerHTML = "";

    if (!products || products.length === 0) {
      container.innerHTML = `<p style="color: white;">Тут ничего нет :(</p>`;
      return;
    }

    products.forEach((item) => {
      const displayStock = Number(item.stock);
      const favoriteClass = item.isFavorite ? "active" : "";

      container.innerHTML += `            
        <div class="category-card">
            <div class="image-wrapper">
                <img src="${item.photo}" alt="${item.title}">
                <button class="wishlist-btn ${favoriteClass}" data-id="${item.id}">❤</button>
            </div>                
            <h3 id="title">${item.title}</h3>
            <p>Цена: ${item.price} руб.</p> 
            <p>В наличии: ${displayStock} ${item.unit}</p> 
            <button class="add-to-cart" data-id="${item.id}">В корзину</button>
        </div>
    `;
    });
  } catch (error) {
    console.error("Ошибка:", error);
    document.querySelector(".categories-grid").innerHTML =
      `<p style = "color: white; font-size: clamp(14px, 2vw, 20px);">Не удалось загрузить товары :(</p> 
      <br>
      <span style = "color: white; font-size: clamp(14px, 2vw, 20px);">Авторизация на сайте должна решить проблему</span>`;
  }
});

document.addEventListener("click", async (e) => {
  const token = localStorage.getItem("token");

  if (e.target.classList.contains("add-to-cart")) {
    if (
      token === null ||
      JSON.parse(atob(token.split(".")[1])).exp < Date.now() / 1000
    ) {
      showToast("Для добавления товара в корзину необходимо войти в аккаунт");
      return;
    }
    const productId = e.target.dataset.id;
    const response = await fetch(`${API_URL}/api/addToCart`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ productId }),
    });

    const result = await response.json();
    if (response.ok) {
      if (result.message === "Количество товаров в корзине увеличено") {
        showToast(`Количество товаров в корзине увеличено: ${result.quantity}`);
      } else if (result.message === "Товар добавлен в корзину") {
        showToast("Товар добавлен в корзину!");
      }
    } else {
      showToast(result.message || "Ошибка при добавлении");
    }
  }
});

let timer = 0;

document.addEventListener("click", async (e) => {
  const btn = e.target.closest(".wishlist-btn");
  if (!btn) return;

  const token = localStorage.getItem("token");

  if (!token || token === "null") {
    showToast("Войдите в аккаунт, чтобы добавлять товары в избранное");
    return;
  }

  const payload = JSON.parse(atob(token.split(".")[1]));
  if (payload.exp < Date.now() / 1000) {
    showToast("Сессия истекла, войдите снова");
    localStorage.removeItem("token");
    window.location.href = "/login/login.html";
    return;
  }

  btn.classList.toggle("active");

  btn.classList.add("pulse");

  setTimeout(() => {
    btn.classList.remove("pulse");
  }, 400);

  btn.blur();

  const productId = btn.dataset.id;
  try {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      const response = await fetch(`${API_URL}/api/setFavorite`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ productId }),
      });

      if (!response.ok) throw new Error("Ошибка сервера");
    }, 400);

    // const result = await response.json();
  } catch {
    console.error("Ошибка сети");
  }
});
