# Student Management System

A fresh Student Management System built with Node.js, Express, MySQL, HTML, CSS, and JavaScript.

## Features
- Admin login/logout using session cookies
- Student CRUD (add, view, edit, delete)
- Department-wise filter
- Search by student name, roll number, or email
- Dashboard counts
- Responsive layout

## Requirements
- Node.js 18+
- MySQL 8+ (or compatible MySQL server)

## Local setup
1. Install Node.js and MySQL.
2. Create a MySQL database named `student_management` (or choose another name in `.env`).
3. Copy `.env.example` to `.env`.
4. Fill in your local MySQL host, user, password, database, and a strong `SESSION_SECRET`.
5. Install dependencies:
   ```bash
   npm install
   ```
6. Start:
   ```bash
   npm start
   ```
7. Open `http://localhost:3000`.

The initial admin account is created on startup from `ADMIN_EMAIL` and `ADMIN_PASSWORD` if that email is not already in the `admins` table. Change the default password before deploying.

## Deploying
Deploy the repository as a Render Web Service:
- Build command: `npm install`
- Start command: `npm start`
- Add environment variables from `.env.example` in Render.
- Use a separately hosted MySQL service and set its connection values in Render.
- Do not commit `.env`.

Render's web service filesystem is ephemeral; student data must be stored in a persistent external MySQL database.
