"use client";

import { useEffect, useRef } from "react";
import { useChat, type ConversationSummary } from "@/hooks/useChat";
import { useAuth } from "@/hooks/useAuth";

export function ConversationHistory() {
  const { isAuthenticated } = useAuth();
  const {
    conversations,
    currentConversationId,
    fetchConversations,
    loadConversation,
    deleteConversation,
    startNewConversation,
    isLoading,
  } = useChat();
  const listContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isAuthenticated) {
      fetchConversations();
    }
  }, [isAuthenticated, fetchConversations]);

  if (!isAuthenticated) {
    return null;
  }

  const formatDate = (date: Date) => {
    const d = new Date(date);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return d.toLocaleTimeString("zh-TW", {
        hour: "2-digit",
        minute: "2-digit",
      });
    } else if (diffDays === 1) {
      return "昨天";
    } else if (diffDays < 7) {
      return `${diffDays} 天前`;
    } else {
      return d.toLocaleDateString("zh-TW", {
        month: "short",
        day: "numeric",
      });
    }
  };

  const truncateText = (text: string, maxLength: number = 50) => {
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength) + "...";
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between p-4 border-b border-gray-700">
        <h2 className="text-lg font-semibold text-white">對話歷史</h2>
        <button
          onClick={startNewConversation}
          className="px-3 py-1 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
          title="開始新對話"
        >
          新對話
        </button>
      </div>

      <div
        ref={listContainerRef}
        className="flex-1 overflow-y-auto"
        role="list"
        aria-label="對話歷史清單"
        onClick={(e) => {
          const target = e.target as HTMLElement;
          const item = target.closest<HTMLElement>("[data-conversation-id]");
          if (!item) return;
          const id = item.dataset.conversationId;
          if (!id) return;
          loadConversation(id);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            const target = e.target as HTMLElement;
            const item = target.closest<HTMLElement>("[data-conversation-id]");
            if (!item) return;
            const id = item.dataset.conversationId;
            if (!id) return;
            loadConversation(id);
          }
        }}
      >
        {conversations.length === 0 ? (
          <div className="p-4 text-center text-gray-400">
            尚無對話紀錄
          </div>
        ) : (
          <div className="space-y-1 p-2">
            {conversations.map((conv) => (
              <div
                key={conv.id}
                data-conversation-id={conv.id}
                role="listitem"
                tabIndex={0}
                aria-label={`開啟對話 ${conv.personaName || "未命名"}`}
                className={`group relative p-3 rounded-lg cursor-pointer transition-colors ${
                  currentConversationId === conv.id
                    ? "bg-blue-600/20 border border-blue-500"
                    : "bg-gray-800/50 hover:bg-gray-700/50"
                }`}
              >
                {/* persona tag */}
                {conv.personaName && (
                  <div className="mb-2">
                    <span className="inline-block px-2 py-0.5 text-xs font-medium bg-purple-600/30 text-purple-300 rounded border border-purple-500/50">
                      {conv.personaName}
                    </span>
                  </div>
                )}

                {/* last message preview */}
                {conv.lastMessage && (
                  <p className="text-sm text-gray-300 mb-1 line-clamp-2">
                    {truncateText(conv.lastMessage.content)}
                  </p>
                )}

                {/* timestamp */}
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span>{formatDate(conv.updatedAt)}</span>
                </div>

                {/* delete button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm("確定要刪除這個對話嗎？")) {
                      deleteConversation(conv.id);
                    }
                  }}
                  className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 p-1 text-red-400 hover:text-red-300 hover:bg-red-900/30 rounded transition-all"
                  title="刪除對話"
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                    />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}
        <div
          aria-live="polite"
          className="sr-only"
        >
          {isLoading ? "正在載入歷史對話" : ""}
        </div>
      </div>
    </div>
  );
}
