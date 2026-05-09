(function initUI() {
  const style = document.createElement("style");
  style.textContent = `
        .toast-container {
            position: fixed; bottom: 20px; left: 20px;
            z-index: 10001; width: 320px;
            display: flex; flex-direction: column; gap: 0;
        }
        .toast-item {
            background: #ffffff; 
            border-left: 10px solid #ff8c00; /* Более насыщенный темно-оранжевый */
            padding: 20px 25px; 
            border-radius: 12px;
            /* Усилили тень: сделали её темнее и добавили немного оранжевого свечения */
            box-shadow: 0 10px 30px rgba(0,0,0,0.15), 0 4px 10px rgba(255, 140, 0, 0.1);
            color: #222; /* Текст чуть чернее для контраста */
            width: 100%; 
            font-size: 15px;
            font-family: 'Segoe UI', sans-serif; 
            font-weight: 600; /* Сделали текст чуть жирнее */
            margin-top: -70px; 
            transition: all 0.4s cubic-bezier(0.25, 1, 0.5, 1);
            opacity: 0; 
            transform: translateX(-100%);
        }
        .toast-item.active { 
            opacity: 1; transform: translateX(0); 
            margin-top: 8px; /* Небольшой зазор между активными */
        }
        .toast-item.fade-out { 
            opacity: 0 !important; 
            transform: scale(0.8) translateY(-15px) !important;
            margin-top: -75px !important;
        }
    `;
  document.head.appendChild(style);

  const container = document.createElement("div");
  container.id = "toast-container";
  container.className = "toast-container";
  document.body.appendChild(container);
})();

window.showToast = function (message, duration = 3500) {
  const container = document.getElementById("toast-container");
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = "toast-item";
  toast.textContent = message;
  container.appendChild(toast);

  const updateStack = () => {
    const items = Array.from(
      container.querySelectorAll(".toast-item:not(.fade-out)"),
    ).reverse();

    items.forEach((item, index) => {
      if (index === 0) {
        item.style.opacity = "1";
        item.style.zIndex = "100";
        item.style.transform = "scale(1) translateY(0)";
      } else if (index === 1) {
        item.style.opacity = "0.6";
        item.style.zIndex = "90";
        item.style.transform =
          "scale(0.96) translateY(-8px)"; /* Компактный сдвиг */
      } else if (index === 2) {
        item.style.opacity = "0.3";
        item.style.zIndex = "80";
        item.style.transform =
          "scale(0.92) translateY(-16px)"; /* Компактный сдвиг */
      } else {
        item.classList.add("fade-out");
        setTimeout(() => item.remove(), 500);
      }
    });
  };

  requestAnimationFrame(() => {
    toast.classList.add("active");
    updateStack();
  });

  setTimeout(() => {
    toast.classList.add("fade-out");
    setTimeout(() => {
      toast.remove();
      updateStack();
    }, 500);
  }, duration);
};
