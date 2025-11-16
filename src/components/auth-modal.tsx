"use client";
import { useState } from "react";
import { X, User, Mail, Lock, LogIn, UserPlus } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useRouter } from "next/navigation";

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultTab?: "login" | "register";
}

export default function AuthModal({ isOpen, onClose, defaultTab = "login" }: AuthModalProps) {
  const [activeTab, setActiveTab] = useState<"login" | "register">(defaultTab);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: ""
  });
  const [isLoading, setIsLoading] = useState(false);
  const [remember, setRemember] = useState(false);
  const { login, register, lastError } = useAuth();
  const router = useRouter();

  if (!isOpen) return null;

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData(prev => ({
      ...prev,
      [e.target.name]: e.target.value
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    
    try {
      let success = false;
      
      if (activeTab === "login") {
        success = await login(formData.email, formData.password, remember);
      } else {
        if (formData.password !== formData.confirmPassword) {
          alert("密碼不匹配");
          setIsLoading(false);
          return;
        }
        success = await register(formData.name, formData.email, formData.password);
      }
      
      if (success) {
        onClose();
        // 重置表單
        setFormData({ name: "", email: "", password: "", confirmPassword: "" });
        router.push("/");
      } else {
        const stateErr = (typeof (useAuth as any).getState === "function") ? (useAuth as any).getState().lastError : null;
        alert(stateErr || lastError || (activeTab === "login" ? "登入失敗" : "註冊失敗"));
      }
    } catch (error) {
      console.error("Auth error:", error);
      alert("操作失敗，請稍後再試");
    } finally {
      setIsLoading(false);
    }
  };

  // 切換分頁時清空表單與錯誤，避免殘留訊息
  const clearForm = () => setFormData({ name: "", email: "", password: "", confirmPassword: "" });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-lg border border-zinc-800 bg-zinc-900 p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-zinc-100">
            {activeTab === "login" ? "登入" : "註冊"}
          </h2>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
          >
            <X size={20} />
          </button>
        </div>

        <div className="mb-4 flex rounded-md bg-zinc-800 p-1">
          <button
            onClick={() => { setActiveTab("login"); clearForm(); }}
            className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
              activeTab === "login"
                ? "bg-zinc-700 text-zinc-100"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <LogIn size={16} className="mr-2 inline" />
            登入
          </button>
          <button
            onClick={() => { setActiveTab("register"); clearForm(); }}
            className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
              activeTab === "register"
                ? "bg-zinc-700 text-zinc-100"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <UserPlus size={16} className="mr-2 inline" />
            註冊
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {activeTab === "register" && (
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-300">
                <User size={16} className="mr-2 inline" />
                姓名
              </label>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleInputChange}
                className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-zinc-100 placeholder-zinc-500 focus:border-zinc-600 focus:outline-none focus:ring-1 focus:ring-zinc-600"
                placeholder="輸入您的姓名"
                required
              />
            </div>
          )}

          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-300">
              <Mail size={16} className="mr-2 inline" />
              用戶名或電子郵件
            </label>
            <input
              type="text"
              name="email"
              value={formData.email}
              onChange={handleInputChange}
              className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-zinc-100 placeholder-zinc-500 focus:border-zinc-600 focus:outline-none focus:ring-1 focus:ring-zinc-600"
              placeholder="輸入用戶名或電子郵件"
              required
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-300">
              <Lock size={16} className="mr-2 inline" />
              密碼
            </label>
            <input
              type="password"
              name="password"
              value={formData.password}
              onChange={handleInputChange}
              className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-zinc-100 placeholder-zinc-500 focus:border-zinc-600 focus:outline-none focus:ring-1 focus:ring-zinc-600"
              placeholder="輸入您的密碼"
              required
            />
          </div>

          {activeTab === "register" && (
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-300">
                <Lock size={16} className="mr-2 inline" />
                確認密碼
              </label>
              <input
                type="password"
                name="confirmPassword"
                value={formData.confirmPassword}
                onChange={handleInputChange}
                className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-zinc-100 placeholder-zinc-500 focus:border-zinc-600 focus:outline-none focus:ring-1 focus:ring-zinc-600"
                placeholder="再次輸入您的密碼"
                required
              />
            </div>
          )}

          <div className="flex items-center justify-between">
            <label className="flex items-center text-sm text-zinc-300">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                className="mr-2"
              />
              記住我
            </label>
            {activeTab === "login" && (
              <a href="/forgot-password" className="text-sm text-zinc-300 hover:text-zinc-100 underline">忘記密碼？</a>
            )}
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full rounded-md bg-zinc-700 px-4 py-2 text-sm font-medium text-zinc-100 hover:bg-zinc-600 focus:outline-none focus:ring-2 focus:ring-zinc-500 focus:ring-offset-2 focus:ring-offset-zinc-900 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? "處理中..." : (activeTab === "login" ? "登入" : "註冊")}
          </button>

          {/* 移除 Google 登入按鈕 */}
        </form>

        <div className="mt-4 text-center text-sm text-zinc-400">
          {activeTab === "login" ? (
            <>
              還沒有帳號？{" "}
              <button
                onClick={() => setActiveTab("register")}
                className="text-zinc-300 hover:text-zinc-100 underline"
              >
                立即註冊
              </button>
            </>
          ) : (
            <>
              已經有帳號？{" "}
              <button
                onClick={() => setActiveTab("login")}
                className="text-zinc-300 hover:text-zinc-100 underline"
              >
                立即登入
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}