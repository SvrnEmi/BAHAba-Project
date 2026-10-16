import { Outlet, useLocation, Link } from "react-router";
import { Home, Map as MapIcon, Bell, Users } from "lucide-react";

export function Layout() {
  const location = useLocation();

  const navItems = [
    { path: "/home", label: "Home", icon: Home },
    { path: "/alerts", label: "Alerts", icon: Bell },
    { path: "/reports", label: "Reports", icon: Users },
    { path: "/map", label: "Map", icon: MapIcon },
  ];

  return (
    <div className="flex flex-col h-screen max-w-md mx-auto bg-background text-ink">
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>

      {/* Bottom Navigation: clay bar of 48px circles; selected sits in a pressed-in well. */}
      <nav aria-label="Main" className="px-[22px] pt-1 pb-[22px]">
        <div className="clay flex items-center justify-around px-2.5 py-2" style={{ borderRadius: 28 }}>
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                aria-label={item.label}
                title={item.label}
                aria-current={isActive ? "page" : undefined}
                className="clay-nav-item"
              >
                <Icon size={24} strokeWidth={2} aria-hidden="true" />
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
