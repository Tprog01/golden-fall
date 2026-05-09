require("dotenv").config();
const express = require("express");
const rateLimit = require("express-rate-limit");
const path = require("path");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const db = require("./db");
const multer = require("multer");
const { decode } = require("punycode");
const fs = require("fs");
const { type } = require("os");

const app = express();
const rootPath = path.join(__dirname, "..", "..", "frontend");
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, "/images/uploads"));
  },
  filename: (req, file, cb) => {
    const uniqieName =
      Date.now() +
      "-" +
      Math.round(Math.random() * 1e9) +
      path.extname(file.originalname);
    cb(null, uniqieName);
  },
});
const upload = multer({
  storage: storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Можно загружать только изображения!"), false);
    }
  },
});

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  handler: (req, res) => {
    res.status(429).json({
      message: "Вы делаете запросы слишком часто. Подождите 15 минут.",
    });
  },
});

app.use(cors());
app.use(express.json());
app.use(limiter);
app.use(express.static(rootPath));
app.use("/uploads", express.static("images/uploads"));

const JWT_SECRET = process.env.JWT_SECRET;
const PORT = process.env.PORT || 10000;

app.get("/", (req, res) => {
  res.sendFile(path.join(rootPath, "index", "index.html"));
});

app.get("/api/products", async (req, res) => {
  try {
    const categorySlug = req.query.type;

    if (!categorySlug) {
      if (typeof categorySlug !== "string" || !categorySlug.trim()) {
        return res.status(400).json({ message: "Некорректная категория" });
      }
      return res.status(400).json({ message: "Категория не указана" });
    }

    const authorization = req.headers["authorization"];

    if (!authorization) {
      return res.status(401).json({ message: "Нет токена" });
    }
    const token = authorization.split(" ")[1];

    if (!token || token === "null") {
      const [rows] = await db.query(
        "SELECT products.id, products.title, products.price, products.photo, products.stock, products.unit FROM products JOIN categories ON products.category_id = categories.id WHERE categories.slug = ? LIMIT 100",
        [categorySlug],
      );
      return res.status(200).json(rows);
    }

    const decoded = jwt.verify(token, JWT_SECRET);

    const sql = `SELECT products.id, products.title, products.price, products.photo, products.stock, products.unit,
    IF(favorites.id IS NOT NULL, 1, 0) AS isFavorite
      FROM products       
      LEFT JOIN favorites ON products.id = favorites.product_id AND favorites.user_id = ?
      JOIN categories ON products.category_id = categories.id      
      WHERE categories.slug = ?
      LIMIT 100
    `;

    const [rows] = await db.query(sql, [decoded.id, categorySlug]);
    res.status(200).json(rows);
  } catch (error) {
    console.log(error);

    if (error.name === "TokenExpiredError") {
      return res.status(401).json({ message: "Токен просрочен" });
    }
    if (error.name === "JsonWebTokenError") {
      return res.status(401).json({ message: "token invalid" });
    }
    res.status(500).json({ message: `Ошибка сервера` });
  }
});

app.post("/register", async (req, res) => {
  try {
    const { login, username, password, confirmPassword } = req.body;
    if (
      typeof login !== "string" ||
      typeof username !== "string" ||
      typeof password !== "string" ||
      typeof confirmPassword !== "string"
    ) {
      return res.status(400).json({
        message: `Некорректный тип данных в строке`,
      });
    }

    if (password.length < 8 || password.length > 30) {
      return res
        .status(400)
        .json({ message: "Некоррктное количество символов" });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({ message: "Пароли не совпадают" });
    }

    const cleanLogin = req.body.login?.trim();
    const cleanUsername = req.body.username?.trim();

    if (cleanLogin.length < 3 || cleanLogin.length > 30) {
      return res
        .status(400)
        .json({ message: "Некорректное количество символов в логине" });
    }

    if (cleanUsername.length < 3 || cleanUsername.length > 30) {
      return res
        .status(400)
        .json({ message: "Некорректное количество символов в имени" });
    }

    const [rows] = await db.query(
      "SELECT id FROM users WHERE login = ? OR username = ?",
      [cleanLogin, cleanUsername],
    );

    if (rows.length > 0) {
      return res.status(400).json({ message: "Это имя или логин уже заняты" });
    }
    const hashedPassword = await bcrypt.hash(password, 10);

    const sql =
      "INSERT INTO users (username, login, password_hash) VALUES (?, ?, ?)";
    await db.query(sql, [cleanUsername, cleanLogin, hashedPassword]);

    return res.status(201).json({ message: "Пользователь зарегистрирован" });
  } catch (error) {
    console.error(error.message);

    if (error.name === "TokenExpiredError") {
      return res.status(401).json({ message: "Токен просрочен" });
    }
    if (error.name === "JsonWebTokenError") {
      return res.status(401).json({ message: "token invalid" });
    }
    res.status(500).json({ message: `Ошибка сервера` });
  }
});

