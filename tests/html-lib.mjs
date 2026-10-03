// 去掉 index.html 裡的 <!-- 註解 -->，避免被註解掉的 <script>／<link> 標籤還被當成有載入
// script／style 元素本文原封不動（JS 字串或樣式裡出現的 "<!--" 不是註解）；alternation 由左往右，
// 所以包住標籤的註解會先被吃掉
export const stripHtmlComments = html =>
    html.replace(/(<(script|style)\b[\s\S]*?<\/\2>)|<!--[\s\S]*?-->/gi, (m, element) => element ?? '');
