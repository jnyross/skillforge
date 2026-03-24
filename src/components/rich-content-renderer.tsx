'use client'

import { useState } from 'react'
import { Code, FileJson, FileText, ChevronDown, ChevronRight, Copy, Check } from 'lucide-react'

interface RichContentRendererProps {
  content: string
  maxHeight?: string
}

function detectContentType(content: string): 'json' | 'code' | 'diff' | 'markdown' | 'text' {
  const trimmed = content.trim()
  
  // JSON detection
  if ((trimmed.startsWith('{') && trimmed.endsWith('}')) ||
      (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
    try {
      JSON.parse(trimmed)
      return 'json'
    } catch { /* not json */ }
  }
  
  // Diff detection (avoid matching YAML frontmatter '---' or markdown horizontal rules)
  if (trimmed.startsWith('diff --git') || 
      /^---\s+a\//.test(trimmed) || /^@@\s/.test(trimmed)) {
    return 'diff'
  }
  
  // Code detection (common patterns)
  if (/^(import|export|const|let|var|function|class|def|from|require)\s/m.test(trimmed) ||
      /^(```|~~~)/.test(trimmed)) {
    return 'code'
  }
  
  // Markdown detection
  if (/^#{1,6}\s/m.test(trimmed) || /^\*{1,3}\s/m.test(trimmed) || 
      /^-\s/m.test(trimmed) || /\[.+\]\(.+\)/.test(trimmed)) {
    return 'markdown'
  }
  
  return 'text'
}

function JsonRenderer({ content }: { content: string }) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  
  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch {
    return <pre className="text-sm font-mono whitespace-pre-wrap">{content}</pre>
  }
  
  const togglePath = (path: string) => {
    setCollapsed(prev => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }
  
  const renderValue = (value: unknown, path: string, indent: number): React.ReactNode => {
    if (value === null) return <span className="text-gray-500">null</span>
    if (typeof value === 'boolean') return <span className="text-amber-400">{String(value)}</span>
    if (typeof value === 'number') return <span className="text-blue-400">{value}</span>
    if (typeof value === 'string') return <span className="text-green-400">&quot;{value}&quot;</span>
    
    if (Array.isArray(value)) {
      if (value.length === 0) return <span className="text-gray-500">[]</span>
      const isCollapsed = collapsed.has(path)
      return (
        <span>
          <button onClick={() => togglePath(path)} className="inline text-muted-foreground hover:text-foreground">
            {isCollapsed ? <ChevronRight className="h-3 w-3 inline" /> : <ChevronDown className="h-3 w-3 inline" />}
          </button>
          {'['}
          {isCollapsed ? (
            <span className="text-muted-foreground">{value.length} items</span>
          ) : (
            <>
              {value.map((item, i) => (
                <div key={i} style={{ paddingLeft: `${(indent + 1) * 16}px` }}>
                  {renderValue(item, `${path}[${i}]`, indent + 1)}
                  {i < value.length - 1 && ','}
                </div>
              ))}
            </>
          )}
          {!isCollapsed && <div style={{ paddingLeft: `${indent * 16}px` }}>{']'}</div>}
          {isCollapsed && ']'}
        </span>
      )
    }
    
    if (typeof value === 'object') {
      const entries = Object.entries(value as Record<string, unknown>)
      if (entries.length === 0) return <span className="text-gray-500">{'{}'}</span>
      const isCollapsed = collapsed.has(path)
      return (
        <span>
          <button onClick={() => togglePath(path)} className="inline text-muted-foreground hover:text-foreground">
            {isCollapsed ? <ChevronRight className="h-3 w-3 inline" /> : <ChevronDown className="h-3 w-3 inline" />}
          </button>
          {'{'}
          {isCollapsed ? (
            <span className="text-muted-foreground">{entries.length} keys</span>
          ) : (
            <>
              {entries.map(([key, val], i) => (
                <div key={key} style={{ paddingLeft: `${(indent + 1) * 16}px` }}>
                  <span className="text-purple-400">&quot;{key}&quot;</span>
                  <span className="text-muted-foreground">: </span>
                  {renderValue(val, `${path}.${key}`, indent + 1)}
                  {i < entries.length - 1 && ','}
                </div>
              ))}
            </>
          )}
          {!isCollapsed && <div style={{ paddingLeft: `${indent * 16}px` }}>{'}'}</div>}
          {isCollapsed && '}'}
        </span>
      )
    }
    
    return <span>{String(value)}</span>
  }
  
  return (
    <pre className="text-sm font-mono overflow-x-auto">
      {renderValue(parsed, 'root', 0)}
    </pre>
  )
}

function DiffRenderer({ content }: { content: string }) {
  const lines = content.split('\n')
  return (
    <pre className="text-sm font-mono overflow-x-auto">
      {lines.map((line, i) => {
        let className = ''
        if (line.startsWith('+') && !line.startsWith('+++')) className = 'text-green-400 bg-green-500/10'
        else if (line.startsWith('-') && !line.startsWith('---')) className = 'text-red-400 bg-red-500/10'
        else if (line.startsWith('@@')) className = 'text-blue-400 bg-blue-500/10'
        else if (line.startsWith('diff')) className = 'text-amber-400 font-bold'
        return (
          <div key={i} className={`px-2 ${className}`}>
            {line}
          </div>
        )
      })}
    </pre>
  )
}

function CodeRenderer({ content }: { content: string }) {
  // Strip markdown code fences if present
  let code = content
  const fenceMatch = code.match(/^```(\w*)\n([\s\S]*?)\n```$/m)
  if (fenceMatch) {
    code = fenceMatch[2]
  }
  
  return (
    <pre className="text-sm font-mono overflow-x-auto">
      {code.split('\n').map((line, i) => (
        <div key={i} className="px-2">
          <span className="text-muted-foreground select-none mr-3 text-xs">{String(i + 1).padStart(3)}</span>
          {line}
        </div>
      ))}
    </pre>
  )
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function MarkdownRenderer({ content }: { content: string }) {
  // Simple markdown rendering — headings, bold, italic, code, lists
  const lines = content.split('\n')
  return (
    <div className="prose prose-sm prose-invert max-w-none space-y-1">
      {lines.map((line, i) => {
        // Heading
        const headingMatch = line.match(/^(#{1,6})\s+(.+)/)
        if (headingMatch) {
          const level = headingMatch[1].length
          const text = headingMatch[2]
          const sizes = ['text-xl font-bold', 'text-lg font-bold', 'text-base font-semibold', 'text-sm font-semibold', 'text-sm font-medium', 'text-xs font-medium']
          return <div key={i} className={sizes[level - 1] || sizes[0]}>{text}</div>
        }
        // List item
        if (/^[-*]\s/.test(line)) {
          return <div key={i} className="pl-4">• {line.slice(2)}</div>
        }
        // Numbered list
        const numMatch = line.match(/^(\d+)\.\s(.+)/)
        if (numMatch) {
          return <div key={i} className="pl-4">{numMatch[1]}. {numMatch[2]}</div>
        }
        // Inline code fenced block start/end
        if (line.startsWith('```')) {
          return <div key={i} className="text-muted-foreground text-xs">---</div>
        }
        // Empty line
        if (!line.trim()) return <div key={i} className="h-2" />
        // Regular text with inline formatting (escape HTML first to prevent XSS)
        const escaped = escapeHtml(line)
        const formatted = escaped
          .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
          .replace(/\*(.+?)\*/g, '<em>$1</em>')
          .replace(/`(.+?)`/g, '<code class="px-1 py-0.5 bg-secondary rounded text-xs font-mono">$1</code>')
        return <div key={i} dangerouslySetInnerHTML={{ __html: formatted }} />
      })}
    </div>
  )
}

