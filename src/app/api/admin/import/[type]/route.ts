import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import path from 'path'
import { spawnSync } from 'child_process'

const SCRIPT_MAP: Record<string, string> = {
  taxonomy:    'migrate-taxonomy.ts',
  productions: 'migrate-productions.ts',
  contacts:    'migrate-contacts.ts',
  crew:        'migrate-crew.ts',
  relations:   'migrate-relations.ts',
  blog:        'migrate-blog.ts',
  pages:       'migrate-pages.ts',
  media:       'migrate-media.ts',
  users:       'migrate-users.ts',
  memberships: 'migrate-memberships.ts',
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ type: string }> },
) {
  try {
    await requireAdmin()
  } catch {
    return NextResponse.json({ success: false, output: 'Unauthorized' }, { status: 403 })
  }

  const { type } = await params
  const scriptFile = SCRIPT_MAP[type]
  if (!scriptFile) {
    return NextResponse.json({ success: false, output: `Unknown import type: ${type}` }, { status: 400 })
  }

  const projectRoot = path.resolve(process.cwd())
  const scriptPath = path.join(projectRoot, 'scripts', 'migration', scriptFile)
  const tsconfigPath = path.join(projectRoot, 'tsconfig.scripts.json')

  const result = spawnSync(
    'npx',
    ['ts-node', '--project', tsconfigPath, '--transpile-only', scriptPath],
    {
      cwd: projectRoot,
      timeout: 5 * 60 * 1000, // 5 minutes
      env: { ...process.env },
      encoding: 'utf8',
    }
  )

  const output = [result.stdout, result.stderr].filter(Boolean).join('\n')
  const success = result.status === 0

  return NextResponse.json({ success, output: output || '(no output)' })
}
