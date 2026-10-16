import { useNavigate } from "react-router";
import { Shield, Users, Building2, ArrowLeft } from "lucide-react";

export function AdminSelection() {
  const navigate = useNavigate();

  const adminTypes = [
    {
      id: "mdrrmo",
      title: "MDRRMO Admin",
      description: "Municipal Disaster Risk Reduction & Management Office",
      icon: Shield,
      color: "bg-blue-600",
      hoverColor: "hover:bg-blue-700",
      pastel: "var(--lavender)",
      pastelIcon: "var(--lavender-icon)",
      path: "/admin/mdrrmo",
      features: [
        "System-wide oversight",
        "Verify barangay alerts",
        "Verify community reports",
        "View all barangays",
        "System analytics",
      ],
    },
    {
      id: "barangay",
      title: "Barangay Admin",
      description: "Barangay Official Dashboard",
      icon: Building2,
      color: "bg-green-600",
      hoverColor: "hover:bg-green-700",
      pastel: "var(--mint)",
      pastelIcon: "var(--mint-icon)",
      path: "/admin/barangay",
      features: [
        "Create alerts for barangay",
        "View barangay reports",
        "Monitor flood status",
        "Barangay statistics",
        "Alert history",
      ],
    },
  ];

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="w-full max-w-4xl">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2 mb-4">
            <div className="clay w-12 h-12 rounded-full flex items-center justify-center" style={{ borderRadius: 9999, background: "var(--peach)" }}>
              <Users size={24} style={{ color: "var(--peach-icon)" }} />
            </div>
            <h1 className="text-3xl font-bold" style={{ color: "var(--text-primary)" }}>BAHAba Admin</h1>
          </div>
          <p className="text-gray-600">Select your admin role to continue</p>
        </div>

        {/* Admin Type Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          {adminTypes.map((admin) => {
            const Icon = admin.icon;
            return (
              <button
                key={admin.id}
                onClick={() => navigate(admin.path)}
                className="clay clay-press p-7 text-left"
              >
                <div className="flex items-start gap-4 mb-4">
                  <div className="p-4 rounded-full" style={{ background: admin.pastel }}>
                    <Icon size={32} style={{ color: admin.pastelIcon }} />
                  </div>
                  <div className="flex-1">
                    <h2 className="text-xl font-bold mb-1" style={{ color: "var(--text-primary)" }}>{admin.title}</h2>
                    <p className="text-sm text-gray-600">{admin.description}</p>
                  </div>
                </div>

                <div className="space-y-2 mb-6">
                  {admin.features.map((feature, index) => (
                    <div key={index} className="flex items-center gap-2 text-sm text-gray-700">
                      <div className={`w-1.5 h-1.5 rounded-full ${admin.color}`}></div>
                      {feature}
                    </div>
                  ))}
                </div>

                <div className="clay-btn clay-btn-primary w-full">
                  Access Dashboard →
                </div>
              </button>
            );
          })}
        </div>

        {/* Back Button */}
        <div className="text-center">
          <button
            onClick={() => navigate("/login")}
            className="min-h-12 px-3 text-gray-600 hover:text-gray-900 flex items-center gap-2 mx-auto transition-colors"
          >
            <ArrowLeft size={18} />
            <span className="text-sm">Back to Login</span>
          </button>
        </div>

        {/* Info Box */}
        <div className="mt-8 bg-white rounded-xl border p-6">
          <h3 className="text-sm font-bold mb-2" style={{ color: "var(--text-primary)" }}>Role Differences</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-gray-600">
            <div>
              <p className="font-semibold text-blue-600 mb-1">MDRRMO Admin</p>
              <p>Full system access with verification authority over all barangay alerts and community reports.</p>
            </div>
            <div>
              <p className="font-semibold text-green-600 mb-1">Barangay Admin</p>
              <p>Limited to managing a specific barangay. Alerts require MDRRMO verification before broadcast.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
