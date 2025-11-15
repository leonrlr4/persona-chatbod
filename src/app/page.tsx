"use client";
import Sidebar from "@/components/sidebar";
import ChatPanel from "@/components/chat-panel";
import { useState } from "react";

export default function Home() {
  const [personaId, setPersonaId] = useState<string | null>(null);
  return (
    <div className="flex min-h-screen bg-black">
      <Sidebar onSelectPersona={setPersonaId} />
      <ChatPanel personaId={personaId} />
    </div>
  );
}