        // 全局狀態 //
        let inputMode = lhGet('haoYunQi_inputMode') || 'auto';
        let currentMode = 'common';
        let selectedChars = new Set();
        let recentClicks = []; // kept for compatibility
        // 形狀不對的存檔（例如 'null'、'{}'）跟損毀的 JSON 一樣處理：用預設值開機、原始內容不動
        let hashtags = lhGetJSON('haiku_hashtags', [], Array.isArray);
        let lyricsSections = lhGetJSON('haiku_lyrics', [{ label: '', text: '' }],
            v => Array.isArray(v) && v.length > 0 && v.every(s => s && typeof s === 'object' && (s.text === undefined || typeof s.text === 'string')));
        let savedWords = lhGetJSON('haiku_savedwords', [], Array.isArray);
        let wordlistData = null;
        let wordlistLoading = false;
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
        let suggestedPool = new Set();
        let sentCandidatesSet = new Set();
        let cumulativeCandidates = [];
        let _aiExtraRoundDone = false;
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

