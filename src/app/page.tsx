"use client";
import Sidebar from "@/components/sidebar";
import ChatPanel from "@/components/chat-panel";
import { useState } from "react";
import { useChat } from "@/hooks/useChat";

export default function Home() {
  const [personaId, setPersonaId] = useState<string | null>(null);
  const [personaName, setPersonaName] = useState<string | null>(null);
  const { setCurrentPersona } = useChat();

  return (
    <div className="flex h-screen overflow-hidden bg-black">
      <Sidebar onSelectPersona={(id, name) => {
        setPersonaId(id);
        setPersonaName(name);
        setCurrentPersona(id);
      }} />
      <ChatPanel personaId={personaId} personaName={personaName} />
    </div>
  );
}