app.post("/api/login", async (req, res) => {
  try {
    const { login, password } = req.body;
    if (typeof login !== "string" || typeof password !== "string") {
      return res.status(400).json({
        message: `Некорректный тип данных в строке`,
      });
    }

    const cleanLogin = req.body.login?.trim();

    if (cleanLogin.length < 3 || cleanLogin.length > 30) {
      return res
        .status(400)
        .json({ message: "Некорректное количество символов в логине" });
    }

    const [rows] = await db.query(
      "SELECT id, password_hash FROM users WHERE login = ? OR username = ?",
      [cleanLogin, cleanLogin],
    );
    const user = rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ message: "Неверный логин или пароль" });
    }

    const token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: "24h" });
    return res.status(200).json({ token });
  } catch (error) {
    console.error(error.message);
    if (error.name === "TokenExpiredError") {
      return res.status(401).json({ message: "Токен просрочен" });
    }
    if (error.name === "JsonWebTokenError") {
      return res.status(401).json({ message: "token invalid" });
    }
    res.status(500).json({ message: `Ошибка сервера` });
  }
});

app.get("/api/avatar", async (req, res) => {
  try {
    const authorization = req.headers["authorization"];
    if (!authorization) {
      return res.status(401).json({ message: "Нет токена" });
    }
    const token = authorization.split(" ")[1];

    if (!token || token === "null") {
      return res.status(401).json({ message: "Токен отсутствует" });
    }

    const decoded = jwt.verify(token, JWT_SECRET);

    const [rows] = await db.query("SELECT photo FROM users WHERE id = ?", [
      decoded.id,
    ]);
    if (!rows || rows.length === 0) {
      return res.status(404).json({ message: "Пользователь не найден" });
    }

    const { photo } = rows[0];

    return res.status(200).json({
      photo,
    });
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      return res.status(401).json({ message: "Токен просрочен" });
    }
    if (error.name === "JsonWebTokenError") {
      return res.status(401).json({ message: "token invalid" });
    }

    return res.status(500).json({ message: `Ошибка сервера` });
  }
});

app.get("/api/profile", async (req, res) => {
  try {
    const authorization = req.headers["authorization"];
    if (!authorization) {
      return res.status(401).json({ message: "Нет токена" });
    }
    const token = authorization.split(" ")[1];

    if (!token || token === "null") {
      return res.status(401).json({ message: "Токен отсутствует" });
    }

    const decoded = jwt.verify(token, JWT_SECRET);

    const [rows] = await db.query(
      "SELECT photo, username,surname, gmail, number FROM users WHERE id = ?",
      [decoded.id],
    );
    if (!rows || rows.length === 0) {
      return res.status(404).json({ message: "Пользователь не найден" });
    }

    const { photo, username, surname, number, gmail: fullGmail } = rows[0];

    let gmail = "";
    let domen = "gmail.com";
    if (fullGmail && fullGmail.includes("@")) {
      const parts = fullGmail.split("@");
      gmail = parts[0];
      domen = parts[1];
    }
    return res.status(200).json({
      photo,
      name: username,
      surname,
      gmail,
      domen,
      number,
    });
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      return res.status(401).json({ message: "Токен просрочен" });
    }
    if (error.name === "JsonWebTokenError") {
      return res.status(401).json({ message: "token invalid" });
    }

    return res.status(500).json({ message: `Ошибка сервера` });
  }
});

