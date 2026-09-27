/**
 * Coordinated Logic + Memory reply engine.
 */

export interface IncomingMessage {
  id: string
  text: string
  timestamp: number
}

export interface ReplyResult {
  text: string
  actions: Array<'like_shared' | 'react_heart' | 'none'>
  matchedLogic?: string
}

const GREETINGS = ['سلام', 'salam', 'hi', 'hello', 'درود', 'هی', 'hey']
const THANKS_KEYS = ['ممنون', 'مرسی', 'تشکر', 'thanks', 'thank', 'دمت']
const NAME_KEYS = ['اسمت', 'اسم شما', 'اسمتون', 'کی هستی', 'your name', 'نامت', 'اسمت چیه']
const HOW_ARE_YOU = [
  'حالت',
  'چطوری',
  'خوبی',
  'چطوره',
  'اوضاع',
  'how are you',
  'how r u',
  "what's up"
]
const PRICE_KEYS = ['قیمت', 'چنده', 'چند', 'price', 'هزینه', 'چقدر']
const POST_KEYS = [
  'پست',
  'ریلز',
  'reel',
  'photo',
  'عکس',
  'ویدیو',
  'media',
  'attachment',
  'فرستاد',
  'shared_post',
  'sticker',
  'استیکر'
]

function normalize(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[؟?!.،,\[\]]/g, ' ')
    .replace(/\s+/g, ' ')
}

