// frontend/src/components/auth/AdminRoute.tsx
import { Navigate, Outlet } from "react-router";
import { useAuthStore } from "@/stores/useAuthStore";

// Dùng lồng bên trong ProtectedRoute (đã đảm bảo đăng nhập), chỉ check thêm role:
// <Route element={<ProtectedRoute />}>
//   <Route element={<AdminRoute />}>
//     <Route path="/admin" element={<AdminDashboardPage />} />
//   </Route>
// </Route>
export default function AdminRoute() {
  const { user } = useAuthStore();

  if (user?.role !== "admin") {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}
