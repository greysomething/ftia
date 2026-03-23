/**
 * MySQL connection helper for migration scripts.
 * Uses Local WP's bundled MySQL with socket auth.
 */
import { execSync } from 'child_process'

const MYSQL_BIN = process.env.MYSQL_BIN ??
  '/Users/greysomething/Library/Application Support/Local/lightning-services/mysql-8.0.35+4/bin/darwin/bin/mysql'
const MYSQL_SOCKET = process.env.MYSQL_SOCKET ??
  '/Users/greysomething/Library/Application Support/Local/run/2W0rfPpDJ/mysql/mysqld.sock'
const MYSQL_DB = process.env.MYSQL_DB ?? 'local'
const MYSQL_USER = process.env.MYSQL_USER ?? 'root'
const MYSQL_PASSWORD = process.env.MYSQL_PASSWORD ?? 'root'

export function mysql(sql: string): any[] {
  const escaped = sql.replace(/'/g, `'\\''`)
  const cmd = `"${MYSQL_BIN}" -u${MYSQL_USER} -p${MYSQL_PASSWORD} --protocol=socket -S "${MYSQL_SOCKET}" --default-character-set=utf8mb4 ${MYSQL_DB} --batch --raw -e '${escaped}'`
  try {
    // Strip MYSQL_HOST / MYSQL_TCP_PORT from env so they don't override socket
    const cleanEnv = { ...process.env }
    delete cleanEnv.MYSQL_HOST
    delete cleanEnv.MYSQL_TCP_PORT
    const out = execSync(cmd, { maxBuffer: 512 * 1024 * 1024, env: cleanEnv }).toString()
    if (!out.trim()) return []
    const lines = out.split('\n').filter(Boolean)
    if (lines.length < 2) return []
    const headers = lines[0].split('\t')
    return lines.slice(1).map((line) => {
      const cols = line.split('\t')
      const row: Record<string, string> = {}
      headers.forEach((h, i) => { row[h] = cols[i] ?? '' })
      return row
    })
  } catch (err: any) {
    throw new Error(`MySQL error: ${err.message}`)
  }
}

/**
 * Unserialize PHP serialized data (handles strings, arrays, nested).
 * Returns parsed JS value or null on failure.
 */
export function unserializePhp(str: string): any {
  if (!str || str === 'N;') return null
  try {
    return phpUnserialize(str)
  } catch {
    return null
  }
}

function phpUnserialize(str: string, offset = { pos: 0 }): any {
  const type = str[offset.pos]
  offset.pos += 2 // skip 'X:'

  switch (type) {
    case 'N': return null
    case 'b': {
      const v = str[offset.pos]
      offset.pos += 2
      return v === '1'
    }
    case 'i': {
      const end = str.indexOf(';', offset.pos)
      const v = parseInt(str.slice(offset.pos, end), 10)
      offset.pos = end + 1
      return v
    }
    case 'd': {
      const end = str.indexOf(';', offset.pos)
      const v = parseFloat(str.slice(offset.pos, end))
      offset.pos = end + 1
      return v
    }
    case 's': {
      const lenEnd = str.indexOf(':', offset.pos)
      const len = parseInt(str.slice(offset.pos, lenEnd), 10)
      offset.pos = lenEnd + 2 // skip 'LEN:"'
      const v = str.slice(offset.pos, offset.pos + len)
      offset.pos += len + 2 // skip '";'
      return v
    }
    case 'a': {
      const countEnd = str.indexOf(':', offset.pos)
      const count = parseInt(str.slice(offset.pos, countEnd), 10)
      offset.pos = countEnd + 2 // skip 'COUNT:{'
      const result: any[] | Record<string, any> = []
      let isAssoc = false
      const pairs: [any, any][] = []
      for (let i = 0; i < count; i++) {
        const key = phpUnserialize(str, offset)
        const val = phpUnserialize(str, offset)
        pairs.push([key, val])
        if (typeof key === 'string') isAssoc = true
      }
      offset.pos += 1 // skip '}'
      if (isAssoc) {
        const obj: Record<string, any> = {}
        for (const [k, v] of pairs) obj[String(k)] = v
        return obj
      }
      return pairs.map(([, v]) => v)
    }
    default:
      throw new Error(`Unknown PHP type: ${type}`)
  }
}
