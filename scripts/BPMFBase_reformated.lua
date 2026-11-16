--[[
  BPMFBase.txt → 精簡字庫格式轉換器
  
  輸入格式（每行）：
    字 注音(含調號) 拼音 編碼 big5
    例：包 ㄅㄠ bao 1h big5
  
  輸出格式：
    [ㄅㄠ1] 包胞苞褒枹笣蕔孢煲
    [ㄅㄠ2] 雹薄窇
    ...
  
  使用方式：
    lua reformat_bpmf.lua BPMFBase.txt > output.txt
    或在程式內 require 後呼叫 reformat(inputPath, outputPath)
]]

-- 注音符號的 Unicode 範圍 (ㄅ=U+3105 ~ ㄩ=U+3129, 加上 ㄝ=U+311D, ㄦ=U+3126 等)
-- 用來過濾「注音符號本身作為字」的行（共 37 筆）
local function isBopomofoSymbol(char)
  local code = utf8.codepoint(char)
  return code >= 0x3100 and code <= 0x312F
end

-- 從注音欄位提取：基底注音 + 聲調數字
-- "ㄅㄠ" → "ㄅㄠ", 1
-- "ㄅㄠˊ" → "ㄅㄠ", 2
-- "ㄅㄠˇ" → "ㄅㄠ", 3
-- "ㄅㄠˋ" → "ㄅㄠ", 4
-- "ㄅㄚ˙" → "ㄅㄚ", 5
local function parseTone(zhuyinRaw)
  -- 聲調符號 → 數字
  local toneMarks = {
    ["ˊ"] = 2,
    ["ˇ"] = 3,
    ["ˋ"] = 4,
    ["˙"] = 5
  }
  
  for mark, num in pairs(toneMarks) do
    if zhuyinRaw:find(mark) then
      local base = zhuyinRaw:gsub(mark, "")
      return base, num
    end
  end
  
  -- 無聲調符號 = 一聲
  return zhuyinRaw, 1
end

-- 注音排序用的固定順序表
-- 聲母順序：ㄅㄆㄇㄈ ㄉㄊㄋㄌ ㄍㄎㄏ ㄐㄑㄒ ㄓㄔㄕㄖ ㄗㄘㄙ
-- 韻母順序：ㄧㄨㄩ ㄚㄛㄜㄝ ㄞㄟㄠㄡ ㄢㄣㄤㄥ ㄦ
local zhuyinOrder = {}
local orderStr = "ㄅㄆㄇㄈㄉㄊㄋㄌㄍㄎㄏㄐㄑㄒㄓㄔㄕㄖㄗㄘㄙㄧㄨㄩㄚㄛㄜㄝㄞㄟㄠㄡㄢㄣㄤㄥㄦ"
local idx = 1
for _, code in utf8.codes(orderStr) do
  zhuyinOrder[utf8.char(code)] = idx
  idx = idx + 1
end

-- 比較兩個注音字串（逐字元比較注音順序，再比聲調）
local function compareZhuyinKey(a, b)
  -- a, b 格式："ㄅㄠ1", "ㄅㄠ2" 等
  -- 最後一個字元是聲調數字
  local toneA = tonumber(a:sub(-1))
  local toneB = tonumber(b:sub(-1))
  local baseA = a:sub(1, -2)
  local baseB = b:sub(1, -2)
  
  -- 逐注音符號比較
  local charsA, charsB = {}, {}
  for _, code in utf8.codes(baseA) do charsA[#charsA + 1] = utf8.char(code) end
  for _, code in utf8.codes(baseB) do charsB[#charsB + 1] = utf8.char(code) end
  
  local minLen = math.min(#charsA, #charsB)
  for i = 1, minLen do
    local oa = zhuyinOrder[charsA[i]] or 999
    local ob = zhuyinOrder[charsB[i]] or 999
    if oa ~= ob then return oa < ob end
  end
  
  -- 長度不同時短的在前
  if #charsA ~= #charsB then return #charsA < #charsB end
  
  -- 基底注音相同，比聲調
  return toneA < toneB
end

-- ===================== 主邏輯 =====================

local function reformat(inputPath, outputPath)
  -- 1. 讀取並分組
  local groups = {}     -- key = "ㄅㄠ1", value = { "包", "胞", ... }
  local keySet = {}     -- 記錄所有 key（去重用）
  
  local file = io.open(inputPath, "r")
  if not file then
    print("無法開啟檔案: " .. inputPath)
    return
  end
  
  local lineCount = 0
  local skipCount = 0
  
  for line in file:lines() do
    lineCount = lineCount + 1
    
    -- 分割欄位（以空白分隔）
    local fields = {}
    for field in line:gmatch("%S+") do
      fields[#fields + 1] = field
    end
    
    -- 至少要有 2 欄：字, 注音
    if #fields < 2 then goto continue end
    
    local char = fields[1]
    local zhuyinRaw = fields[2]
    
    -- 跳過注音符號本身作為「字」的行
    if isBopomofoSymbol(char) then
      skipCount = skipCount + 1
      goto continue
    end
    
    -- 解析聲調
    local baseZhuyin, tone = parseTone(zhuyinRaw)
    local key = baseZhuyin .. tostring(tone)
    
    -- 加入分組（同組內不重複同一字）
    if not groups[key] then
      groups[key] = {}
      keySet[#keySet + 1] = key
    end
    
    -- 檢查是否已存在（避免重複字）
    local exists = false
    for _, c in ipairs(groups[key]) do
      if c == char then exists = true; break end
    end
    if not exists then
      groups[key][#groups[key] + 1] = char
    end
    
    ::continue::
  end
  
  file:close()
  
  -- 2. 排序 key
  table.sort(keySet, compareZhuyinKey)
  
  -- 3. 輸出
  local out
  if outputPath then
    out = io.open(outputPath, "w")
  else
    out = io.stdout
  end
  
  for _, key in ipairs(keySet) do
    local chars = table.concat(groups[key])
    out:write("[" .. key .. "] " .. chars .. "\n")
  end
  
  if outputPath then
    out:close()
  end
  
  -- 統計
  io.stderr:write(string.format(
    "完成！讀取 %d 行，跳過 %d 筆注音符號，產出 %d 組\n",
    lineCount, skipCount, #keySet
  ))
end

-- ===================== CLI 入口 =====================

local input = arg[1] or "BPMFBase.txt"
local output = arg[2]  -- 省略則輸出到 stdout

reformat(input, output)
