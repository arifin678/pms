import { useEffect } from "react";
import { jwtDecode } from "jwt-decode";

const useAuthCheck = () => {
  useEffect(() => {
    const token = localStorage.getItem("token");

    if (!token) {
      localStorage.clear();
      window.location.href = "/login";
      return;
    }

    try {
      const decoded = jwtDecode(token);
      const exp = decoded.exp * 1000;

      if (Date.now() >= exp) {
        // Token expired
        localStorage.clear(); // 🔥 hapus semua data user
        window.location.href = "/login";
      }
    } catch (err) {
      console.error("JWT Decode error:", err);
      localStorage.clear(); // 🔥 hapus semua data user
      window.location.href = "/login";
    }
  }, []);
};

export default useAuthCheck;
