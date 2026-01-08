import { search as ddgSearch } from "duck-duck-scrape";

/**
 * Web搜尋介面定義
 */
export interface SearchResult {
  title: string;
  description: string;
  url: string;
}

/**
 * 使用 Brave Search API 進行搜尋
 * 免費額度：2,000 次/月
 */
async function searchBrave(query: string, maxResults: number = 3): Promise<SearchResult[]> {
  const apiKey = process.env.BRAVE_API_KEY;

  if (!apiKey) {
    console.warn("websearch_brave_api_key_missing", { message: "BRAVE_API_KEY not found in environment variables" });
    throw new Error("BRAVE_API_KEY not configured");
  }

  const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${maxResults}`;

  console.log("websearch_brave_start", { query, maxResults });

  const response = await fetch(url, {
    headers: {
      'Accept': 'application/json',
      'Accept-Encoding': 'gzip',
      'X-Subscription-Token': apiKey,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("websearch_brave_error", {
      status: response.status,
      statusText: response.statusText,
      error: errorText
    });
    throw new Error(`Brave API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  console.log("websearch_brave_success", { resultsCount: data.web?.results?.length || 0 });

  const results: SearchResult[] = (data.web?.results || []).map((r: any) => ({
    title: r.title || "",
    description: r.description || "",
    url: r.url || "",
  }));

  return results;
}

/**
 * 使用 DuckDuckGo 進行搜尋（備用方案）
 * 完全免費，無限制
 */
async function searchDuckDuckGo(query: string, maxResults: number = 3): Promise<SearchResult[]> {
  console.log("websearch_ddg_start", { query, maxResults });

  try {
    const searchResults = await ddgSearch(query, {
      safeSearch: 0, // 0=off, 1=moderate, 2=strict
    });

    console.log("websearch_ddg_success", { resultsCount: searchResults.results?.length || 0 });

    const results: SearchResult[] = (searchResults.results || [])
      .slice(0, maxResults)
      .map((r: any) => ({
        title: r.title || "",
        description: r.description || "",
        url: r.url || "",
      }));

    return results;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("websearch_ddg_error", { message: msg });
    throw error;
  }
}

/**
 * 智慧搜尋：優先使用 Brave，失敗時自動切換到 DuckDuckGo
 * @param query 搜尋關鍵字
 * @param maxResults 最多返回幾筆結果
 * @returns 搜尋結果陣列
 */
export async function webSearch(query: string, maxResults: number = 3): Promise<SearchResult[]> {
  console.log("websearch_smart_start", { query, maxResults });

  // 策略 1: 優先使用 Brave Search API
  try {
    const results = await searchBrave(query, maxResults);
    console.log("websearch_smart_used_brave", { resultsCount: results.length });
    return results;
  } catch (braveError) {
    const msg = braveError instanceof Error ? braveError.message : String(braveError);
    console.warn("websearch_smart_brave_failed", {
      message: msg,
      fallbackTo: "DuckDuckGo"
    });

    // 策略 2: 備用 DuckDuckGo（完全免費）
    try {
      const results = await searchDuckDuckGo(query, maxResults);
      console.log("websearch_smart_used_ddg", { resultsCount: results.length });
      return results;
    } catch (ddgError) {
      const ddgMsg = ddgError instanceof Error ? ddgError.message : String(ddgError);
      console.error("websearch_smart_all_failed", {
        braveError: msg,
        ddgError: ddgMsg
      });

      // 兩個都失敗時返回空陣列
      return [];
    }
  }
}

/**
 * 將搜尋結果格式化為適合 LLM 閱讀的文字
 * @param results 搜尋結果
 * @returns 格式化後的文字
 */
export function formatSearchResults(results: SearchResult[]): string {
  if (results.length === 0) {
    return "";
  }

  const formatted = results
    .map((r, index) => {
      return `【${index + 1}. ${r.title}】\n${r.description}\n來源：${r.url}`;
    })
    .join("\n\n");

  return `\n\n---最新網路資訊（你必須使用這些資訊來回答問題）---\n${formatted}\n---資訊結束---\n\n**請基於以上最新資訊，從你的信仰視角回應用戶的問題。**`;
}

/**
 * 偵測文字的主要語言
 * @param text 待偵測的文字
 * @returns 'zh' 中文 或 'en' 英文
 */
export function detectLanguage(text: string): 'zh' | 'en' {
  // 計算中文字符數量
  const chineseChars = text.match(/[\u4e00-\u9fa5]/g);
  const chineseCount = chineseChars ? chineseChars.length : 0;

  // 如果中文字符超過 30%，判定為中文
  const isChinese = chineseCount > text.length * 0.3;

  console.log("language_detection", {
    textPreview: text.slice(0, 50),
    chineseCount,
    totalLength: text.length,
    ratio: (chineseCount / text.length).toFixed(2),
    detected: isChinese ? 'zh' : 'en'
  });

  return isChinese ? 'zh' : 'en';
}