export function RichContentRenderer({ content, maxHeight = '400px' }: RichContentRendererProps) {
  const [copied, setCopied] = useState(false)
  const [viewMode, setViewMode] = useState<'auto' | 'raw'>('auto')
  const contentType = detectContentType(content)
  
  const copyToClipboard = async () => {
    await navigator.clipboard.writeText(content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  
  const typeLabels: Record<string, { label: string; icon: React.ReactNode }> = {
    json: { label: 'JSON', icon: <FileJson className="h-3 w-3" /> },
    code: { label: 'Code', icon: <Code className="h-3 w-3" /> },
    diff: { label: 'Diff', icon: <Code className="h-3 w-3" /> },
    markdown: { label: 'Markdown', icon: <FileText className="h-3 w-3" /> },
    text: { label: 'Text', icon: <FileText className="h-3 w-3" /> },
  }
  
  return (
    <div className="border border-border rounded-lg overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-secondary/30 border-b border-border">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {typeLabels[contentType]?.icon}
          <span>{typeLabels[contentType]?.label}</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setViewMode(viewMode === 'auto' ? 'raw' : 'auto')}
            className="text-xs px-2 py-0.5 rounded border border-border hover:bg-accent text-muted-foreground"
          >
            {viewMode === 'auto' ? 'Raw' : 'Formatted'}
          </button>
          <button
            onClick={copyToClipboard}
            className="text-muted-foreground hover:text-foreground"
          >
            {copied ? <Check className="h-3 w-3 text-green-400" /> : <Copy className="h-3 w-3" />}
          </button>
        </div>
      </div>
      
      {/* Content */}
      <div className="p-3 overflow-auto" style={{ maxHeight }}>
        {viewMode === 'raw' ? (
          <pre className="text-sm font-mono whitespace-pre-wrap">{content}</pre>
        ) : contentType === 'json' ? (
          <JsonRenderer content={content} />
        ) : contentType === 'diff' ? (
          <DiffRenderer content={content} />
        ) : contentType === 'code' ? (
          <CodeRenderer content={content} />
        ) : contentType === 'markdown' ? (
          <MarkdownRenderer content={content} />
        ) : (
          <pre className="text-sm whitespace-pre-wrap">{content}</pre>
        )}
      </div>
    </div>
  )
}