app.post("/api/photoLoad", upload.single("photo"), async (req, res) => {
  try {
    const authorization = req.headers["authorization"];
    if (!authorization) {
      return res.status(401).json({ message: "Нет токена" });
    }
    const token = authorization.split(" ")[1];

    if (!token || token === "null") {
      if (req.file) fs.unlinkSync(req.file.path);
      return res.status(401).json({ message: "Нет токена" });
    }

    const decoded = jwt.verify(token, JWT_SECRET);

    if (!req.file) {
      return res.status(400).json({ message: "файл не загружен на сервер" });
    }

    const [userRows] = await db.query("SELECT photo FROM users WHERE id = ?", [
      decoded.id,
    ]);
    const oldPhoto = userRows[0]?.photo;

    const photoPathForDb = `${req.file.filename}`;

    const [rows] = await db.query("UPDATE users SET photo = ? WHERE id = ?", [
      photoPathForDb,
      decoded.id,
    ]);

    if (rows.affectedRows === 0) {
      if (req.file) fs.unlinkSync(req.file.path);
      return res.status(404).json({ message: "Пользователь не найден" });
    }

    if (oldPhoto && oldPhoto !== "default_avatar.png") {
      const oldPath = path.join(__dirname, "/images/uploads", oldPhoto);
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
    }
    return res.status(200).json({ message: "Фото обновлено" });
  } catch (error) {
    if (req.file) {
      fs.unlinkSync(req.file.path);
    }

    if (error.message === "Можно загружать только изображения!") {
      return res.status(400).json({ message: error.message });
    }

    if (error.name === "JsonWebTokenError") {
      return res.status(401).json({ message: "Невалидный токен" });
    }
    console.error(error.message);
    return res.status(500).json({ message: `Ошибка сервера` });
  }
});

app.post("/api/saveData", async (req, res) => {
  try {
    if (!req.body || Object.keys(req.body).length === 0) {
      return res.status(400).json({ message: "Данные не переданы" });
    }

    const { name, surname, gmail, number, selectSelected } = req.body;
    const authorization = req.headers["authorization"];
    if (!authorization) {
      return res.status(401).json({ message: "Нет токена" });
    }

    if (
      typeof name !== "string" ||
      typeof surname !== "string" ||
      typeof number !== "string" ||
      typeof gmail !== "string" ||
      typeof selectSelected !== "string"
    ) {
      return res.status(400).json({ message: "Некорректный формат данных" });
    }

    //const regex

    const token = authorization.split(" ")[1];

    if (!token || token === "null") {
      return res.status(401).json({ message: "Токен отсутствует" });
    }

    const decoded = jwt.verify(token, JWT_SECRET);

    const cleanName = name.trim();
    const cleanGmail = gmail.trim().split("@")[0]; // Берем только часть до @, на случай ошибки
    const fullEmail = `${cleanGmail}@${selectSelected.trim()}`;

    if (cleanName.length < 2) {
      return res.status(400).json({ message: "Имя слишком короткое" });
    }

    const [rows] = await db.query(
      "UPDATE users SET username = ?, surname = ?, number = ?, gmail = ? WHERE id = ?",
      [cleanName, surname?.trim(), number?.trim(), fullEmail, decoded.id],
    );

    if (rows.affectedRows === 0) {
      return res.status(404).json({ message: "Пользователь не найден" });
    } else {
      return res.status(200).json({ message: "Данные успешно обновлены" });
    }
  } catch (error) {
    console.error(error);

    if (error.name === "TokenExpiredError") {
      return res.status(401).json({ message: "Токен просрочен" });
    }
    if (error.name === "JsonWebTokenError") {
      return res.status(401).json({ message: "token invalid" });
    }

    return res.status(500).json({ message: `Ошибка сервера` });
  }
});

