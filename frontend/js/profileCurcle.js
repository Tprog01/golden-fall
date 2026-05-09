document.addEventListener("DOMContentLoaded", async function () {
  const profileLink = document.getElementById("profile-circle");
  const profileImg = profileLink.querySelector("img");
  const isLoggedIn = localStorage.getItem("isLoggedIn");

  const token = localStorage.getItem("token");

  try {
    if (token) {
      if (JSON.parse(atob(token.split(".")[1])).exp < Date.now() / 1000) {
        localStorage.setItem("isLoggedIn", "false");
        profileImg.src = `${API_URL}/uploads/default_avatar.png`;
        return;
      }
      if (isLoggedIn === "true") {
        const response = await fetch("/api/avatar", {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        const userData = await response.json();

        profileImg.src = `${API_URL}/uploads/` + userData.photo;
      } else {
        profileImg.src = `${API_URL}/uploads/default_avatar.png`;
      }
    } else {
      profileImg.src = `${API_URL}/uploads/default_avatar.png`;
    }
  } catch (error) {
    console.error("Ошибка:", error.message);
  }
});

document
  .getElementById("profile-circle")
  .addEventListener("click", function (e) {
    e.preventDefault();

    const isLoggedIn = localStorage.getItem("isLoggedIn");

    if (isLoggedIn === "true") {
      window.location.href = "/profile/profile.html";
    } else {
      window.location.href = "/login/login.html";
    }
  });
