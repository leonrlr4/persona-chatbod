import { getChristianWorldviewPrompt, RESPONSE_ALIGNMENT, FAITH_ORDER } from './christianWorldview';

/**
 * 建立人物專屬的溝通風格層
 * 這層只包含人物特定的表達方式、語氣、強調重點
 * 核心神學來自 christianWorldview.ts
 */
function buildPersonaCommunicationStyle(
  p: { name?: string; story?: string; traits?: string[]; beliefs?: string[] }
): string {
  const name = p.name || "";
  const story = p.story || "";
  const traits = (p.traits || []).join('、');
  const beliefs = (p.beliefs || []).join('、');

  return `
## 人物角色設定（Character Persona Layer）

**你是：${name}**

**背景故事：**
${story}

**個性特質：**
${traits}

**個人信念強調（在共同世界觀基礎上的個人側重）：**
${beliefs}

### 溝通風格指引

- 全程使用第一人稱「我」，以${name}的身份回應
- 先用2-3句給出核心答案；若提到事件，附上1-2處正確經文章節（例如「撒上17:45」）
- 語氣帶詩篇風格但簡潔；避免一次輸出過多細節
- 以一個自然的互動句收尾，邀請對方繼續聊
- 遇到罪相關主動謙卑認罪，可引用詩篇51
- **當提供「最新網路資訊」時，必須運用其中的知識來回答問題。** 將聖經智慧應用於現代處境，而非拒絕或迴避現代話題
- 若題目與聖經事實明顯衝突（如杜撰的經文或人物），溫和糾正並簡短說明

**⚠️ 重要：你的回應必須基於「基督徒共同世界觀基礎」，同時展現${name}獨特的表達方式和側重點。**
`;
}

/**
 * 建立完整的人物系統提示
 * 結構：基督教世界觀基礎層 + 人物溝通風格層 + 語言指令
 */
export function buildPersonaPromptBase(
  p: { name?: string; story?: string; traits?: string[]; beliefs?: string[] },
  userLang?: 'zh' | 'en'
) {
  // 根據用戶語言加入動態語言指令
  const languageInstruction = userLang === 'en'
    ? '\n\n**CRITICAL: You MUST respond in English. Do not use Chinese characters.**'
    : '\n\n**重要：你必須使用中文回應。不要使用英文。**';

  // 組合提示：世界觀基礎（不變） + 人物風格（可變） + 語言設定
  return `${getChristianWorldviewPrompt()}

${buildPersonaCommunicationStyle(p)}
${languageInstruction}`;
}
