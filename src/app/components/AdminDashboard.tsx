import { useState } from "react";
import {
  Users,
  Bell,
  MapPin,
  Activity,
  Settings,
  AlertTriangle,
  CheckCircle,
  Send,
  Eye,
  Edit,
  Trash2,
  Download,
} from "lucide-react";

export function AdminDashboard() {
  const [activeTab, setActiveTab] = useState("overview");
  const [showNotification, setShowNotification] = useState(false);

  const stats = [
    {
      label: "Active Users",
      value: "1,234",
      change: "+12%",
      icon: Users,
      color: "bg-blue-500",
    },
    {
      label: "Alerts Sent",
      value: "89",
      change: "+5",
      icon: Bell,
      color: "bg-yellow-500",
    },
    {
      label: "Community Reports",
      value: "156",
      change: "+23",
      icon: MapPin,
      color: "bg-green-500",
    },
    {
      label: "System Status",
      value: "Online",
      change: "100%",
      icon: Activity,
      color: "bg-purple-500",
    },
  ];

  const recentAlerts = [
    {
      id: 1,
      type: "warning",
      title: "Flood Warning - Tuburan",
      sent: "15 mins ago",
      recipients: 543,
      status: "sent",
    },
    {
      id: 2,
      type: "alert",
      title: "Weather Update - All Barangays",
      sent: "2 hours ago",
      recipients: 1234,
      status: "sent",
    },
    {
      id: 3,
      type: "info",
      title: "System Maintenance Notice",
      sent: "Yesterday",
      recipients: 1234,
      status: "sent",
    },
  ];

  const pendingReports = [
    {
      id: 1,
      user: "Juan D.",
      location: "Barangay Tuburan",
      time: "10 mins ago",
      status: "pending",
    },
    {
      id: 2,
      user: "Maria S.",
      location: "Barangay Gabawan",
      time: "25 mins ago",
      status: "pending",
    },
    {
      id: 3,
      user: "Pedro L.",
      location: "Barangay Ligaya",
      time: "1 hour ago",
      status: "verified",
    },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-blue-600 text-white px-6 py-6 shadow-lg">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h1 className="text-2xl mb-1">BAHAba Admin</h1>
              <p className="text-blue-100 text-sm">
                System Management Dashboard
              </p>
            </div>
            <button className="bg-blue-700 hover:bg-blue-800 px-4 py-2 rounded-lg flex items-center gap-2 transition-colors">
              <Settings size={18} />
              <span className="text-sm">Settings</span>
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6">
        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {stats.map((stat, index) => {
            const Icon = stat.icon;
            return (
              <div
                key={index}
                className="bg-white rounded-xl shadow-md p-5 hover:shadow-lg transition-shadow"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className={`${stat.color} p-3 rounded-lg`}>
                    <Icon size={24} className="text-white" />
                  </div>
                  <span className="text-sm text-green-600 font-medium">
                    {stat.change}
                  </span>
                </div>
                <p className="text-2xl mb-1">{stat.value}</p>
                <p className="text-sm text-gray-600">{stat.label}</p>
              </div>
            );
          })}
        </div>

        {/* Tabs */}
        <div className="bg-white rounded-xl shadow-md mb-6">
          <div className="border-b border-gray-200 px-6">
            <div className="flex gap-6">
              {[
                { id: "overview", label: "Overview" },
                { id: "alerts", label: "Manage Alerts" },
                { id: "reports", label: "Community Reports" },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`py-4 border-b-2 transition-colors ${
                    activeTab === tab.id
                      ? "border-blue-600 text-blue-600"
                      : "border-transparent text-gray-600 hover:text-blue-600"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className="p-6">
            {/* Overview Tab */}
            {activeTab === "overview" && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-lg mb-4">Recent Activity</h2>
                  <div className="space-y-3">
                    {recentAlerts.map((alert) => (
                      <div
                        key={alert.id}
                        className="flex items-center justify-between p-4 bg-gray-50 rounded-lg"
                      >
                        <div className="flex items-center gap-4">
                          <div className="bg-yellow-100 p-2 rounded-lg">
                            <Bell size={20} className="text-yellow-600" />
                          </div>
                          <div>
                            <p className="text-sm mb-1">{alert.title}</p>
                            <p className="text-xs text-gray-500">
                              {alert.recipients} recipients • {alert.sent}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <CheckCircle size={18} className="text-green-600" />
                          <span className="text-sm text-gray-600">Sent</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <h2 className="text-lg mb-4">Pending Verifications</h2>
                  <div className="space-y-3">
                    {pendingReports.slice(0, 2).map((report) => (
                      <div
                        key={report.id}
                        className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer"
                        onClick={() => setActiveTab("reports")}
                      >
                        <div className="flex items-center gap-4">
                          <div className="bg-blue-100 p-2 rounded-lg">
                            <MapPin size={20} className="text-blue-600" />
                          </div>
                          <div>
                            <p className="text-sm mb-1">
                              Report from {report.user}
                            </p>
                            <p className="text-xs text-gray-500">
                              {report.location} • {report.time}
                            </p>
                          </div>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveTab("reports");
                          }}
                          className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700 transition-colors"
                        >
                          Review
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Manage Alerts Tab */}
            {activeTab === "alerts" && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg">Alert Management</h2>
                  <button
                    onClick={() => {
                      setShowNotification(true);
                      setTimeout(() => setShowNotification(false), 3000);
                    }}
                    className="bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-blue-700 transition-colors"
                  >
                    <Send size={18} />
                    Test Push Notification
                  </button>
                </div>

                {/* Notification Popup */}
                {showNotification && (
                  <div className="fixed top-6 left-1/2 transform -translate-x-1/2 bg-white rounded-xl shadow-2xl p-4 max-w-sm mx-4 z-50 border border-red-200 animate-in slide-in-from-top">
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="text-red-600 mt-0.5" size={20} />
                      <div className="flex-1">
                        <p className="text-sm mb-1">
                          <strong>BAHAba Alert</strong>
                        </p>
                        <p className="text-sm text-gray-600">
                          Flash flood warning! Evacuate low-lying areas immediately.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Alert Form */}
                <div className="bg-gray-50 rounded-lg p-5">
                  <h3 className="text-sm mb-4">Create Alert</h3>
                  <div className="space-y-4">
                    <div>
                      <label className="text-sm text-gray-600 mb-2 block">
                        Alert Type
                      </label>
                      <select className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500">
                        <option>Select type</option>
                        <option>Warning (Red)</option>
                        <option>Alert (Yellow)</option>
                        <option>Information (Blue)</option>
                        <option>All Clear (Green)</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-sm text-gray-600 mb-2 block">
                        Target Barangay
                      </label>
                      <select className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500">
                        <option>All Barangays</option>
                        <option>Barangay Tuburan</option>
                        <option>Barangay Gabawan</option>
                        <option>Barangay Ligaya</option>
                        <option>Barangay Luntad</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-sm text-gray-600 mb-2 block">
                        Message
                      </label>
                      <textarea
                        placeholder="Enter alert message..."
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                        rows={4}
                      ></textarea>
                    </div>

                    <div className="flex gap-3">
                      <button className="flex-1 bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 transition-colors">
                        Send Now
                      </button>
                      <button className="flex-1 border border-gray-300 text-gray-600 py-2 rounded-lg hover:bg-gray-50 transition-colors">
                        Schedule
                      </button>
                    </div>
                  </div>
                </div>

                {/* Alert History */}
                <div>
                  <h3 className="text-sm mb-3">Alert History</h3>
                  <div className="space-y-2">
                    {recentAlerts.map((alert) => (
                      <div
                        key={alert.id}
                        className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                      >
                        <div className="flex-1">
                          <p className="text-sm mb-1">{alert.title}</p>
                          <p className="text-xs text-gray-500">
                            {alert.recipients} recipients • {alert.sent}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                            <Eye size={18} className="text-gray-600" />
                          </button>
                          <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                            <Edit size={18} className="text-gray-600" />
                          </button>
                          <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                            <Trash2 size={18} className="text-red-600" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Community Reports Tab */}
            {activeTab === "reports" && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg">Community Reports</h2>
                  <button className="bg-white border border-gray-300 text-gray-600 px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-gray-50 transition-colors">
                    <Download size={18} />
                    Export
                  </button>
                </div>

                {/* Filter Tabs */}
                <div className="flex gap-3 border-b border-gray-200">
                  <button className="pb-2 px-4 border-b-2 border-blue-600 text-blue-600 text-sm">
                    Pending (2)
                  </button>
                  <button className="pb-2 px-4 text-gray-600 text-sm hover:text-blue-600">
                    Verified (45)
                  </button>
                  <button className="pb-2 px-4 text-gray-600 text-sm hover:text-blue-600">
                    Rejected (3)
                  </button>
                </div>

                {/* Reports List */}
                <div className="space-y-3">
                  {pendingReports.map((report) => (
                    <div
                      key={report.id}
                      className="border border-gray-200 rounded-lg p-4"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-blue-200 rounded-full flex items-center justify-center text-blue-700">
                            {report.user.charAt(0)}
                          </div>
                          <div>
                            <p className="text-sm mb-1">{report.user}</p>
                            <p className="text-xs text-gray-500">
                              {report.location}
                            </p>
                          </div>
                        </div>
                        <span
                          className={`text-xs px-2 py-1 rounded-full ${
                            report.status === "pending"
                              ? "bg-yellow-100 text-yellow-700"
                              : "bg-green-100 text-green-700"
                          }`}
                        >
                          {report.status}
                        </span>
                      </div>

                      <div className="bg-gradient-to-br from-blue-100 to-gray-100 rounded-lg h-32 mb-3 flex items-center justify-center">
                        <span className="text-sm text-gray-500">
                          Report Image
                        </span>
                      </div>

                      <p className="text-sm text-gray-700 mb-3">
                        Water level rising, knee-deep in some areas. Residents
                        advised to monitor closely.
                      </p>

                      {report.status === "pending" && (
                        <div className="flex gap-3">
                          <button className="flex-1 bg-green-600 text-white py-2 rounded-lg hover:bg-green-700 transition-colors flex items-center justify-center gap-2">
                            <CheckCircle size={18} />
                            Verify
                          </button>
                          <button className="flex-1 border border-red-600 text-red-600 py-2 rounded-lg hover:bg-red-50 transition-colors flex items-center justify-center gap-2">
                            <AlertTriangle size={18} />
                            Reject
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}