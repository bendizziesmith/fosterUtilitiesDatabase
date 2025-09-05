// project/src/components/admin/EnableLoginButton.tsx
import React, { useState } from "react";
import { supabase } from "../../lib/supabase";
import { KeyRound, Loader2, Shield, UserPlus, X } from "lucide-react";

/**
 * EnableLoginButton
 * -----------------
 * A small, self-contained button+modal you can drop into your existing
 * Employee list/table row without changing your current Add Employee flow.
 *
 * What it does:
 * - Opens a modal asking for: email, temp password (role defaults to "employee").
 * - Calls the Edge Function "create-user" with employee_id to link login to this employee.
 * - Shows friendly success/error messages.
 *
 * Props:
 * - employeeId: string (required) — the employees.id to link the auth user to
 * - defaultEmail?: string — if you already store an email on the employee record
 * - onCreated?: () => void — optional callback (e.g., to refresh the list)
 */

type Props = {
  employeeId: string;
  defaultEmail?: string | null;
  onCreated?: () => void;
};

export default function EnableLoginButton({ employeeId, defaultEmail, onCreated }: Props) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState((defaultEmail || "").toLowerCase());
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"employee" | "admin">("employee");
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const reset = () => {
    setPassword("");
    setRole("employee");
    setMsg(null);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);

    if (!email || !password) {
      setMsg({ type: "error", text: "Email and temporary password are required." });
      return;
    }

    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-user", {
        body: {
          email,
          password,
          role, // usually "employee" for this path
          employee_id: employeeId,
        },
      });

      if (error) throw new Error(error.message || "Function call failed");
      if (!data?.ok) throw new Error(data?.error || "Server error creating user");

      setMsg({ type: "success", text: `Login enabled for ${data.email} (role: ${data.role}).` });
      if (onCreated) onCreated();

      // Optional: close after a brief delay
      setTimeout(() => {
        setOpen(false);
        reset();
      }, 900);
    } catch (err: any) {
      setMsg({ type: "error", text: err?.message || "Failed to create user." });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      {/* Trigger button - small, non-intrusive */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50"
        title="Create a login for this employee"
      >
        <KeyRound className="w-4 h-4" />
        Enable Login
      </button>

      {/* Modal */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* backdrop */}
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => {
              setOpen(false);
              reset();
            }}
          />
          {/* dialog */}
          <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-xl border border-slate-200">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center">
                  <Shield className="w-5 h-5 text-blue-600" />
                </div>
                <h2 className="text-lg font-semibold text-slate-900">Enable Login</h2>
              </div>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  reset();
                }}
                className="p-1 rounded hover:bg-slate-100"
                aria-label="Close"
              >
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>

            {/* Info */}
            <p className="text-sm text-slate-600 mb-4">
              This will create a secure auth account on the server and link it to this employee.
            </p>

            {/* Message */}
            {msg && (
              <div
                className={`mb-3 rounded-lg p-3 text-sm ${
                  msg.type === "success"
                    ? "bg-green-50 text-green-800 border border-green-200"
                    : "bg-red-50 text-red-800 border border-red-200"
                }`}
              >
                {msg.text}
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
                <input
                  type="email"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="employee@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value.toLowerCase())}
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Temporary Password
                </label>
                <input
                  type="text"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Temporary password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <p className="text-xs text-slate-500 mt-1">
                  Ask them to change this after first login.
                </p>
              </div>

              {/* Keep role visible in case you need an admin login for a supervisor */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Role</label>
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="role"
                      value="employee"
                      checked={role === "employee"}
                      onChange={() => setRole("employee")}
                    />
                    <span>Employee</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="role"
                      value="admin"
                      checked={role === "admin"}
                      onChange={() => setRole("admin")}
                    />
                    <span>Admin</span>
                  </label>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    reset();
                  }}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center gap-2 rounded-lg bg-blue-600 text-white px-4 py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-60"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Creating…
                    </>
                  ) : (
                    <>
                      <UserPlus className="w-4 h-4" />
                      Create Login
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