/**
 * 使用 LLM 智慧判斷用戶問題是否需要網路搜尋
 * @param userText 用戶輸入的文字
 * @param personaContext 人物背景（可選，用於更精準判斷）
 * @returns 是否需要搜尋
 */
export async function needsWebSearch(
  userText: string,
  personaContext?: string
): Promise<boolean> {
  // 偵測用戶語言
  const userLang = detectLanguage(userText);

  // 快速過濾：明顯不需要搜尋的情況（雙語支援）
  const obviousNoSearchPatterns = [
    // 問候語（中英文）
    /^(你好|嗨|哈囉|hi|hello|hey|greetings)/i,
    // 感謝詞（中英文）
    /^(謝謝|感謝|多謝|thanks|thank you|thx)/i,
    // 聖經人物介紹（中英文）
    /(誰是|什麼是|who is|what is).{0,10}(大衛|摩西|保羅|約瑟|彼得|以利亞|david|moses|paul|joseph|peter|elijah)/i,
  ];

  if (obviousNoSearchPatterns.some(pattern => pattern.test(userText))) {
    console.log("websearch_needs_check_skip", {
      reason: "obvious_no_search",
      lang: userLang,
      textPreview: userText.slice(0, 50)
    });
    return false;
  }

  // 快速過濾：可能需要搜尋的關鍵信號（雙語支援）
  const possibleSearchSignals = [
    // 年份（通用格式）
    /\d{4}年?/,  // 2025、2026、2025年、2026年

    // 時間詞（中英文）
    /(今年|去年|明年|最近|近期|目前|現在|當前|this year|last year|next year|recent|recently|current|currently|now|today|latest)/i,

    // 金融市場（中英文）
    /(股市|股票|股價|幣|投資|基金|stock market|stocks|shares|cryptocurrency|crypto|investment|fund|trading)/i,

    // 政治時事（中英文）
    /(選舉|疫情|新聞|時事|政治|election|pandemic|covid|news|current events|politics|government)/i,

    // 科技公司/產品（通用）
    /(AI|ChatGPT|GPT|特斯拉|Tesla|蘋果|Apple|Meta|Facebook|Google|微軟|Microsoft|亞馬遜|Amazon|OpenAI|Anthropic)/i,

    // 其他時事關鍵字（中英文）
    /(天氣|氣溫|climate|weather|temperature|趨勢|trend|發展|development|事件|event)/i,
  ];

  const hasSignal = possibleSearchSignals.some(pattern => pattern.test(userText));

  // 如果沒有任何信號，直接返回 false（節省 LLM 調用）
  if (!hasSignal) {
    console.log("websearch_needs_check_no_signal", {
      lang: userLang,
      textPreview: userText.slice(0, 50)
    });
    return false;
  }

  // 使用 LLM 進行智慧判斷
  try {
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
      console.warn("websearch_needs_check_no_api_key", { fallback: "signal-based" });
      return hasSignal; // 降級為信號判斷
    }

    // 根據用戶語言動態生成 prompt（提升判斷效率）
    const prompt = userLang === 'zh'
      ? `你是一個問題分類助手。判斷以下問題是否需要「最新的網路資訊」來回答。

判斷標準：
- 需要搜尋：涉及最近發生的事件、最新數據、即時資訊（如：股市、新聞、科技趨勢、天氣）
- 不需要搜尋：關於聖經故事、歷史事件、神學問題、個人建議

${personaContext ? `背景：正在扮演聖經人物「${personaContext}」回答問題\n` : ""}
問題：「${userText}」

請只回答 YES 或 NO（不要解釋）`
      : `You are a question classifier. Determine if the following question requires "latest web information" to answer.

Criteria:
- NEEDS SEARCH: Recent events, latest data, real-time information (e.g., stock market, news, tech trends, weather)
- NO SEARCH: Biblical stories, historical events, theological questions, personal advice

${personaContext ? `Context: Responding as the biblical character "${personaContext}"\n` : ""}
Question: "${userText}"

Answer only YES or NO (no explanation)`;

    console.log("websearch_needs_check_llm_start", { textPreview: userText.slice(0, 50) });

    const response = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.1, // 低溫度確保穩定判斷
        max_tokens: 10,
      }),
    });

    if (!response.ok) {
      console.warn("websearch_needs_check_llm_failed", { status: response.status });
      return hasSignal; // 降級為信號判斷
    }

    const data = await response.json();
    const answer = data.choices?.[0]?.message?.content?.trim().toUpperCase();
    const needsSearch = answer === "YES";

    console.log("websearch_needs_check_llm_result", {
      answer,
      needsSearch,
      textPreview: userText.slice(0, 50)
    });

    return needsSearch;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("websearch_needs_check_error", { message: msg });
    return hasSignal; // 降級為信號判斷
  }
}
