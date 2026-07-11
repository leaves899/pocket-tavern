import http from 'node:http'
const port = Number(process.env.PORT || 4789)
const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*')
  res.setHeader('Access-Control-Allow-Headers', 'authorization,content-type')
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS')
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return }
  if (req.method !== 'POST' || req.url !== '/chat/completions') { res.writeHead(404); res.end(); return }
  let body = ''; req.on('data', x => body += x); req.on('end', () => {
    const parsed = JSON.parse(body || '{}')
    if (!parsed.stream || !parsed.model || !req.headers.authorization?.startsWith('Bearer ')) { res.writeHead(400); res.end(JSON.stringify({ error: { message: 'invalid request' } })); return }
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', 'X-Accel-Buffering': 'no', Connection: 'keep-alive' })
    const marker = String(parsed.messages?.findLast?.(message => message.role === 'user')?.content || 'unknown')
    const chunks = [`Reply ${marker} part-one `, 'part-two ', 'part-three.']
    const delay = marker.startsWith('Stop-') ? 2000 : 1200
    let i = 0; const timer = setInterval(() => { if (i < chunks.length) res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: chunks[i++] } }] })}\n\n`); else { clearInterval(timer); res.end('data: [DONE]\n\n') } }, delay)
    res.on('close', () => clearInterval(timer))
  })
})
server.listen(port, '127.0.0.1', () => console.log(`mock-deepseek:${port}`))