app.post("/api/addToCart", async (req, res) => {
  try {
    const { productId } = req.body;

    if (!productId || isNaN(productId)) {
      return res.status(400).json({ message: "Некорректный ID продукта" });
    }

    const authorization = req.headers["authorization"];
    if (!authorization) {
      return res.status(400).json({
        message: "Нет токена",
      });
    }

    const token = authorization.split(" ")[1];
    if (!token || token === "null") {
      return res.status(400).json({ message: "Пользователь не найден" });
    }

    const decoded = jwt.verify(token, JWT_SECRET);

    const [products] = await db.query(
      "SELECT stock, unit FROM products WHERE id = ?",
      [productId],
    );

    if (products.length === 0) {
      return res.status(404).json({ message: "Товар не найден" });
    }

    const product = products[0];

    const [cartItem] = await db.query(
      "SELECT quantity FROM cart WHERE user_id = ? AND product_id = ?",
      [decoded.id, productId],
    );

    const currentQuantity = cartItem[0]?.quantity || 0;

    const addQuantity = product.unit === "кг." ? 0.05 : 1;

    if (currentQuantity + addQuantity > product.stock) {
      return res.status(400).json({ message: "Больше товара нет в наличии" });
    }
    if (currentQuantity > 0) {
      const [cartRows] = await db.query(
        "UPDATE cart SET quantity = quantity + ? WHERE user_id = ? AND product_id = ? ",
        [addQuantity, decoded.id, productId],
      );

      if (cartRows.affectedRows === 0) {
        return res
          .status(400)
          .json({ message: "Не удалось добавить товар в корзину" });
      }
      const [newQuantity] = await db.query(
        "SELECT quantity FROM cart WHERE user_id = ? AND product_id = ?",
        [decoded.id, productId],
      );
      if (newQuantity.length === 0) {
        return res.status(404).json({ message: "Товар не найден" });
      }
      return res.status(201).json({
        message: "Количество товаров в корзине увеличено",
        quantity: newQuantity[0].quantity,
      });
    } else {
      const result = await db.query(
        "INSERT INTO cart(product_id, user_id, quantity) VALUES(?,?,?)",
        [productId, decoded.id, addQuantity],
      );
    }
    return res.status(200).json({ message: "Товар добавлен в корзину" });
  } catch (error) {
    console.error(error);

    if (error.name === "TokenExpiredError") {
      return res.status(401).json({ message: "Токен просрочен" });
    }
    if (error.name === "JsonWebTokenError") {
      return res.status(401).json({ message: "token invalid" });
    }
    res.status(500).json({ message: `Ошибка сервера` });
  }
});

app.get("/api/loadCart", async (req, res) => {
  try {
    const authorization = req.headers["authorization"];
    if (!authorization) {
      return res.status(400).json({
        message: "Нет токена",
      });
    }

    const token = authorization.split(" ")[1];
    if (!token || token === "null") {
      return res.status(401).json({ message: "Пользователь не найден" });
    }

    const decoded = jwt.verify(token, JWT_SECRET);

    const [rows] = await db.query(
      "SELECT products.photo, products.title, products.price, products.stock, products.unit, products.id AS products_id, cart.user_id, cart.quantity FROM products JOIN cart ON products.id = cart.product_id WHERE cart.user_id = ?",
      [decoded.id],
    );

    if (rows.length === 0) {
      return res.status(200).json({ message: "Корзина пуста" });
    } else {
      return res.status(200).json(rows);
    }
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      return res.status(401).json({ message: "Токен просрочен" });
    }
    if (error.name === "JsonWebTokenError") {
      return res.status(401).json({ message: "token invalid" });
    }
    res.status(500).json({ message: `Ошибка сервера` });
  }
});

app.delete("/api/delete", async (req, res) => {
  try {
    const { itemId } = req.body;
    if (!itemId) {
      return res
        .status(400)
        .json({ message: `Сервер не получил идентификатор товара` });
    }

    const authorization = req.headers["authorization"];
    if (!authorization) {
      return res.status(401).json({
        message: "Нет токена",
      });
    }

    const token = authorization.split(" ")[1];
    if (!token || token === "null") {
      return res.status(401).json({ message: "Пользователь не найден" });
    }

    const decoded = jwt.verify(token, JWT_SECRET);

    const [rows] = await db.query(
      "DELETE FROM cart WHERE product_id = ? AND user_id = ?",
      [itemId, decoded.id],
    );

    if (rows.affectedRows === 0) {
      return res
        .status(404)
        .json({ message: "Товары для удаления не найдены" });
    } else {
      return res
        .status(200)
        .json({ message: "Товар успешно удален из корзины" });
    }
  } catch (error) {
    console.log(error);

    if (error.name === "TokenExpiredError") {
      return res.status(401).json({ message: "Токен просрочен" });
    }
    if (error.name === "JsonWebTokenError") {
      return res.status(401).json({ message: "token invalid" });
    }
    return res.status(500).json({ message: `Ошибка сервера` });
  }
});

