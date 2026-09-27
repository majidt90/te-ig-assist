/**
 * Rule-based reply engine.
 * Uses the user-defined "memory" text as knowledge base.
 * Phase-1: heuristics + keyword matching (no external LLM).
 */

export interface IncomingMessage {
  id: string
  text: string
  timestamp: number
}

const GREETINGS = ['سلام', 'salam', 'hi', 'hello', 'درود', 'هی', 'hey']
const PRICE_KEYS = ['قیمت', 'چنده', 'چند', 'price', 'هزینه', 'چقدر']
const TIME_KEYS = ['ساعت', 'باز', 'بسته', 'وقت', 'کاری', 'hours', 'open']
const THANKS_KEYS = ['ممنون', 'مرسی', 'تشکر', 'thanks', 'thank']

function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ')
}

function memoryLines(memory: string): string[] {
  return memory
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
}

function findRelevantLines(memory: string, incoming: string): string[] {
  const lines = memoryLines(memory)
  if (lines.length === 0) return []

  const q = normalize(incoming)
  const words = q.split(' ').filter((w) => w.length > 2)

  const scored = lines.map((line) => {
    const ln = normalize(line)
    let score = 0
    for (const w of words) {
      if (ln.includes(w)) score += 2
    }
    // boost common intents
    if (PRICE_KEYS.some((k) => q.includes(k)) && PRICE_KEYS.some((k) => ln.includes(k))) score += 3
    if (TIME_KEYS.some((k) => q.includes(k)) && TIME_KEYS.some((k) => ln.includes(k))) score += 3
    return { line, score }
  })

  return scored
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((x) => x.line)
}

/**
 * Generate a Persian reply based on memory + incoming text.
 */
export function generateReply(incomingText: string, memory: string): string {
  const text = incomingText.trim()
  const q = normalize(text)
  const lines = memoryLines(memory)

  // Greeting
  if (GREETINGS.some((g) => q === g || q.startsWith(g + ' ') || q.startsWith(g + '!'))) {
    const intro = lines[0] ? `سلام 👋\n${lines[0]}` : 'سلام 👋 خوش اومدید! چطور می‌تونم کمکتون کنم؟'
    return intro
  }

  // Thanks
  if (THANKS_KEYS.some((k) => q.includes(k))) {
    return 'خواهش می‌کنم 🌟 اگر سوال دیگه‌ای داشتید در خدمتم.'
  }

  // Memory-driven answer
  if (lines.length > 0) {
    const relevant = findRelevantLines(memory, text)
    if (relevant.length > 0) {
      return relevant.join('\n')
    }

    // Generic helpful reply with memory context hint
    if (PRICE_KEYS.some((k) => q.includes(k))) {
      const priceLine = lines.find((l) => PRICE_KEYS.some((k) => normalize(l).includes(k)))
      if (priceLine) return priceLine
      return 'برای اعلام دقیق قیمت، لطفاً بفرمایید کدوم محصول مدنظرتونه؟'
    }

    if (TIME_KEYS.some((k) => q.includes(k))) {
      const timeLine = lines.find((l) => TIME_KEYS.some((k) => normalize(l).includes(k)))
      if (timeLine) return timeLine
    }

    // Fallback: short polite + first memory line as context
    return `پیامتون رو دریافت کردم ✅\n${lines[0]}\nاگر جزئیات بیشتری بفرستید بهتر راهنمایی می‌کنم.`
  }

  // No memory configured
  return 'سلام، پیام شما دریافت شد. به زودی پاسخ می‌دیم 🌸'
}
