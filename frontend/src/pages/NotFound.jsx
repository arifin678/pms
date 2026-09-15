// src/pages/NotFound.jsx
import { Link } from "react-router-dom";

const NotFound = () => {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-white text-gray-700 px-4">
      <h1 className="text-5xl font-bold mb-4">404</h1>
      <p className="text-lg mb-6">Halaman tidak ditemukan.</p>
      <Link
        to="/"
        className="px-4 py-2 bg-red-500 !text-white rounded hover:bg-red-600 transition"
      >
        Kembali ke Dashboard
      </Link>
    </div>
  );
};

export default NotFound;
