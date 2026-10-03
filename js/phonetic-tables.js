        // ==================== 注音優先架構 v1.0 ====================
        
        // 注音聲母表（21個聲母）
        const zhuyinInitials = ['ㄅ','ㄆ','ㄇ','ㄈ','ㄉ','ㄊ','ㄋ','ㄌ','ㄍ','ㄎ','ㄏ',
                               'ㄐ','ㄑ','ㄒ','ㄓ','ㄔ','ㄕ','ㄖ','ㄗ','ㄘ','ㄙ'];
        const zhuyinInitialSet = new Set(zhuyinInitials);
        
        // 拼音聲母表（用於辨識拼音輸入）
        const pinyinInitials = ['zh','ch','sh','b','p','m','f','d','t','n','l','g','k','h',
                               'j','q','x','r','z','c','s'];
        
        // ===== 完整注音↔拼音查找表（404組一對一映射）=====
        const fullZhuyinToPinyin = {
            'ㄅㄧ':'bi','ㄅㄧㄝ':'bie','ㄅㄧㄠ':'biao','ㄅㄧㄢ':'bian','ㄅㄧㄣ':'bin','ㄅㄧㄥ':'bing',
            'ㄅㄨ':'bu','ㄅㄚ':'ba','ㄅㄛ':'bo','ㄅㄞ':'bai','ㄅㄟ':'bei','ㄅㄠ':'bao',
            'ㄅㄢ':'ban','ㄅㄣ':'ben','ㄅㄤ':'bang','ㄅㄥ':'beng',
            'ㄆㄧ':'pi','ㄆㄧㄝ':'pie','ㄆㄧㄠ':'piao','ㄆㄧㄢ':'pian','ㄆㄧㄣ':'pin','ㄆㄧㄥ':'ping',
            'ㄆㄨ':'pu','ㄆㄚ':'pa','ㄆㄛ':'po','ㄆㄞ':'pai','ㄆㄟ':'pei','ㄆㄠ':'pao',
            'ㄆㄡ':'pou','ㄆㄢ':'pan','ㄆㄣ':'pen','ㄆㄤ':'pang','ㄆㄥ':'peng',
            'ㄇㄧ':'mi','ㄇㄧㄝ':'mie','ㄇㄧㄠ':'miao','ㄇㄧㄡ':'miu','ㄇㄧㄢ':'mian','ㄇㄧㄣ':'min','ㄇㄧㄥ':'ming',
            'ㄇㄨ':'mu','ㄇㄚ':'ma','ㄇㄛ':'mo','ㄇㄜ':'me','ㄇㄞ':'mai','ㄇㄟ':'mei','ㄇㄠ':'mao',
            'ㄇㄡ':'mou','ㄇㄢ':'man','ㄇㄣ':'men','ㄇㄤ':'mang','ㄇㄥ':'meng',
            'ㄈㄨ':'fu','ㄈㄚ':'fa','ㄈㄛ':'fo','ㄈㄟ':'fei','ㄈㄡ':'fou','ㄈㄢ':'fan','ㄈㄣ':'fen','ㄈㄤ':'fang','ㄈㄥ':'feng',
            'ㄉㄧ':'di','ㄉㄧㄝ':'die','ㄉㄧㄠ':'diao','ㄉㄧㄡ':'diu','ㄉㄧㄢ':'dian','ㄉㄧㄥ':'ding','ㄉㄧㄚ':'dia',
            'ㄉㄨ':'du','ㄉㄨㄛ':'duo','ㄉㄨㄟ':'dui','ㄉㄨㄢ':'duan','ㄉㄨㄣ':'dun','ㄉㄨㄥ':'dong',
            'ㄉㄚ':'da','ㄉㄜ':'de','ㄉㄞ':'dai','ㄉㄟ':'dei','ㄉㄠ':'dao','ㄉㄡ':'dou','ㄉㄢ':'dan','ㄉㄤ':'dang','ㄉㄥ':'deng',
            'ㄊㄧ':'ti','ㄊㄧㄝ':'tie','ㄊㄧㄠ':'tiao','ㄊㄧㄢ':'tian','ㄊㄧㄥ':'ting',
            'ㄊㄨ':'tu','ㄊㄨㄛ':'tuo','ㄊㄨㄟ':'tui','ㄊㄨㄢ':'tuan','ㄊㄨㄣ':'tun','ㄊㄨㄥ':'tong',
            'ㄊㄚ':'ta','ㄊㄜ':'te','ㄊㄞ':'tai','ㄊㄠ':'tao','ㄊㄡ':'tou','ㄊㄢ':'tan','ㄊㄤ':'tang','ㄊㄥ':'teng',
            'ㄋㄧ':'ni','ㄋㄧㄝ':'nie','ㄋㄧㄠ':'niao','ㄋㄧㄡ':'niu','ㄋㄧㄢ':'nian','ㄋㄧㄣ':'nin','ㄋㄧㄤ':'niang','ㄋㄧㄥ':'ning',
            'ㄋㄨ':'nu','ㄋㄨㄛ':'nuo','ㄋㄨㄢ':'nuan','ㄋㄨㄥ':'nong',
            'ㄋㄩ':'nu','ㄋㄩㄝ':'nue',
            'ㄋㄚ':'na','ㄋㄜ':'ne','ㄋㄞ':'nai','ㄋㄟ':'nei','ㄋㄠ':'nao','ㄋㄡ':'nou','ㄋㄢ':'nan','ㄋㄣ':'nen','ㄋㄤ':'nang','ㄋㄥ':'neng',
            'ㄌㄧ':'li','ㄌㄧㄚ':'lia','ㄌㄧㄝ':'lie','ㄌㄧㄠ':'liao','ㄌㄧㄡ':'liu','ㄌㄧㄢ':'lian','ㄌㄧㄣ':'lin','ㄌㄧㄤ':'liang','ㄌㄧㄥ':'ling',
            'ㄌㄨ':'lu','ㄌㄨㄛ':'luo','ㄌㄨㄢ':'luan','ㄌㄨㄣ':'lun','ㄌㄨㄥ':'long',
            'ㄌㄩ':'lu','ㄌㄩㄝ':'lue','ㄌㄩㄢ':'luan',
            'ㄌㄚ':'la','ㄌㄜ':'le','ㄌㄞ':'lai','ㄌㄟ':'lei','ㄌㄠ':'lao','ㄌㄡ':'lou','ㄌㄢ':'lan','ㄌㄤ':'lang','ㄌㄥ':'leng',
            'ㄍㄨ':'gu','ㄍㄨㄚ':'gua','ㄍㄨㄛ':'guo','ㄍㄨㄞ':'guai','ㄍㄨㄟ':'gui','ㄍㄨㄢ':'guan','ㄍㄨㄣ':'gun','ㄍㄨㄤ':'guang','ㄍㄨㄥ':'gong',
            'ㄍㄚ':'ga','ㄍㄜ':'ge','ㄍㄞ':'gai','ㄍㄟ':'gei','ㄍㄠ':'gao','ㄍㄡ':'gou','ㄍㄢ':'gan','ㄍㄣ':'gen','ㄍㄤ':'gang','ㄍㄥ':'geng',
            'ㄎㄨ':'ku','ㄎㄨㄚ':'kua','ㄎㄨㄛ':'kuo','ㄎㄨㄞ':'kuai','ㄎㄨㄟ':'kui','ㄎㄨㄢ':'kuan','ㄎㄨㄣ':'kun','ㄎㄨㄤ':'kuang','ㄎㄨㄥ':'kong',
            'ㄎㄚ':'ka','ㄎㄜ':'ke','ㄎㄞ':'kai','ㄎㄠ':'kao','ㄎㄡ':'kou','ㄎㄢ':'kan','ㄎㄣ':'ken','ㄎㄤ':'kang','ㄎㄥ':'keng',
            'ㄏㄨ':'hu','ㄏㄨㄚ':'hua','ㄏㄨㄛ':'huo','ㄏㄨㄞ':'huai','ㄏㄨㄟ':'hui','ㄏㄨㄢ':'huan','ㄏㄨㄣ':'hun','ㄏㄨㄤ':'huang','ㄏㄨㄥ':'hong',
            'ㄏㄚ':'ha','ㄏㄜ':'he','ㄏㄞ':'hai','ㄏㄟ':'hei','ㄏㄠ':'hao','ㄏㄡ':'hou','ㄏㄢ':'han','ㄏㄣ':'hen','ㄏㄤ':'hang','ㄏㄥ':'heng',
            'ㄐㄧ':'ji','ㄐㄧㄚ':'jia','ㄐㄧㄝ':'jie','ㄐㄧㄠ':'jiao','ㄐㄧㄡ':'jiu','ㄐㄧㄢ':'jian','ㄐㄧㄣ':'jin','ㄐㄧㄤ':'jiang','ㄐㄧㄥ':'jing',
            'ㄐㄩ':'ju','ㄐㄩㄝ':'jue','ㄐㄩㄢ':'juan','ㄐㄩㄣ':'jun','ㄐㄩㄥ':'jiong',
            'ㄑㄧ':'qi','ㄑㄧㄚ':'qia','ㄑㄧㄝ':'qie','ㄑㄧㄠ':'qiao','ㄑㄧㄡ':'qiu','ㄑㄧㄢ':'qian','ㄑㄧㄣ':'qin','ㄑㄧㄤ':'qiang','ㄑㄧㄥ':'qing',
            'ㄑㄩ':'qu','ㄑㄩㄝ':'que','ㄑㄩㄢ':'quan','ㄑㄩㄣ':'qun','ㄑㄩㄥ':'qiong',
            'ㄒㄧ':'xi','ㄒㄧㄚ':'xia','ㄒㄧㄝ':'xie','ㄒㄧㄠ':'xiao','ㄒㄧㄡ':'xiu','ㄒㄧㄢ':'xian','ㄒㄧㄣ':'xin','ㄒㄧㄤ':'xiang','ㄒㄧㄥ':'xing',
            'ㄒㄩ':'xu','ㄒㄩㄝ':'xue','ㄒㄩㄢ':'xuan','ㄒㄩㄣ':'xun','ㄒㄩㄥ':'xiong',
            'ㄓ':'zhi','ㄓㄨ':'zhu','ㄓㄨㄚ':'zhua','ㄓㄨㄛ':'zhuo','ㄓㄨㄞ':'zhuai','ㄓㄨㄟ':'zhui','ㄓㄨㄢ':'zhuan','ㄓㄨㄣ':'zhun','ㄓㄨㄤ':'zhuang','ㄓㄨㄥ':'zhong',
            'ㄓㄚ':'zha','ㄓㄜ':'zhe','ㄓㄞ':'zhai','ㄓㄟ':'zhei','ㄓㄠ':'zhao','ㄓㄡ':'zhou','ㄓㄢ':'zhan','ㄓㄣ':'zhen','ㄓㄤ':'zhang','ㄓㄥ':'zheng',
            'ㄔ':'chi','ㄔㄨ':'chu','ㄔㄨㄛ':'chuo','ㄔㄨㄞ':'chuai','ㄔㄨㄟ':'chui','ㄔㄨㄢ':'chuan','ㄔㄨㄣ':'chun','ㄔㄨㄤ':'chuang','ㄔㄨㄥ':'chong',
            'ㄔㄚ':'cha','ㄔㄜ':'che','ㄔㄞ':'chai','ㄔㄠ':'chao','ㄔㄡ':'chou','ㄔㄢ':'chan','ㄔㄣ':'chen','ㄔㄤ':'chang','ㄔㄥ':'cheng',
            'ㄕ':'shi','ㄕㄨ':'shu','ㄕㄨㄚ':'shua','ㄕㄨㄛ':'shuo','ㄕㄨㄞ':'shuai','ㄕㄨㄟ':'shui','ㄕㄨㄢ':'shuan','ㄕㄨㄣ':'shun','ㄕㄨㄤ':'shuang',
            'ㄕㄚ':'sha','ㄕㄜ':'she','ㄕㄞ':'shai','ㄕㄟ':'shei','ㄕㄠ':'shao','ㄕㄡ':'shou','ㄕㄢ':'shan','ㄕㄣ':'shen','ㄕㄤ':'shang','ㄕㄥ':'sheng',
            'ㄖ':'ri','ㄖㄨ':'ru','ㄖㄨㄛ':'ruo','ㄖㄨㄟ':'rui','ㄖㄨㄢ':'ruan','ㄖㄨㄣ':'run','ㄖㄨㄥ':'rong',
            'ㄖㄜ':'re','ㄖㄠ':'rao','ㄖㄡ':'rou','ㄖㄢ':'ran','ㄖㄣ':'ren','ㄖㄤ':'rang','ㄖㄥ':'reng',
            'ㄗ':'zi','ㄗㄨ':'zu','ㄗㄨㄛ':'zuo','ㄗㄨㄟ':'zui','ㄗㄨㄢ':'zuan','ㄗㄨㄣ':'zun','ㄗㄨㄥ':'zong',
            'ㄗㄚ':'za','ㄗㄜ':'ze','ㄗㄞ':'zai','ㄗㄟ':'zei','ㄗㄠ':'zao','ㄗㄡ':'zou','ㄗㄢ':'zan','ㄗㄣ':'zen','ㄗㄤ':'zang','ㄗㄥ':'zeng',
            'ㄘ':'ci','ㄘㄨ':'cu','ㄘㄨㄛ':'cuo','ㄘㄨㄟ':'cui','ㄘㄨㄢ':'cuan','ㄘㄨㄣ':'cun','ㄘㄨㄥ':'cong',
            'ㄘㄚ':'ca','ㄘㄜ':'ce','ㄘㄞ':'cai','ㄘㄠ':'cao','ㄘㄡ':'cou','ㄘㄢ':'can','ㄘㄣ':'cen','ㄘㄤ':'cang','ㄘㄥ':'ceng',
            'ㄙ':'si','ㄙㄨ':'su','ㄙㄨㄛ':'suo','ㄙㄨㄟ':'sui','ㄙㄨㄢ':'suan','ㄙㄨㄣ':'sun','ㄙㄨㄥ':'song',
            'ㄙㄚ':'sa','ㄙㄜ':'se','ㄙㄞ':'sai','ㄙㄠ':'sao','ㄙㄡ':'sou','ㄙㄢ':'san','ㄙㄣ':'sen','ㄙㄤ':'sang','ㄙㄥ':'seng',
            'ㄧ':'yi','ㄧㄚ':'ya','ㄧㄛ':'yo','ㄧㄝ':'ye','ㄧㄞ':'yai','ㄧㄠ':'yao','ㄧㄡ':'you',
            'ㄧㄢ':'yan','ㄧㄣ':'yin','ㄧㄤ':'yang','ㄧㄥ':'ying',
            'ㄨ':'wu','ㄨㄚ':'wa','ㄨㄛ':'wo','ㄨㄞ':'wai','ㄨㄟ':'wei','ㄨㄢ':'wan','ㄨㄣ':'wen','ㄨㄤ':'wang','ㄨㄥ':'weng',
            'ㄩ':'yu','ㄩㄝ':'yue','ㄩㄢ':'yuan','ㄩㄣ':'yun','ㄩㄥ':'yong',
            'ㄚ':'a','ㄜ':'e','ㄞ':'ai','ㄠ':'ao','ㄡ':'ou','ㄢ':'an','ㄣ':'en','ㄤ':'ang','ㄥ':'eng','ㄦ':'er'
        };

        // 反向表：拼音 → 注音陣列（處理一對多，如 nu→[ㄋㄨ,ㄋㄩ]）
        const fullPinyinToZhuyin = {};
        for (const [zy, py] of Object.entries(fullZhuyinToPinyin)) {
            if (!fullPinyinToZhuyin[py]) fullPinyinToZhuyin[py] = [];
            if (!fullPinyinToZhuyin[py].includes(zy)) fullPinyinToZhuyin[py].push(zy);
        }

        // 拼音聲母 → 注音聲母（保留，用於聲母偵測）
        const pinyinInitialToZhuyin = {
            'b': 'ㄅ', 'p': 'ㄆ', 'm': 'ㄇ', 'f': 'ㄈ',
            'd': 'ㄉ', 't': 'ㄊ', 'n': 'ㄋ', 'l': 'ㄌ',
            'g': 'ㄍ', 'k': 'ㄎ', 'h': 'ㄏ',
            'j': 'ㄐ', 'q': 'ㄑ', 'x': 'ㄒ',
            'zh': 'ㄓ', 'ch': 'ㄔ', 'sh': 'ㄕ', 'r': 'ㄖ',
            'z': 'ㄗ', 'c': 'ㄘ', 's': 'ㄙ'
        };

        // ==================== 借韻表（附件一 §II）====================
        // 搜尋左側韻母時，同時匹配右側所有韻母（單向展開）
        // 每個韻母獨立成一個顏色群組，在同聲韻並列時分色顯示
        const BORROW_MAP = {
            'ㄧ':   ['ㄧ'],
            'ㄨ':   ['ㄨ'],
            'ㄩ':   ['ㄩ'],
            'ㄚ':   ['ㄚ', 'ㄧㄚ', 'ㄨㄚ'],
            'ㄛ':   ['ㄛ', 'ㄡ', 'ㄧㄛ', 'ㄧㄡ', 'ㄨㄛ'],
            'ㄜ':   ['ㄜ', 'ㄦ'],
            'ㄝ':   ['ㄝ', 'ㄟ', 'ㄧㄝ', 'ㄩㄝ', 'ㄨㄟ'],
            'ㄞ':   ['ㄞ', 'ㄧㄞ', 'ㄨㄞ'],
            'ㄟ':   ['ㄟ', 'ㄝ', 'ㄨㄟ', 'ㄧㄝ', 'ㄩㄝ'],
            'ㄠ':   ['ㄠ', 'ㄧㄠ'],
            'ㄡ':   ['ㄡ', 'ㄛ', 'ㄧㄛ', 'ㄧㄡ', 'ㄨㄛ'],
            'ㄢ':   ['ㄢ', 'ㄨㄢ'],
            'ㄣ':   ['ㄣ', 'ㄨㄣ', 'ㄥ'],
            'ㄤ':   ['ㄤ', 'ㄧㄤ', 'ㄨㄤ'],
            'ㄥ':   ['ㄥ', 'ㄣ'],
            'ㄦ':   ['ㄦ', 'ㄜ'],
            'ㄩㄢ': ['ㄩㄢ', 'ㄧㄢ'],
            'ㄧㄢ': ['ㄧㄢ', 'ㄩㄢ'],
            'ㄧㄣ': ['ㄧㄣ', 'ㄧㄥ', 'ㄩㄣ'],
            'ㄧㄥ': ['ㄧㄥ', 'ㄧㄣ', 'ㄩㄣ'],
            'ㄨㄥ': ['ㄨㄥ', 'ㄩㄥ'],
            'ㄩㄥ': ['ㄩㄥ', 'ㄨㄥ'],
        };

        // 韻母家族（子音搜尋 + 同聲韻並列時，同一家族共用顏色）
        const RHYME_FAMILIES = [
            { id: 0,  label: 'ㄧ',    rhymes: new Set(['ㄧ']) },
            { id: 1,  label: 'ㄨ',    rhymes: new Set(['ㄨ']) },
            { id: 2,  label: 'ㄩ',    rhymes: new Set(['ㄩ']) },
            { id: 3,  label: 'ㄚ',    rhymes: new Set(['ㄚ', 'ㄧㄚ', 'ㄨㄚ']) },
            { id: 4,  label: 'ㄛ',    rhymes: new Set(['ㄛ', 'ㄡ', 'ㄧㄛ', 'ㄧㄡ', 'ㄨㄛ']) },
            { id: 5,  label: 'ㄜ',    rhymes: new Set(['ㄜ', 'ㄦ']) },
            { id: 6,  label: 'ㄝ',    rhymes: new Set(['ㄝ', 'ㄟ', 'ㄧㄝ', 'ㄩㄝ', 'ㄨㄟ']) },
            { id: 7,  label: 'ㄞ',    rhymes: new Set(['ㄞ', 'ㄧㄞ', 'ㄨㄞ']) },
            { id: 8,  label: 'ㄠ',    rhymes: new Set(['ㄠ', 'ㄧㄠ']) },
            { id: 9,  label: 'ㄢ',    rhymes: new Set(['ㄢ', 'ㄨㄢ']) },
            { id: 10, label: 'ㄧㄢ',  rhymes: new Set(['ㄧㄢ', 'ㄩㄢ']) },
            { id: 11, label: 'ㄣ',    rhymes: new Set(['ㄣ', 'ㄨㄣ']) },
            { id: 12, label: 'ㄥ',    rhymes: new Set(['ㄥ']) },
            { id: 13, label: 'ㄧㄣ',  rhymes: new Set(['ㄧㄣ', 'ㄧㄥ', 'ㄩㄣ']) },
            { id: 14, label: 'ㄤ',    rhymes: new Set(['ㄤ', 'ㄧㄤ', 'ㄨㄤ']) },
            { id: 15, label: 'ㄨㄥ',  rhymes: new Set(['ㄨㄥ', 'ㄩㄥ']) },
        ];
        // 快速查表：韻母 → 家族 id
        const RHYME_TO_FAMILY = {};
        RHYME_FAMILIES.forEach(f => f.rhymes.forEach(r => RHYME_TO_FAMILY[r] = f.id));

        // 拼音韻母 → 注音韻母對照（附件一 §I）
        // 翻譯後走注音搜尋流程（含借韻展開）
        const PINYIN_RHYME_MAP = {
            'i': 'ㄧ', 'y': 'ㄧ',
            'u': 'ㄨ', 'w': 'ㄨ',
            'v': 'ㄩ',
            'a': 'ㄚ', 'o': 'ㄛ', 'e': 'ㄜ',
            'ai': 'ㄞ', 'ei': 'ㄟ',  'ㄝ': 'ê',
            'ao': 'ㄠ', 'ou': 'ㄡ',
            'an': 'ㄢ', 'en': 'ㄣ', 'ang': 'ㄤ', 'eng': 'ㄥ',
            'er': 'ㄦ', 'ong': 'ㄨㄥ',
            'ia': 'ㄧㄚ', 'ie': 'ㄧㄝ', 'iao': 'ㄧㄠ', 'iu': 'ㄧㄡ',
            'ian': 'ㄧㄢ', 'in': 'ㄧㄣ', 'iang': 'ㄧㄤ', 'ing': 'ㄧㄥ',
            'ua': 'ㄨㄚ', 'uai': 'ㄨㄞ', 'ui': 'ㄨㄟ',
            'uang': 'ㄨㄤ', 'ue': 'ㄩㄝ', 'iong': 'ㄩㄥ',
        };

        // 注音聲母 → 拼音聲母（用於同聲韻並列子音標籤）
        const zhuyinInitialToPinyin = {};
        for (const [py, zy] of Object.entries(pinyinInitialToZhuyin)) {
            zhuyinInitialToPinyin[zy] = py;
        }

        // 注音韻母 → 拼音韻母標籤（用於同聲韻並列分組標題）
        // 顯示的是韻母部分（不含聲母），所以 ㄧㄚ→ia 而非 ya
        const rhymeToPinyinLabel = {};
        for (const [py, zy] of Object.entries(PINYIN_RHYME_MAP)) {
            rhymeToPinyinLabel[zy] = py;
        }
        // 補充 PINYIN_RHYME_MAP 中未涵蓋的韻母 + 修正重複映射
        Object.assign(rhymeToPinyinLabel, {
            'ㄧ': 'i', 'ㄨ': 'u', 'ㄩ': 'ü',  // 覆蓋 y/w/v
            'ㄧㄛ': 'io', 'ㄧㄞ': 'yai',
            'ㄨㄛ': 'uo', 'ㄨㄢ': 'uan', 'ㄨㄣ': 'un',
            'ㄩㄢ': 'üan', 'ㄩㄣ': 'ün',
            'ㄛ': 'o', 'ㄝ': 'ê', 'ㄟ': 'ei',
        });

        // 拼音特殊搜尋（附件一 §III：一對多，需分韻母組上色）
        // 只保留 ng, uan, un（ang/eng/ong 走 PINYIN_RHYME_MAP + 借韻即可）
        const PINYIN_SPECIAL = {
            'ng': [
                { label: 'ang', rhymes: ['ㄤ', 'ㄧㄤ', 'ㄨㄤ'] },
                { label: 'ong', rhymes: ['ㄨㄥ', 'ㄩㄥ'] },
                { label: 'ing', rhymes: ['ㄧㄥ', 'ㄧㄣ', 'ㄩㄣ'] },
                { label: 'eng', rhymes: ['ㄥ', 'ㄣ'] },
            ],
            'uan': [
                { label: 'uan', rhymes: ['ㄨㄢ'] },
                { label: 'üan', rhymes: ['ㄩㄢ', 'ㄧㄢ'] },
            ],
            'un': [
                { label: 'un', rhymes: ['ㄨㄣ'] },
                { label: 'ün', rhymes: ['ㄩㄣ'] },
            ],
        };

