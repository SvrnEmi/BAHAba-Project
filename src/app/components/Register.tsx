import { useState } from "react";
import { useNavigate } from "react-router";
import { User, Mail, Lock, Eye, EyeOff, Phone, MapPin } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../lib/auth";
import { BrandLogo } from "./BrandLogo";
import { BackToWelcome } from "./BackToWelcome";

export function Register() {
  const navigate = useNavigate();
  const { refreshProfile } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    fullName: "",
    email: "",
    phone: "",
    barangay: "",
    password: "",
    confirmPassword: "",
  });

  const validateForm = () => {
    if (!formData.fullName.trim()) return "Please enter your full name.";
    if (!formData.email.trim()) return "Please enter your email address.";
    if (!formData.phone.trim()) return "Please enter your phone number.";
    if (!formData.barangay) return "Please select your barangay.";
    if (formData.password.length < 8) return "Password must be at least 8 characters long.";
    if (formData.password !== formData.confirmPassword) return "Passwords do not match.";
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const validationError = validateForm();
    if (validationError) {
      alert(validationError);
      return;
    }

    setIsSubmitting(true);

    try {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: formData.email.trim(),
        password: formData.password,
        options: {
          data: {
            name: formData.fullName.trim(),
            phone: formData.phone.trim(),
            role: "resident",
            barangay: formData.barangay,
          },
        },
      });

      if (signUpError) {
        throw signUpError;
      }

      if (data.session && data.user) {
        const { error: profileError } = await supabase.from("profiles").upsert({
          id: data.user.id,
          name: formData.fullName.trim(),
          email: formData.email.trim(),
          phone: formData.phone.trim(),
          role: "resident",
          barangay: formData.barangay,
        });

        if (profileError) {
          throw profileError;
        }
      }

      if (data.session) {
        // The role was read on SIGNED_IN, possibly before the profile row
        // existed; re-read it and PublicOnlyRoute redirects to the user's home.
        refreshProfile();
        return;
      }

      alert("Account created successfully. Please check your email to confirm your account before signing in.");
      setFormData({
        fullName: "",
        email: "",
        phone: "",
        barangay: "",
        password: "",
        confirmPassword: "",
      });
    } catch (err) {
      alert(err instanceof Error ? err.message : "Unable to create account. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  return (
    <div className="min-h-screen max-w-md mx-auto bg-background">
      <div className="px-6 pt-4 pb-10">
        <div className="mb-6">
          <BackToWelcome />
        </div>
        <div className="flex items-center mb-8">
          <div>
            <h1 className="text-2xl font-bold mb-1" style={{ color: "var(--text-primary)" }}>Create Account</h1>
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>Join the BAHAba community</p>
          </div>
          <div className="ml-auto">
            <BrandLogo size={64} />
          </div>
        </div>

        <form onSubmit={handleSubmit} className="clay space-y-4 p-5" style={{ borderRadius: 28 }}>
          <div>
            <label className="clay-label">Full Name</label>
            <div className="relative">
              <User size={20} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
              <input
                type="text"
                name="fullName"
                value={formData.fullName}
                onChange={handleChange}
                placeholder="Juan Dela Cruz"
                className="clay-input has-icon-left"
                required
              />
            </div>
          </div>

          <div>
            <label className="clay-label">Email</label>
            <div className="relative">
              <Mail size={20} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                placeholder="your.email@example.com"
                className="clay-input has-icon-left"
                required
              />
            </div>
          </div>

          <div>
            <label className="clay-label">Phone Number</label>
            <div className="relative">
              <Phone size={20} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
              <input
                type="tel"
                name="phone"
                value={formData.phone}
                onChange={handleChange}
                placeholder="09XX XXX XXXX"
                className="clay-input has-icon-left"
                required
              />
            </div>
          </div>

          <div>
            <label className="clay-label">Barangay</label>
            <div className="relative">
              <MapPin size={20} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
              <select
                name="barangay"
                value={formData.barangay}
                onChange={handleChange}
                className="clay-input has-icon-left appearance-none"
                required
              >
                <option value="">Select your barangay</option>
                <option value="Tuburan">Barangay Tuburan</option>
                <option value="Gabawan">Barangay Gabawan</option>
                <option value="Ligaya">Barangay Ligaya</option>
                <option value="Luntad">Barangay Luntad</option>
                <option value="Poblacion">Barangay Poblacion</option>
              </select>
            </div>
          </div>

          <div>
            <label className="clay-label">Password</label>
            <div className="relative">
              <Lock size={20} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
              <input
                type={showPassword ? "text" : "password"}
                name="password"
                value={formData.password}
                onChange={handleChange}
                placeholder="Create a strong password"
                className="clay-input has-icon-left has-icon-right"
                required
                minLength={8}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-1 top-1/2 flex h-12 w-12 -translate-y-1/2 items-center justify-center text-gray-500"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
          </div>

          <div>
            <label className="clay-label">Confirm Password</label>
            <div className="relative">
              <Lock size={20} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
              <input
                type={showPassword ? "text" : "password"}
                name="confirmPassword"
                value={formData.confirmPassword}
                onChange={handleChange}
                placeholder="Re-enter your password"
                className="clay-input has-icon-left"
                required
                minLength={8}
              />
            </div>
          </div>

          <div className="rounded-2xl border p-4 text-sm" style={{ background: "#fff", color: "var(--text-primary)" }}>
            <p className="mb-2 font-medium">Password must contain:</p>
            <ul className="text-xs space-y-1 ml-4" style={{ color: "var(--text-secondary)" }}>
              <li>• At least 8 characters</li>
              <li>• Mix of letters and numbers recommended</li>
            </ul>
          </div>

          <div className="flex items-start">
            <input type="checkbox" id="terms" className="mt-1 mr-2" required />
            <label htmlFor="terms" className="text-sm" style={{ color: "var(--text-primary)" }}>
              I agree to the Terms of Service and Privacy Policy
            </label>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="clay-btn clay-btn-primary w-full"
          >
            {isSubmitting ? "Creating account..." : "Create Account"}
          </button>
        </form>

        <div className="mt-6 text-center">
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            Already have an account? <button onClick={() => navigate("/login")} className="min-h-12 px-2 font-semibold hover:underline" style={{ color: "var(--primary-shade)" }}>Sign In</button>
          </p>
        </div>
      </div>
    </div>
  );
}
