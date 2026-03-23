# 📚ShelfWise – Microservices E-Commerce Application

## 🚀 Overview

Handy Bookstore is a cloud-based e-commerce web application designed for buying books online.
The project follows a **microservices architecture**, where each service handles a specific functionality such as user management, books, cart, and payments.

This project demonstrates **backend development, API design, containerization and system design concepts**.

---

## 🧩 Architecture

The application is divided into multiple independent services:

* 👤 **User Service** – Handles user registration & authentication
* 📚 **Book Service** – Manages book catalog
* 🛒 **Cart Service** – Handles cart operations
* 💳 **Payment Service** – Simulates payment processing

Each service runs independently and communicates via APIs.

---

## 🛠️ Tech Stack

* **Backend:** Python (FastAPI)
* **Frontend:** React
* **Containerization:** Docker & Docker Compose
* **Database:**  MySQL 
* **API Testing:** Postman

---

## ⚙️ Setup Instructions

### 🔹 Prerequisites

Make sure you have installed:

* Docker
* Docker Compose
* Node.js (for frontend)

---

### 🔹 Run using Docker (Recommended)

```bash
docker compose up --build
```

This will:

* Build all services
* Start all containers
* Run the application on defined ports

---

### 🔹 Run manually (without Docker)

#### Backend (example for one service)

```bash
cd backend/user-service
uvicorn app:app --reload --port 8001
```

Repeat for other services with different ports.

#### Frontend

```bash
cd frontend
npm install
npm start
```

---

## 🌐 API Endpoints (Sample)

### 📚 Book Service

* `GET /books` → Get all books
* `POST /books` → Add a new book

### 👤 User Service

* `POST /register` → Register user
* `POST /login` → Login user

### 🛒 Cart Service

* `POST /cart/add` → Add item to cart
* `GET /cart` → View cart

---

## 🔐 Authentication

Basic authentication can be implemented using **JWT (JSON Web Tokens)** to secure user-specific routes like cart and payments.

---

## 💳 Payment Integration

Currently, the payment service is **simulated (mocked)** for demonstration purposes.
It can be extended to integrate real payment gateways like Stripe or Razorpay.

---

## 📸 Features

* 📚 Browse books by category
* ⭐ Ratings and reviews
* 🛒 Add to cart functionality
* ❤️ Wishlist support
* 🔐 User authentication (JWT-based)
* 💳 Payment service (mocked)

---

## 📦 Project Structure

```
handy_bookstore/
│
├── backend/
│   ├── user-service/
│   ├── book-service/
│   ├── cart-service/
│   ├── payment-service/
│
├── frontend/
│
├── docker-compose.yml
└── README.md
```

---

## 🌟 Future Improvements

* ✅ Real payment gateway integration
* ✅ Database integration for persistent storage
* ✅ Deployment on cloud (AWS / Render)
* ✅ API Gateway implementation
* ✅ Advanced recommendation system

---

## 👩‍💻 Author

Ayushi Srivastava

---

## ⭐ Contribute

Feel free to fork this repository and contribute!

---

## 📌 Note

This project is built for learning purposes and demonstrates microservices and cloud-based application design.