app.post("/api/changeQuantity", async (req, res) => {
  try {
    const { itemId, number } = req.body;
    if (!itemId || typeof number !== "number") {
      return res.status(400).json({ message: "Некорректные данные" });
    }
    const authorization = req.headers["authorization"];
    if (!authorization) {
      return res.status(400).json({ message: "Нет токена" });
    }
    const token = authorization.split(" ")[1];

    if (!token || token === "null") {
      return res.status(400).json({ message: "Токен отсутствует" });
    }

    const decoded = jwt.verify(token, JWT_SECRET);

    const [products] = await db.query(
      "SELECT stock, unit FROM products WHERE id = ?",
      [itemId],
    );

    if (!products || products.length === 0) {
      return res.status(404).json({ message: "Продукт не найден" });
    }

    const product = products[0];

    if (product.unit === "шт." && !Number.isInteger(number)) {
      return res
        .status(400)
        .json({ message: "Для штук допустимы только целые числа" });
    }

    if (number > 0 && number <= product.stock) {
      const [rows] = await db.query(
        "UPDATE cart SET quantity = ? WHERE user_id = ? AND product_id = ?",
        [number, decoded.id, itemId],
      );
      if (rows.affectedRows === 0) {
        return res.status(400).json({ message: `Товар не найден` });
      } else {
        return res
          .status(200)
          .json({ message: "Количество товара было успешно обновлено" });
      }
    } else {
      return res.status(400).json({ message: "Больше нет на складе " });
    }
  } catch (error) {
    console.error(error);
    if (error.name === "TokenExpiredError") {
      return res.status(401).json({ message: "Токен просрочен" });
    }
    if (error.name === "JsonWebTokenError") {
      return res.status(401).json({ message: "token invalid" });
    }
    return res.status(500).json({ message: `Ошибка сервера` });
  }
});

app.post("/api/fillOrder", async (req, res) => {
  const connection = await db.getConnection();
  try {
    const authorization = req.headers["authorization"];
    if (!authorization) {
      return res.status(401).json({ message: "Нет токена" });
    }
    const token = authorization.split(" ")[1];

    if (!token || token === "null") {
      return res.status(401).json({ message: "Токен отсутствует" });
    }

    const decoded = jwt.verify(token, JWT_SECRET);

    const [total] = await connection.query(
      "SELECT SUM(products.price * cart.quantity) OVER() AS total_price FROM cart JOIN products ON cart.product_id = products.id WHERE cart.user_id = ?",
      [decoded.id],
    );

    if (!total || total.length === 0) {
      return res.status(404).json({ message: "Товары не найдены" });
    }

    const totalPrice = total[0]?.total_price || 0;

    const [rows] = await connection.query(
      "INSERT INTO orders(user_id, total_price) VALUES (?,?)",
      [decoded.id, totalPrice],
    );

    if (rows.affectedRows === 0) {
      return res.status(400).json({ message: "Не удалось создать заказ" });
    }

    const orderId = rows.insertId;

    const [orders] = await connection.query(
      "SELECT cart.product_id, cart.quantity, products.price FROM cart JOIN products ON cart.product_id = products.id WHERE cart.user_id = ?",
      [decoded.id],
    );

    for (const item of orders) {
      await connection.query(
        "INSERT INTO order_items(order_id, product_id, quantity, price_at_purchase) VALUES (?,?,?,?)",
        [orderId, item.product_id, item.quantity, item.price],
      );
      const [updateResult] = await connection.query(
        "UPDATE products SET stock = stock - ? WHERE id = ? AND stock >= ?",
        [item.quantity, item.product_id, item.quantity],
      );

      if (updateResult.affectedRows === 0) {
        return res.status(
          `Извините, товар ${item.product_id} закончился, пока вы оформляли заказ`,
        );
      }
    }

    await connection.query("DELETE FROM cart WHERE user_id = ?", [decoded.id]);

    return res
      .status(201)
      .json({ message: "Строки добавлены в таблицу заказов" });
  } catch (error) {
    await connection.rollback();

    if (error.name === "TokenExpiredError") {
      return res.status(401).json({ message: "Токен просрочен" });
    }
    if (error.name === "JsonWebTokenError") {
      return res.status(401).json({ message: "token invalid" });
    }

    if (error.message.includes("закончился, пока вы оформляли заказ")) {
      return res.status(400).json({ message: error.message });
    }

    console.error(error);
    return res.status(500).json({ message: "Ошибка при оформлении заказа" });
  }
});

