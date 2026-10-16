import { Navigate, createBrowserRouter } from "react-router";
import { Layout } from "./components/Layout";
import { Login } from "./components/Login";
import { Register } from "./components/Register";
import { Home } from "./components/Home";
import { GISHazardMap } from "./components/GISHazardMap";
import { Alerts } from "./components/Alerts";
import { CommunityReports } from "./components/CommunityReports";
import { MDRRMOAdminDashboard } from "./components/MDRRMOAdminDashboard";
import { BarangayAdminDashboard } from "./components/BarangayAdminDashboard";
import { Profile } from "./components/Profile";
import { QuickReport } from "./components/QuickReport";
import { LegalPage } from "./components/LegalPage";
import { MDRRMOSettings } from "./components/settings/MDRRMOSettings";
import { ProtectedRoute, PublicOnlyRoute, RoleHomeRedirect, WelcomeRoute } from "./components/ProtectedRoute";
import { Welcome } from "./components/Welcome";
import { RESIDENT_ONLY, ROUTE_ROLES } from "../lib/auth";

export const router = createBrowserRouter([
  {
    // Public Welcome page; signed-in users go straight to their role's home.
    path: "/",
    element: <WelcomeRoute><Welcome /></WelcomeRoute>,
  },
  {
    path: "/login",
    element: <PublicOnlyRoute><Login /></PublicOnlyRoute>,
  },
  {
    path: "/register",
    element: <PublicOnlyRoute><Register /></PublicOnlyRoute>,
  },
  {
    // Public: anyone may report, signed in or not (limits are enforced by the quick-report function).
    path: "/quick-report",
    element: <QuickReport />,
  },
  {
    // Public, signed in or not.
    path: "/terms",
    element: <LegalPage doc="terms" />,
  },
  {
    path: "/privacy",
    element: <LegalPage doc="privacy" />,
  },
  {
    // The old role picker; the role now comes from profiles, so go to the user's own dashboard.
    path: "/admin",
    element: <RoleHomeRedirect />,
  },
  {
    // Residents and barangay admins; MDRRMO is redirected to its dashboard.
    path: "/profile",
    element: <ProtectedRoute allowedRoles={ROUTE_ROLES["/profile"]}><Profile /></ProtectedRoute>,
  },
  {
    path: "/admin/mdrrmo",
    element: <ProtectedRoute allowedRoles={ROUTE_ROLES["/admin/mdrrmo"]}><MDRRMOAdminDashboard /></ProtectedRoute>,
  },
  {
    path: "/admin/mdrrmo/settings",
    element: <ProtectedRoute allowedRoles={ROUTE_ROLES["/admin/mdrrmo/settings"]}><MDRRMOSettings /></ProtectedRoute>,
  },
  {
    path: "/admin/barangay",
    element: <ProtectedRoute allowedRoles={ROUTE_ROLES["/admin/barangay"]}><BarangayAdminDashboard /></ProtectedRoute>,
  },
  {
    // Resident pages (Home, Map, Alerts, Community Reports incl. the submit form).
    element: <ProtectedRoute allowedRoles={RESIDENT_ONLY}><Layout /></ProtectedRoute>,
    children: [
      { path: "/home", element: <Home /> },
      { path: "/map", element: <GISHazardMap /> },
      { path: "/alerts", element: <Alerts /> },
      { path: "/reports", element: <CommunityReports /> },
    ],
  },
  {
    // Unknown URLs: "/" (Welcome when signed out, the role's home when signed in).
    path: "*",
    element: <Navigate to="/" replace />,
  },
]);
