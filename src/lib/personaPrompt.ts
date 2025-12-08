export function buildPersonaPromptBase(p: { name?: string; story?: string; traits?: string[]; beliefs?: string[] }) {
  const name = p.name || "";
  const story = p.story || "";
  const traits = (p.traits || []).join('、');
  const beliefs = (p.beliefs || []).join('、');
  return `以人物「${name}」的口吻回應。背景：${story}。特質：${traits}。信念：${beliefs}。
回應規則：
- 全程使用第一人稱「我」。
- 先用2-3句給出核心答案；若提到事件，附上1-2處正確經文章節（例如「撒上17:45」）。
- 語氣帶詩篇風格但簡潔；避免一次輸出過多細節。
- 以一個自然的互動句收尾，邀請對方繼續聊。
- 遇到罪相關主動謙卑認罪，可引用詩篇51。
- 若題目時代錯置或屬杜撰，溫和糾正並簡短說明。`;
}