app.get("/api/getOrderData", async (req, res) => {
  try {
    const authorization = req.headers["authorization"];
    if (!authorization) {
      return res.status(401).json({ message: "Нет токена" });
    }
    const token = authorization.split(" ")[1];

    if (!token || token === "null") {
      return res.status(401).json({ message: "Токен отсутствует" });
    }

    const decoded = jwt.verify(token, JWT_SECRET);

    const [rows] = await db.query(
      "SELECT id, total_price, created_at AS order_date FROM orders WHERE user_id = ? ORDER BY created_at DESC LIMIT 1",
      [decoded.id],
    );

    if (!rows || rows.length === 0) {
      return res
        .status(400)
        .json({ message: "Не удалось найти данные заказа" });
    }

    const result = rows[0];

    const rawDate = result.order_date;
    const date = new Date(rawDate);

    const formatted = new Intl.DateTimeFormat("ru-RU", {
      day: "2-digit",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);

    return res.status(200).json({
      id: result.id,
      total_price: result.total_price,
      date: formatted,
    });
  } catch (error) {
    console.error(error);
    if (error.name === "TokenExpiredError") {
      return res.status(401).json({ message: "Токен просрочен" });
    }
    if (error.name === "JsonWebTokenError") {
      return res.status(401).json({ message: "token invalid" });
    }
    return res.status(500).json({ message: "Ошибка сервера" });
  }
});

app.post("/api/setFavorite", async (req, res) => {
  try {
    const { productId } = req.body;

    if (!productId || isNaN(productId)) {
      return res.status(400).json({ message: "Некорректный ID продукта" });
    }

    const authorization = req.headers["authorization"];
    if (!authorization) {
      return res.status(400).json({
        message: "Нет токена",
      });
    }

    const token = authorization.split(" ")[1];
    if (!token || token === "null") {
      return res.status(400).json({ message: "Пользователь не найден" });
    }

    const decoded = jwt.verify(token, JWT_SECRET);

    const [existing] = await db.query(
      "SELECT id FROM favorites WHERE user_id = ? AND product_id = ?",
      [decoded.id, productId],
    );

    if (existing.length > 0) {
      const [rows] = await db.query("DELETE FROM favorites WHERE id = ?", [
        existing[0]?.id,
      ]);
      return res.status(201).json({
        message: "Товар успешно удален из избранных",
        isFavorite: false,
      });
    }

    const [rows] = await db.query(
      "INSERT INTO favorites(user_id, product_id) VALUES(?,?)",
      [decoded.id, productId],
    );

    if (rows.affectedRows === 0) {
      return res
        .status(400)
        .json({ message: "Не удалось добавить товар в избранное" });
    }

    return res
      .status(201)
      .json({ message: "Товар добавлен в избранное", isFavorite: true });
  } catch (error) {
    console.error(error);
    if (error.name === "TokenExpiredError") {
      return res.status(401).json({ message: "Токен просрочен" });
    }
    if (error.name === "JsonWebTokenError") {
      return res.status(401).json({ message: "token invalid" });
    }
    res.status(500).json({ message: `Ошибка сервера` });
  }
});

app.get("/api/getFavorite", async (req, res) => {
  try {
    const authorization = req.headers["authorization"];
    if (!authorization) {
      return res.status(400).json({
        message: "Нет токена",
      });
    }

    const token = authorization.split(" ")[1];
    if (!token || token === "null") {
      return res.status(400).json({ message: "Пользователь не найден" });
    }

    const decoded = jwt.verify(token, JWT_SECRET);

    const [rows] = await db.query(
      "SELECT products.id, products.title,products.price, products.photo, products.stock, products.unit, IF(favorites.id IS NOT NULL, 1, 0) AS isFavorite FROM favorites JOIN products ON favorites.product_id = products.id WHERE favorites.user_id = ? LIMIT 100",
      [decoded.id],
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "Товары не найдены" });
    }

    return res.status(200).json(rows);
  } catch (error) {
    console.error(error);
    if (error.name === "TokenExpiredError") {
      return res.status(401).json({ message: "Токен просрочен" });
    }
    if (error.name === "JsonWebTokenError") {
      return res.status(401).json({ message: "token invalid" });
    }
    return res.status(500).json({ message: `Ошибка сервера` });
  }
});

app.listen(PORT, () => {
  console.log(`Сервер работает на http://localhost:${PORT}`);
});
