require("dotenv").config();

const express = require("express");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const mysql = require("mysql2/promise");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(
  session({
    secret: process.env.SESSION_SECRET || "local-development-secret-change-me",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 8 * 60 * 60 * 1000
    }
  })
);

app.use(express.static(path.join(__dirname, "public")));

let pool;

async function initializeDatabase() {
  const config = {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "student_management",
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: true } : undefined
  };

  if (!config.host || !config.user) {
    throw new Error("Database configuration is missing. Set DB_HOST and DB_USER in .env.");
  }

  pool = mysql.createPool(config);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS admins (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      email VARCHAR(190) NOT NULL UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS students (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(120) NOT NULL,
      roll_number VARCHAR(50) NOT NULL UNIQUE,
      email VARCHAR(190),
      phone VARCHAR(30),
      department VARCHAR(80) NOT NULL,
      year VARCHAR(20),
      gender VARCHAR(30),
      section VARCHAR(20),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const adminEmail = (process.env.ADMIN_EMAIL || "admin@example.com").trim().toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD || "ChangeThisPassword123!";
  const adminName = process.env.ADMIN_NAME || "Admin";
  const [admins] = await pool.execute("SELECT id FROM admins WHERE email = ?", [adminEmail]);

  if (admins.length === 0) {
    const passwordHash = await bcrypt.hash(adminPassword, 12);
    await pool.execute(
      "INSERT INTO admins (name, email, password_hash) VALUES (?, ?, ?)",
      [adminName, adminEmail, passwordHash]
    );
    console.log(`Initial admin created: ${adminEmail}`);
    console.log("Change ADMIN_PASSWORD before deploying publicly.");
  }
}

function requireAuth(req, res, next) {
  if (!req.session.adminId) {
    return res.status(401).json({ message: "Please log in first." });
  }
  next();
}


app.post("/api/login", async (req, res) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");

    if (!email || !password) {
      return res.status(400).json({
        message: "Email and password are required."
      });
    }

    const [rows] = await pool.execute(
      "SELECT id, name, email, password_hash FROM admins WHERE email = ?",
      [email]
    );

    const admin = rows[0];

    if (!admin) {
      return res.status(401).json({
        message: "Invalid email or password."
      });
    }

    let validPassword = false;

    try {
      validPassword = await bcrypt.compare(
        password,
        admin.password_hash
      );
    } catch (error) {
      validPassword = false;
    }

    if (!validPassword && admin.password_hash === password) {
      validPassword = true;

      const newPasswordHash = await bcrypt.hash(password, 12);

      await pool.execute(
        "UPDATE admins SET password_hash = ? WHERE id = ?",
        [newPasswordHash, admin.id]
      );
    }

    if (!validPassword) {
      return res.status(401).json({
        message: "Invalid email or password."
      });
    }

    req.session.adminId = admin.id;
    req.session.adminName = admin.name;

    res.json({
      message: "Login successful.",
      admin: {
        name: admin.name,
        email: admin.email
      }
    });

  } catch (error) {
    console.error("Login error:", error);

    res.status(500).json({
      message: "Could not log in."
    });
  }
});


app.get("/api/me", (req, res) => {
  if (!req.session.adminId) return res.status(401).json({ message: "Not logged in." });
  res.json({ admin: { name: req.session.adminName } });
});

app.post("/api/logout", (req, res) => {
  req.session.destroy((error) => {
    if (error) return res.status(500).json({ message: "Could not log out." });
    res.clearCookie("connect.sid");
    res.json({ message: "Logged out successfully." });
  });
});

app.get("/api/dashboard", requireAuth, async (req, res) => {
  try {
    const [totalRows] = await pool.query("SELECT COUNT(*) AS total FROM students");
    const [departmentRows] = await pool.query(
      "SELECT department, COUNT(*) AS count FROM students GROUP BY department ORDER BY department"
    );
    res.json({ total: totalRows[0].total, departments: departmentRows });
  } catch (error) {
    console.error("Dashboard error:", error);
    res.status(500).json({ message: "Could not load dashboard." });
  }
});

app.get("/api/students", requireAuth, async (req, res) => {
  try {
    const department = String(req.query.department || "").trim();
    const search = String(req.query.search || "").trim();
    let sql = "SELECT * FROM students WHERE 1 = 1";
    const params = [];

    if (department && department !== "all") {
      sql += " AND department = ?";
      params.push(department);
    }
    if (search) {
      sql += " AND (name LIKE ? OR roll_number LIKE ? OR email LIKE ?)";
      const term = `%${search}%`;
      params.push(term, term, term);
    }
    sql += " ORDER BY name";
    const [rows] = await pool.execute(sql, params);
    res.json(rows);
  } catch (error) {
    console.error("Student list error:", error);
    res.status(500).json({ message: "Could not load students." });
  }
});

app.post("/api/students", requireAuth, async (req, res) => {
  try {
    const student = readStudent(req.body);
    if (!student.name || !student.roll_number || !student.department) {
      return res.status(400).json({ message: "Name, roll number, and department are required." });
    }
    const [result] = await pool.execute(
      `INSERT INTO students
       (name, roll_number, email, phone, department, year, gender, section)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        student.name, student.roll_number, student.email, student.phone,
        student.department, student.year, student.gender, student.section
      ]
    );
    res.status(201).json({ message: "Student added successfully.", id: result.insertId });
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ message: "That roll number already exists." });
    }
    console.error("Add student error:", error);
    res.status(500).json({ message: "Could not add student." });
  }
});

app.put("/api/students/:id", requireAuth, async (req, res) => {
  try {
    const student = readStudent(req.body);
    if (!student.name || !student.roll_number || !student.department) {
      return res.status(400).json({ message: "Name, roll number, and department are required." });
    }
    const [result] = await pool.execute(
      `UPDATE students SET name=?, roll_number=?, email=?, phone=?, department=?,
       year=?, gender=?, section=? WHERE id=?`,
      [
        student.name, student.roll_number, student.email, student.phone,
        student.department, student.year, student.gender, student.section,
        Number(req.params.id)
      ]
    );
    if (!result.affectedRows) return res.status(404).json({ message: "Student not found." });
    res.json({ message: "Student updated successfully." });
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ message: "That roll number already exists." });
    }
    console.error("Update student error:", error);
    res.status(500).json({ message: "Could not update student." });
  }
});

app.delete("/api/students/:id", requireAuth, async (req, res) => {
  try {
    const [result] = await pool.execute("DELETE FROM students WHERE id = ?", [Number(req.params.id)]);
    if (!result.affectedRows) return res.status(404).json({ message: "Student not found." });
    res.json({ message: "Student deleted successfully." });
  } catch (error) {
    console.error("Delete student error:", error);
    res.status(500).json({ message: "Could not delete student." });
  }
});

function readStudent(body) {
  const clean = (value) => String(value || "").trim();
  return {
    name: clean(body.name),
    roll_number: clean(body.roll_number),
    email: clean(body.email),
    phone: clean(body.phone),
    department: clean(body.department),
    year: clean(body.year),
    gender: clean(body.gender),
    section: clean(body.section)
  };
}

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

initializeDatabase()
  .then(() => {
    app.listen(PORT, () => console.log(`Student Management System running on port ${PORT}`));
  })
  .catch((error) => {
    console.error("Database startup failed:", error.message);
    process.exit(1);
  });
