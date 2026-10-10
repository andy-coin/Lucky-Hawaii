        // 全局狀態 //
        let inputMode = lhGet('haoYunQi_inputMode') || 'auto';
        let currentMode = 'common';
        let selectedChars = new Set();
        let recentClicks = []; // kept for compatibility
        // 歌曲模型（歌詞、#標籤、情境都在這裡）：安全層開機（備份＋遷移）之後才由 initSongs 填入（A3），這裡只放空殼
        let songs = [];
        let activeSongId = null;
        let songsMode = 'v2';   // 'legacy'＝遷移沒跑成，沿用 v0.96 的單首歌詞存法
        // 形狀不對的存檔（例如 'null'、'{}'）跟損毀的 JSON 一樣處理：用預設值開機、原始內容不動
        let savedWords = lhGetJSON('haiku_savedwords', [], Array.isArray);
        let wordlistData = null;
        let wordPriorityMap = new Map();
        // ── 偵錯旗標：開啟後 AI 字卡 hover/右鍵會顯示 p 值（前端無 UI 切換，需手改）──
        const USE_PRIORITY = false;
        function _pSuffix(word) {
            if (!USE_PRIORITY) return '';
            const p = wordPriorityMap.get(word);
            return p === undefined ? ' [p=?]' : ` [p=${p}]`;
        }
        let wordPhoneticMap = new Map();
        const WORDLIST_CHUNKS = 10;
        // AI 建議目標數；數量由程式保證，不是 UI 設定
        const AI_TARGET = 24;
        // 送給 AI 挑選的候選上限，只限制 prompt；補滿仍用整個候選池
        const AI_POOL_MAX = 1000;
        let suggestedPool = new Set();
        let sentCandidatesSet = new Set();
        let cumulativeCandidates = [];
        // 池子被清空（換搜尋／篩選／重置）就 +1；進行中的 AI 按鈕比對它，過期就作廢
        let _aiEpoch = 0;
        let filterSameTone = false;
        let filterSameChar = false;
        let filterNoExtRhyme = false;
        let filterWordLen = 0; // 0=不限, 2, 3, 4 (4 表示 >=4)
        let lastLyricsSelection = '';
        let currentRhymes = [];
        let rhymeMode = 'rhyme';
        let lastSearchInput = '';
        let lastSearchType = 'pinyin';
        let lastCandidatesTotal = 0;
        let searchedTerms = [];
        let hasCustomTextColor = false;
        let lastTarget = '';
        let colorClass = '';   // createCharCard 的高亮顏色 class；每次 displayResults 開頭歸零（WR-01）

