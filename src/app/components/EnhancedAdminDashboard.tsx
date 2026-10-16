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
  Download,
  TrendingUp,
  BarChart3,
  Radio,
  Smartphone,
  Clock,
  XCircle
} from "lucide-react";
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

// Alert Level Types (ISO Standard)
type AlertLevel = "advisory" | "warning" | "critical";

interface Alert {
  id: number;
  level: AlertLevel;
  title: string;
  message: string;
  targetBarangay: string;
  channels: "push"[];
  sentAt: string;
  recipients: number;
  deliveryStatus: {
    push: number;
  };
  createdBy: string;
}

interface AuditLog {
  id: number;
  action: string;
  user: string;
  timestamp: string;
  details: string;
}

export function EnhancedAdminDashboard() {
  const [activeTab, setActiveTab] = useState("analytics");
  const [showNotification, setShowNotification] = useState(false);
  const [selectedAlertLevel, setSelectedAlertLevel] = useState<AlertLevel>("warning");

  // Analytics Data
  const reportTrendsData = [
    { date: "May 1", reports: 12, verified: 8, rejected: 4 },
    { date: "May 2", reports: 18, verified: 14, rejected: 4 },
    { date: "May 3", reports: 25, verified: 20, rejected: 5 },
    { date: "May 4", reports: 32, verified: 28, rejected: 4 },
    { date: "May 5", reports: 28, verified: 24, rejected: 4 },
  ];

  const barangayReportsData = [
    { name: "Tuburan", reports: 45 },
    { name: "Poctoy", reports: 38 },
    { name: "Gabawan", reports: 28 },
    { name: "Batiano", reports: 22 },
    { name: "Panique", reports: 18 },
    { name: "Others", reports: 35 },
  ];

  const alertDistributionData = [
    { name: "Advisory", value: 45, color: "#3b82f6" },
    { name: "Warning", value: 67, color: "#eab308" },
    { name: "Critical", value: 23, color: "#ef4444" },
  ];

  const userParticipationData = [
    { month: "Jan", activeUsers: 450, reports: 89 },
    { month: "Feb", activeUsers: 520, reports: 112 },
    { month: "Mar", activeUsers: 680, reports: 145 },
    { month: "Apr", activeUsers: 890, reports: 198 },
    { month: "May", activeUsers: 1234, reports: 267 },
  ];

  // System Stats
  const stats = [
    {
      label: "Active Users",
      value: "1,234",
      change: "+12.5%",
      icon: Users,
      color: "bg-blue-500",
      trend: "up"
    },
    {
      label: "Alerts Sent (24h)",
      value: "89",
      change: "+15",
      icon: Bell,
      color: "bg-yellow-500",
      trend: "up"
    },
    {
      label: "Pending Reports",
      value: "23",
      change: "-8",
      icon: MapPin,
      color: "bg-orange-500",
      trend: "down"
    },
    {
      label: "System Uptime",
      value: "99.9%",
      change: "Excellent",
      icon: Activity,
      color: "bg-green-500",
      trend: "stable"
    },
  ];

  // Alert History with Multi-Channel Tracking
  const [alerts, setAlerts] = useState<Alert[]>([
    {
      id: 1,
      level: "critical",
      title: "Flash Flood Emergency - Tuburan",
      message: "CRITICAL: Flash flood warning. Evacuate immediately. Water level rising rapidly.",
      targetBarangay: "Tuburan",
      channels: ["push"],
      sentAt: "2024-05-04 14:30",
      recipients: 543,
      deliveryStatus: {
        push: 540,
      },
      createdBy: "Admin: Maria Santos"
    },
    {
      id: 2,
      level: "warning",
      title: "Heavy Rainfall Warning - Multiple Barangays",
      message: "WARNING: Heavy rainfall expected. Monitor water levels closely. Prepare evacuation kits.",
      targetBarangay: "All Barangays",
      channels: ["push"],
      sentAt: "2024-05-04 12:15",
      recipients: 1234,
      deliveryStatus: {
        push: 1230,
      },
      createdBy: "Admin: Juan Dela Cruz"
    },
    {
      id: 3,
      level: "advisory",
      title: "Flood Advisory - Poctoy",
      message: "ADVISORY: Minor flooding in coastal areas. Exercise caution. Roads remain passable.",
      targetBarangay: "Poctoy",
      channels: ["push"],
      sentAt: "2024-05-04 10:00",
      recipients: 456,
      deliveryStatus: {
        push: 450,
      },
      createdBy: "Admin: Pedro Reyes"
    },
  ]);

  // Audit Trail
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([
    {
      id: 1,
      action: "ALERT_CREATED",
      user: "Admin: Maria Santos",
      timestamp: "2024-05-04 14:30:15",
      details: "Created CRITICAL alert for Tuburan - Flash Flood Emergency"
    },
    {
      id: 2,
      action: "REPORT_VERIFIED",
      user: "Admin: Juan Dela Cruz",
      timestamp: "2024-05-04 14:15:42",
      details: "Verified report #456 from resident Juan D. - Tuburan flooding"
    },
    {
      id: 3,
      action: "REPORT_REJECTED",
      user: "Admin: Maria Santos",
      timestamp: "2024-05-04 13:45:30",
      details: "Rejected report #443 - Reason: Duplicate report"
    },
    {
      id: 4,
      action: "ALERT_CREATED",
      user: "Admin: Pedro Reyes",
      timestamp: "2024-05-04 12:15:05",
      details: "Created WARNING alert for All Barangays - Heavy Rainfall"
    },
    {
      id: 5,
      action: "SYSTEM_LOGIN",
      user: "Admin: Maria Santos",
      timestamp: "2024-05-04 08:00:12",
      details: "Admin logged into system from IP: 192.168.1.1"
    },
  ]);

  const [newAlert, setNewAlert] = useState({
    level: "warning" as AlertLevel,
    targetBarangay: "All Barangays",
    message: "",
    channels: {
      push: true,
    }
  });

  const getAlertLevelConfig = (level: AlertLevel) => {
    switch (level) {
      case "advisory":
        return {
          label: "ADVISORY",
          color: "bg-blue-500",
          bgColor: "bg-blue-50",
          borderColor: "border-blue-500",
          textColor: "text-blue-700",
          description: "Information and awareness"
        };
      case "warning":
        return {
          label: "WARNING",
          color: "bg-yellow-500",
          bgColor: "bg-yellow-50",
          borderColor: "border-yellow-500",
          textColor: "text-yellow-700",
          description: "Potential danger, prepare to act"
        };
      case "critical":
        return {
          label: "CRITICAL",
          color: "bg-red-500",
          bgColor: "bg-red-50",
          borderColor: "border-red-500",
          textColor: "text-red-700",
          description: "Immediate danger, act now"
        };
    }
  };

  const handleSendAlert = () => {
    if (!newAlert.message.trim()) {
      alert("Please enter an alert message");
      return;
    }

    const alertConfig = getAlertLevelConfig(newAlert.level);
    const title = `${alertConfig.label} - ${newAlert.targetBarangay}`;

    // Simulate sending to multiple channels
    const estimatedRecipients = newAlert.targetBarangay === "All Barangays" ? 1234 : 500;

    const alert: Alert = {
      id: alerts.length + 1,
      level: newAlert.level,
      title: title,
      message: newAlert.message,
      targetBarangay: newAlert.targetBarangay,
      channels: ["push"],
      sentAt: new Date().toISOString().slice(0, 16).replace('T', ' '),
      recipients: estimatedRecipients,
      deliveryStatus: {
        push: newAlert.channels.push ? estimatedRecipients - 5 : 0,
      },
      createdBy: "Admin: Current User"
    };

    setAlerts([alert, ...alerts]);

    // Add to audit log
    const auditEntry: AuditLog = {
      id: auditLogs.length + 1,
      action: "ALERT_CREATED",
      user: "Admin: Current User",
      timestamp: new Date().toISOString().slice(0, 19).replace('T', ' '),
      details: `Created ${alertConfig.label} alert for ${newAlert.targetBarangay} via push`
    };
    setAuditLogs([auditEntry, ...auditLogs]);

    // Show success notification
    setShowNotification(true);
    setTimeout(() => setShowNotification(false), 5000);

    // Reset form
    setNewAlert({
      level: "warning",
      targetBarangay: "All Barangays",
      message: "",
      channels: {
        push: true,
      }
    });
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-blue-600 text-white px-6 py-6 shadow-lg">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h1 className="text-2xl font-bold mb-1">BAHAba MDRRMO Dashboard</h1>
              <p className="text-blue-100 text-sm">
                Multi-Channel Emergency Response System
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
                  <div className="flex items-center gap-1">
                    <TrendingUp size={16} className={stat.trend === 'up' ? 'text-green-600' : stat.trend === 'down' ? 'text-red-600' : 'text-gray-600'} />
                    <span className={`text-sm font-medium ${stat.trend === 'up' ? 'text-green-600' : stat.trend === 'down' ? 'text-red-600' : 'text-gray-600'}`}>
                      {stat.change}
                    </span>
                  </div>
                </div>
                <p className="text-2xl font-bold mb-1">{stat.value}</p>
                <p className="text-sm text-gray-600">{stat.label}</p>
              </div>
            );
          })}
        </div>

        {/* Tabs */}
        <div className="bg-white rounded-xl shadow-md mb-6">
          <div className="border-b border-gray-200 px-6">
            <div className="flex gap-6 overflow-x-auto">
              {[
                { id: "analytics", label: "Analytics & Metrics", icon: BarChart3 },
                { id: "alerts", label: "Multi-Channel Alerts", icon: Radio },
                { id: "reports", label: "Community Reports", icon: MapPin },
                { id: "audit", label: "Audit Trail", icon: Clock },
              ].map((tab) => {
                const TabIcon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`py-4 border-b-2 transition-colors flex items-center gap-2 whitespace-nowrap ${
                      activeTab === tab.id
                        ? "border-blue-600 text-blue-600"
                        : "border-transparent text-gray-600 hover:text-blue-600"
                    }`}
                  >
                    <TabIcon size={18} />
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="p-6">
            {/* Analytics Tab */}
            {activeTab === "analytics" && (
              <div className="space-y-8">
                <div>
                  <h2 className="text-xl font-bold mb-6">System Analytics & Performance Metrics</h2>

                  {/* Report Trends */}
                  <div className="bg-gray-50 rounded-xl p-6 mb-6">
                    <h3 className="text-lg font-semibold mb-4">Report Submission Trends (Last 5 Days)</h3>
                    <ResponsiveContainer width="100%" height={300}>
                      <LineChart data={reportTrendsData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="date" />
                        <YAxis />
                        <Tooltip />
                        <Legend />
                        <Line type="monotone" dataKey="reports" stroke="#3b82f6" strokeWidth={2} name="Total Reports" />
                        <Line type="monotone" dataKey="verified" stroke="#22c55e" strokeWidth={2} name="Verified" />
                        <Line type="monotone" dataKey="rejected" stroke="#ef4444" strokeWidth={2} name="Rejected" />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Grid Layout */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Reports by Barangay */}
                    <div className="bg-gray-50 rounded-xl p-6">
                      <h3 className="text-lg font-semibold mb-4">Reports by Barangay</h3>
                      <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={barangayReportsData}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="name" />
                          <YAxis />
                          <Tooltip />
                          <Bar dataKey="reports" fill="#3b82f6" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>

                    {/* Alert Distribution */}
                    <div className="bg-gray-50 rounded-xl p-6">
                      <h3 className="text-lg font-semibold mb-4">Alert Level Distribution</h3>
                      <ResponsiveContainer width="100%" height={300}>
                        <PieChart>
                          <Pie
                            data={alertDistributionData}
                            cx="50%"
                            cy="50%"
                            labelLine={false}
                            label={({name, percent}) => `${name} ${(percent * 100).toFixed(0)}%`}
                            outerRadius={100}
                            fill="#8884d8"
                            dataKey="value"
                          >
                            {alertDistributionData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                          </Pie>
                          <Tooltip />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* User Participation Growth */}
                  <div className="bg-gray-50 rounded-xl p-6 mt-6">
                    <h3 className="text-lg font-semibold mb-4">User Participation Growth</h3>
                    <ResponsiveContainer width="100%" height={300}>
                      <LineChart data={userParticipationData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="month" />
                        <YAxis yAxisId="left" />
                        <YAxis yAxisId="right" orientation="right" />
                        <Tooltip />
                        <Legend />
                        <Line yAxisId="left" type="monotone" dataKey="activeUsers" stroke="#8b5cf6" strokeWidth={2} name="Active Users" />
                        <Line yAxisId="right" type="monotone" dataKey="reports" stroke="#f97316" strokeWidth={2} name="Reports Submitted" />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Key Metrics Summary */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
                    <div className="bg-blue-50 rounded-lg p-4">
                      <p className="text-sm text-gray-600 mb-1">Avg Response Time</p>
                      <p className="text-2xl font-bold text-blue-600">8.5 min</p>
                      <p className="text-xs text-gray-500 mt-1">Report verification time</p>
                    </div>
                    <div className="bg-green-50 rounded-lg p-4">
                      <p className="text-sm text-gray-600 mb-1">Communication Reach</p>
                      <p className="text-2xl font-bold text-green-600">4,567</p>
                      <p className="text-xs text-gray-500 mt-1">Total people reached today</p>
                    </div>
                    <div className="bg-purple-50 rounded-lg p-4">
                      <p className="text-sm text-gray-600 mb-1">Report Accuracy</p>
                      <p className="text-2xl font-bold text-purple-600">92%</p>
                      <p className="text-xs text-gray-500 mt-1">Verified vs total reports</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Multi-Channel Alerts Tab */}
            {activeTab === "alerts" && (
              <div className="space-y-6">
                {/* Success Notification */}
                {showNotification && (
                  <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-start gap-3">
                    <CheckCircle className="text-green-600 mt-0.5 flex-shrink-0" size={20} />
                    <div>
                      <p className="text-sm font-semibold text-green-800">Alert Sent Successfully!</p>
                      <p className="text-xs text-green-700 mt-1">
                        Your alert has been broadcast to all selected channels and recipients will receive notifications shortly.
                      </p>
                    </div>
                  </div>
                )}

                {/* Alert Creation Form */}
                <div className="bg-gray-50 rounded-xl p-6">
                  <h2 className="text-lg font-bold mb-6">Create Standardized Alert</h2>

                  <div className="space-y-5">
                    {/* Alert Level Selection */}
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-3">
                        Alert Level (ISO Standard) *
                      </label>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        {(["advisory", "warning", "critical"] as AlertLevel[]).map((level) => {
                          const config = getAlertLevelConfig(level);
                          return (
                            <button
                              key={level}
                              type="button"
                              onClick={() => setNewAlert({ ...newAlert, level })}
                              className={`${config.bgColor} ${config.borderColor} border-2 rounded-xl p-4 text-left transition-all ${
                                newAlert.level === level ? 'ring-2 ring-offset-2 ring-blue-500' : ''
                              }`}
                            >
                              <div className="flex items-start gap-3">
                                <div className={`${config.color} w-3 h-3 rounded-full mt-1 flex-shrink-0`}></div>
                                <div className="flex-1">
                                  <p className={`text-sm font-bold ${config.textColor} mb-1`}>{config.label}</p>
                                  <p className="text-xs text-gray-600">{config.description}</p>
                                </div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Target Barangay */}
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">
                        Target Barangay *
                      </label>
                      <select
                        value={newAlert.targetBarangay}
                        onChange={(e) => setNewAlert({ ...newAlert, targetBarangay: e.target.value })}
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option>All Barangays</option>
                        <option>Tuburan</option>
                        <option>Poctoy</option>
                        <option>Gabawan</option>
                        <option>Batiano</option>
                        <option>Panique</option>
                        <option>Libertad</option>
                        <option>Canjalon</option>
                        <option>Liwayway</option>
                        <option>Pit-os</option>
                      </select>
                    </div>

                    {/* Multi-Channel Selection */}
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-3">
                        Communication Channel
                      </label>
                      <div className="grid grid-cols-1 gap-3">
                        <label className="flex items-center gap-3 bg-white border-2 border-gray-200 rounded-lg p-3 cursor-pointer hover:bg-gray-50">
                          <input
                            type="checkbox"
                            checked
                            readOnly
                            className="w-5 h-5"
                          />
                          <Smartphone size={20} className="text-blue-600" />
                          <div className="flex-1">
                            <p className="text-sm font-medium">Push Notification</p>
                            <p className="text-xs text-gray-500">In-app alert</p>
                          </div>
                        </label>
                      </div>
                    </div>

                    {/* Message */}
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">
                        Alert Message *
                      </label>
                      <textarea
                        value={newAlert.message}
                        onChange={(e) => setNewAlert({ ...newAlert, message: e.target.value })}
                        placeholder="Enter detailed alert message for residents..."
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        rows={4}
                      ></textarea>
                      <p className="text-xs text-gray-500 mt-1">
                        Clear and actionable instructions. Avoid jargon.
                      </p>
                    </div>

                    {/* Send Button */}
                    <div className="flex gap-3 pt-2">
                      <button
                        onClick={handleSendAlert}
                        className="flex-1 bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 transition-colors font-semibold flex items-center justify-center gap-2"
                      >
                        <Send size={20} />
                        Broadcast Alert Now
                      </button>
                      <button className="px-6 border-2 border-gray-300 text-gray-700 py-3 rounded-lg hover:bg-gray-50 transition-colors font-semibold">
                        Schedule
                      </button>
                    </div>
                  </div>
                </div>

                {/* Alert History with Channel Tracking */}
                <div>
                  <h3 className="text-lg font-bold mb-4">Alert History & Delivery Status</h3>
                  <div className="space-y-3">
                    {alerts.map((alert) => {
                      const config = getAlertLevelConfig(alert.level);
                      return (
                        <div key={alert.id} className="bg-white border border-gray-200 rounded-xl p-5">
                          <div className="flex items-start justify-between mb-3">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-2">
                                <span className={`${config.color} px-3 py-1 rounded-full text-xs font-bold text-white`}>
                                  {config.label}
                                </span>
                                <span className="text-xs text-gray-500">• {alert.targetBarangay}</span>
                              </div>
                              <h4 className="text-sm font-semibold mb-1">{alert.title}</h4>
                              <p className="text-sm text-gray-700 mb-2">{alert.message}</p>
                              <div className="flex items-center gap-4 text-xs text-gray-500">
                                <span>{alert.sentAt}</span>
                                <span>•</span>
                                <span>By: {alert.createdBy}</span>
                              </div>
                            </div>
                          </div>

                          {/* Delivery Status */}
                          <div className="bg-gray-50 rounded-lg p-4 mt-4">
                            <p className="text-xs font-semibold text-gray-700 mb-3">Delivery Status:</p>
                            <div className="grid grid-cols-1 gap-3">
                              <div className="flex items-center gap-2">
                                <Smartphone size={16} className="text-blue-600" />
                                <div>
                                  <p className="text-xs text-gray-600">Push</p>
                                  <p className="text-sm font-semibold">{alert.deliveryStatus.push}</p>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* Audit Trail Tab */}
            {activeTab === "audit" && (
              <div>
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-lg font-bold">System Audit Trail & Message Traceability</h2>
                  <button className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
                    <Download size={18} />
                    Export Logs
                  </button>
                </div>

                <div className="bg-gray-50 rounded-lg p-4 mb-6">
                  <p className="text-sm text-gray-700">
                    <strong>Purpose:</strong> Complete audit trail of all system actions for accountability, traceability, and compliance.
                    All administrative actions are logged with timestamp, user, and details.
                  </p>
                </div>

                <div className="space-y-2">
                  {auditLogs.map((log) => (
                    <div key={log.id} className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                      <div className="flex items-start gap-4">
                        <div className="flex-shrink-0">
                          {log.action.includes("ALERT") && <Bell size={20} className="text-yellow-600" />}
                          {log.action.includes("REPORT") && <MapPin size={20} className="text-blue-600" />}
                          {log.action.includes("LOGIN") && <Users size={20} className="text-green-600" />}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-1">
                            <span className="px-2 py-1 bg-gray-100 rounded text-xs font-mono font-semibold">
                              {log.action}
                            </span>
                            <span className="text-xs text-gray-500">{log.timestamp}</span>
                          </div>
                          <p className="text-sm text-gray-700 mb-1">{log.details}</p>
                          <p className="text-xs text-gray-500">User: {log.user}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Reports Tab - Placeholder */}
            {activeTab === "reports" && (
              <div>
                <h2 className="text-lg font-bold mb-4">Community Reports Management</h2>
                <p className="text-sm text-gray-600">
                  This section would contain the community reports verification interface.
                  (Use existing AdminDashboard reports tab functionality)
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
