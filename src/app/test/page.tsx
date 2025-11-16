"use client";
import Link from 'next/link';

export default function TestToolsPage() {
  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">🧪 測試工具</h1>
        
        <div className="grid gap-6 md:grid-cols-2">
          {/* CSV匯入測試 */}
          <div className="bg-white p-6 rounded-lg shadow-md">
            <h2 className="text-xl font-semibold text-gray-800 mb-4">📤 CSV匯入測試</h2>
            <p className="text-gray-600 mb-4">測試CSV資料匯入功能，支援聖經人物和用戶資料。</p>
            <Link 
              href="/csv-import-test.html"
              className="inline-block bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-md transition-colors"
            >
              開啟CSV測試工具
            </Link>
          </div>

          {/* 向量嵌入測試 */}
          <div className="bg-white p-6 rounded-lg shadow-md">
            <h2 className="text-xl font-semibold text-gray-800 mb-4">🔢 向量嵌入測試</h2>
            <p className="text-gray-600 mb-4">測試向量嵌入生成和相似人物搜尋功能。</p>
            <Link 
              href="/vector-test.html"
              className="inline-block bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-md transition-colors"
            >
              開啟向量測試工具
            </Link>
          </div>

          {/* API測試 */}
          <div className="bg-white p-6 rounded-lg shadow-md">
            <h2 className="text-xl font-semibold text-gray-800 mb-4">🔌 API健康檢查</h2>
            <p className="text-gray-600 mb-4">檢查API端點是否正常運作。</p>
            <button 
              onClick={async () => {
                try {
                  const response = await fetch('/api/health');
                  const data = await response.json();
                  alert(data.ok ? '✅ API正常' : `❌ API錯誤: ${data.error}`);
                } catch (error: unknown) {
                  const msg = error instanceof Error ? error.message : String(error);
                  alert(`❌ 連接失敗: ${msg}`);
                }
              }}
              className="bg-purple-500 hover:bg-purple-600 text-white px-4 py-2 rounded-md transition-colors"
            >
              測試API連接
            </button>
          </div>

          {/* 資料庫測試 */}
          <div className="bg-white p-6 rounded-lg shadow-md">
            <h2 className="text-xl font-semibold text-gray-800 mb-4">🗃️ 資料庫測試</h2>
            <p className="text-gray-600 mb-4">檢查資料庫連接和資料狀態。</p>
            <button 
              onClick={async () => {
                try {
                  const response = await fetch('/api/personas');
                  const data = await response.json();
                  if (data.ok) {
                    alert(`✅ 找到 ${data.characters.length} 個人物`);
                  } else {
                    alert(`❌ 錯誤: ${data.error}`);
                  }
                } catch (error: unknown) {
                  const msg = error instanceof Error ? error.message : String(error);
                  alert(`❌ 連接失敗: ${msg}`);
                }
              }}
              className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-md transition-colors"
            >
              測試資料庫
            </button>
          </div>
        </div>

        {/* API端點列表 */}
        <div className="mt-8 bg-white p-6 rounded-lg shadow-md">
          <h2 className="text-xl font-semibold text-gray-800 mb-4">🔗 API端點</h2>
          <div className="space-y-2 text-sm">
            <div><code className="bg-gray-100 px-2 py-1 rounded">POST /api/admin/import-csv</code> - CSV資料匯入</div>
            <div><code className="bg-gray-100 px-2 py-1 rounded">POST /api/vector/embeddings</code> - 生成向量嵌入</div>
            <div><code className="bg-gray-100 px-2 py-1 rounded">GET /api/vector/embeddings?characterId=XXX</code> - 相似人物搜尋</div>
            <div><code className="bg-gray-100 px-2 py-1 rounded">GET /api/health</code> - 健康檢查</div>
            <div><code className="bg-gray-100 px-2 py-1 rounded">GET /api/personas</code> - 獲取人物列表</div>
          </div>
        </div>
      </div>
    </div>
  );
}