function linesOf(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

export interface LogicRule {
  raw: string
  condition: string
  action: string
}

export function parseLogicRules(logic: string): LogicRule[] {
  const rules: LogicRule[] = []
  for (const line of linesOf(logic)) {
    if (line.startsWith('#') || line.startsWith('//')) continue

    let m =
      line.match(/^اگر\s+(.+?)\s+(?:آنگاه|آن\s*گاه|پس|→|->|:)\s*(.+)$/i) ||
      line.match(/^if\s+(.+?)\s+then\s+(.+)$/i) ||
      line.match(/^(.+?)\s*(?:=>|→|->)\s*(.+)$/)

    if (!m) m = line.match(/^اگر\s+(.+?)\s+[،,]\s*(.+)$/i)

    if (m) {
      rules.push({ raw: line, condition: m[1].trim(), action: m[2].trim() })
      continue
    }

    // lines that mention react / heart without formal syntax
    if (/react|ری.?اکت|قلب|heart|لایک/i.test(line) && /پست|attachment|فرستاد|media/i.test(line)) {
      rules.push({
        raw: line,
        condition: 'پست فرستاد attachment',
        action: line
      })
      continue
    }

    if (line.length <= 80 && !/خودمونی|دوستانه|گرم برخورد/i.test(line)) {
      rules.push({ raw: line, condition: line, action: 'از حافظه جواب بده' })
    }
  }
  return rules
}

function conditionMatches(condition: string, incoming: string): boolean {
  const c = normalize(condition)
  const q = normalize(incoming)
  if (!c || !q) return false

  const checks: Array<{ keys: string[]; aliases: string[] }> = [
    { keys: ['حال', 'احوال', 'خوبی', 'چطوری'], aliases: HOW_ARE_YOU },
    { keys: POST_KEYS, aliases: POST_KEYS },
    { keys: ['قیمت', 'چنده', 'هزینه'], aliases: PRICE_KEYS },
    { keys: ['سلام', 'احوالپرسی'], aliases: GREETINGS },
    { keys: ['اسم', 'کی هستی'], aliases: NAME_KEYS },
    { keys: ['ممنون', 'تشکر'], aliases: THANKS_KEYS }
  ]

  for (const bag of checks) {
    if (bag.keys.some((k) => c.includes(normalize(k)))) {
      if (
        bag.aliases.some((a) => q.includes(normalize(a))) ||
        bag.keys.some((k) => q.includes(normalize(k)))
      ) {
        return true
      }
    }
  }

  const stop = new Set([
    'اگر',
    'آنگاه',
    'آن',
    'گاه',
    'پس',
    'را',
    'رو',
    'به',
    'از',
    'با',
    'که',
    'و',
    'یا',
    'the',
    'a',
    'and',
    'then',
    'if',
    'form',
    'sender',
    'with'
  ])
  const words = c.split(' ').filter((w) => w.length > 2 && !stop.has(w))
  if (!words.length) return false
  let hits = 0
  for (const w of words) {
    if (q.includes(w)) hits++
  }
  return words.length <= 3 ? hits >= 1 : hits >= 2
}

function findNameLine(memoryLines: string[]): string | null {
  for (const line of memoryLines) {
    const n = normalize(line)
    if (n.includes('اسم') || /^من\s+\S+/.test(n) || n.includes('هستم')) {
      if (line.length < 80) return line
    }
  }
  if (memoryLines[0] && memoryLines[0].length < 60) return memoryLines[0]
  return null
}

function relevantMemory(memory: string, incoming: string): string[] {
  const lines = linesOf(memory)
  if (!lines.length) return []
  const q = normalize(incoming)
  const words = q.split(' ').filter((w) => w.length > 1)
  const scored = lines.map((line) => {
    const ln = normalize(line)
    let score = 0
    for (const w of words) if (ln.includes(w)) score += 2
    if (PRICE_KEYS.some((k) => q.includes(k)) && PRICE_KEYS.some((k) => ln.includes(k))) score += 4
    return { line, score }
  })
  return scored
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((x) => x.line)
}

function isPostLikeIncoming(incoming: string): boolean {
  const q = normalize(incoming)
  return (
    q.includes('shared_post') ||
    q.includes('attachment') ||
    POST_KEYS.some((k) => q.includes(normalize(k)))
  )
}

function applyActionTemplate(
  action: string,
  memory: string,
  incoming: string
): { text: string; actions: ReplyResult['actions'] } {
  const a = normalize(action)
  const mem = linesOf(memory)
  const actions: ReplyResult['actions'] = []

  // React / heart / like on post
  if (/react|ری.?اکت|قلب|heart|استیکر|sticker|لایک|like/i.test(action)) {
    if (/heart|قلب|❤️|❤|استیکر|sticker|react/i.test(action)) {
      actions.push('react_heart')
    } else {
      actions.push('like_shared')
    }
  }

  if (/تشکر|ممنون|احوال|بپرس|حال/.test(a) || HOW_ARE_YOU.some((k) => normalize(incoming).includes(k))) {
    const thanks = pick(['مرسی که احوال پرسیدی 🌟', 'ممنون از لطف‌تون 🌸', 'خیلی لطف کردید ✨'])
    const ask = pick(['شما چطورید؟', 'امیدوارم حال خودتون عالی باشه، شما چطورید؟', 'اوضاع شما چطوره؟'])
    const identity = findNameLine(mem)
    return {
      text: identity ? `${thanks}\n${identity}\n${ask}` : `${thanks}\n${ask}`,
      actions: actions.length ? actions : ['none']
    }
  }

  if (/سلام|خوش.?آمد|خوش آمد/.test(a)) {
    const name = findNameLine(mem)
    return {
      text: name ? `سلام 👋\n${name}` : 'سلام 👋 خوش اومدید!',
      actions: actions.length ? actions : ['none']
    }
  }

  // Pure react action on post — short warm text optional
  if (actions.includes('react_heart') || actions.includes('like_shared')) {
    const warm = pick(['عالی بود 🔥', 'دمت گرم ✨', '👏 عالیه', 'خیلی قشنگ بود ❤️'])
    return { text: warm, actions }
  }

  if (/حافظه|memory|قیمت|بگو|جواب/.test(a)) {
    const rel = relevantMemory(memory, incoming)
    if (rel.length) return { text: rel.join('\n'), actions: actions.length ? actions : ['none'] }
    if (mem[0]) return { text: mem[0], actions: actions.length ? actions : ['none'] }
  }

  if (action.length > 6 && !/^اگر\s/.test(action) && !/^(از حافظه)/.test(action)) {
    // skip pure English react instructions as reply text
    if (/react to message|heart stiker|heart sticker/i.test(action)) {
      return {
        text: pick(['عالی بود 🔥', 'دمت گرم ✨', '❤️']),
        actions: actions.length ? actions : ['react_heart']
      }
    }
    const rel = relevantMemory(memory, incoming)
    if (rel.length) return { text: `${action}\n${rel[0]}`, actions: actions.length ? actions : ['none'] }
    return { text: action, actions: actions.length ? actions : ['none'] }
  }

  const rel = relevantMemory(memory, incoming)
  if (rel.length) return { text: rel.join('\n'), actions: actions.length ? actions : ['none'] }
  return {
    text: mem[0] ? `${mem[0]}\nپیامتون رو دیدم ✅` : 'پیامتون رو دیدم ✅',
    actions: actions.length ? actions : ['none']
  }
}

export function generateSmartReply(
  incomingText: string,
  memory: string,
  logic: string
): ReplyResult {
  const text = incomingText.trim()
  const q = normalize(text)
  const memLines = linesOf(memory)
  const rules = parseLogicRules(logic)

  for (const rule of rules) {
    if (conditionMatches(rule.condition, text)) {
      const applied = applyActionTemplate(rule.action, memory, text)
      return {
        text: applied.text,
        actions: applied.actions,
        matchedLogic: rule.raw
      }
    }
  }

  // Built-in: shared post without explicit rule still hearts if logic mentions react globally
  if (isPostLikeIncoming(text)) {
    const reactRule = rules.find((r) => /react|قلب|heart|لایک|like/i.test(r.action))
    if (reactRule) {
      const applied = applyActionTemplate(reactRule.action, memory, text)
      return { ...applied, matchedLogic: reactRule.raw }
    }
  }

  if (GREETINGS.some((g) => q === g || q.startsWith(g + ' '))) {
    const name = findNameLine(memLines)
    return {
      text: name ? `سلام 👋\n${name}` : 'سلام 👋 خوش اومدید!',
      actions: ['none']
    }
  }

  if (HOW_ARE_YOU.some((k) => q.includes(k))) {
    return applyActionTemplate('تشکر کن و احوال بپرس', memory, text)
  }

  if (NAME_KEYS.some((k) => q.includes(normalize(k))) || /\bاسم/.test(q)) {
    const name = findNameLine(memLines)
    return { text: name || 'من دستیار همین صفحه هستم 😊', actions: ['none'] }
  }

  if (THANKS_KEYS.some((k) => q.includes(k))) {
    return {
      text: pick(['خواهش می‌کنم 🌟', 'قابلی نداشت 🌸', 'مرسی از لطف‌تون ✨']),
      actions: ['none']
    }
  }

  const rel = relevantMemory(memory, text)
  if (rel.length) {
    return {
      text: pick([
        `حتماً 🌿\n${rel.join('\n')}`,
        `با کمال میل ✨\n${rel.join('\n')}`,
        rel.join('\n')
      ]),
      actions: ['none']
    }
  }

  if (memLines[0]) {
    return {
      text: `${memLines[0]}\nپیامتون رو دیدم ✅ اگر سوالی دارید بپرسید.`,
      actions: ['none']
    }
  }

  return { text: 'پیامتون رو دیدم ✅', actions: ['none'] }
}

export function generateReply(incomingText: string, memory: string, logic = ''): string {
  return generateSmartReply(incomingText, memory, logic).text
}

export function generateCommentReply(incomingText: string, memory: string, logic = ''): string {
  const full = generateSmartReply(incomingText, memory, logic).text
  const parts = full.split('\n').filter(Boolean)
  if (parts.length <= 2) return full.slice(0, 220)
  return parts.slice(0, 2).join(' — ').slice(0, 220)
}
