/**
 * 라운지 서버 통합 테스트: 실제 Colyseus 서버를 띄우고 클라이언트 여러 개로 확인한다.
 *  위치 동기화, 채팅 서버 검사(차단·가림·위기), 층 분리, 30명 넘으면 방 나누기, 입장 거부
 */
import { spawn } from 'node:child_process'
import { Callbacks, Client } from '@colyseus/sdk'

const PORT = 2599
const URL = `http://localhost:${PORT}`
let failed = 0
const ok = (cond: unknown, label: string) => {
  console.log(`${cond ? '✓' : '✗'} ${label}`)
  if (!cond) failed++
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

const srv = spawn('npx', ['tsx', 'src/index.ts'], { env: { ...process.env, PORT: String(PORT), LOCAL_AUTH: '1' }, stdio: ['ignore', 'pipe', 'pipe'] })
await new Promise<void>((resolve, reject) => {
  const t = setTimeout(() => reject(new Error('server did not start')), 20000)
  srv.stdout.on('data', (d) => String(d).includes('라운지 서버') && (clearTimeout(t), resolve()))
  srv.stderr.on('data', (d) => process.stderr.write(d))
})

type Seen = { players: Map<string, { id: string; nickname: string; x: number; z: number }>; msgs: { type: string; payload: any }[]; roomNo: number }
async function join(id: string, floor = 17, building = 'samsung') {
  const client = new Client(URL)
  const room = await client.joinOrCreate('lounge', { building, floor, local: { id, nickname: `닉${id}` }, x: 0, z: 0, yaw: 0 })
  const seen: Seen = { players: new Map(), msgs: [], roomNo: 0 }
  const cb = Callbacks.get(room)
  cb.onAdd('players', (p: any, key: any) => {
    seen.players.set(key, p)
  })
  cb.onRemove('players', (_p: any, key: any) => {
    seen.players.delete(key)
  })
  cb.listen('roomNo', (v: number) => (seen.roomNo = v))
  room.onMessage('*', (type, payload) => seen.msgs.push({ type: String(type), payload }))
  return { room, seen }
}

try {
  const a = await join('A')
  const b = await join('B')
  await sleep(400)
  ok(a.room.roomId === b.room.roomId, '같은 층 두 사람이 같은 방')
  ok([...b.seen.players.values()].some((p) => p.id === 'A'), 'B 화면에 A 가 보인다')
  ok([...a.seen.players.values()].some((p) => p.id === 'B'), 'A 화면에 B 가 보인다')

  for (let i = 1; i <= 10; i++) {
    a.room.send('move', { x: i, z: -i / 2, yaw: 0.3 })
    await sleep(200) // 초당 5번, 2초 동안
  }
  await sleep(300)
  const aOnB = [...b.seen.players.values()].find((p) => p.id === 'A')!
  ok(aOnB && Math.abs(aOnB.x - 10) < 1e-6 && Math.abs(aOnB.z + 5) < 1e-6, `A 가 움직인 위치가 B 에게 보인다 (${aOnB?.x}, ${aOnB?.z})`)
  ok([...b.seen.players.values()].some((p) => p.id === 'A'), '2초 동안 계속 움직여도 A 가 방에 남아 있다')
  a.room.send('move', { x: 999, z: -999, yaw: 0 })
  await sleep(300)
  ok([...b.seen.players.values()].find((p) => p.id === 'A')!.x < 16, '바닥 밖 좌표는 서버가 방 안으로 맞춘다')

  a.room.send('chat', { text: '안녕하세요 17층!' })
  await sleep(1300)
  a.room.send('chat', { text: '연락 010-1234-5678' })
  await sleep(1300)
  a.room.send('chat', { text: '아 씨발 물렸다' })
  await sleep(1300)
  a.room.send('chat', { text: '진짜 죽고 싶다' })
  await sleep(400)
  const bChats = b.seen.msgs.filter((m) => m.type === 'chat').map((m) => m.payload.text)
  ok(bChats.includes('안녕하세요 17층!'), 'B 가 A 의 채팅을 받는다')
  ok(!bChats.some((t) => t.includes('010')), '전화번호 채팅은 서버가 막는다')
  ok(bChats.includes('아 ** 물렸다'), '욕설은 서버가 가려서 보낸다')
  ok(!bChats.some((t) => t.includes('죽고')), '위기 표현은 다른 사람에게 가지 않는다')
  ok(a.seen.msgs.some((m) => m.type === 'crisis'), '위기 표현을 쓴 사람에게만 crisis 안내')
  ok(a.seen.msgs.some((m) => m.type === 'notice'), '막힌 채팅은 보낸 사람에게 이유를 알린다')

  a.room.send('chat', { text: '도배1' })
  a.room.send('chat', { text: '도배2' })
  await sleep(300)
  ok(b.seen.msgs.filter((m) => m.type === 'chat' && String(m.payload.text).startsWith('도배')).length === 1, '1.2초 안에 연달아 보내면 서버가 막는다')

  a.room.send('emote', { e: '👋' })
  a.room.send('emote', { e: '<script>' })
  await sleep(300)
  const emotes = b.seen.msgs.filter((m) => m.type === 'emote').map((m) => m.payload.e)
  ok(emotes.includes('👋') && !emotes.includes('<script>'), '이모트는 정해진 것만 전달')

  const other = await join('C', 30)
  await sleep(300)
  ok(other.room.roomId !== a.room.roomId && ![...other.seen.players.values()].some((p) => p.id === 'A'), '다른 층 사람은 다른 방, 서로 안 보인다')

  // 30명이 차면 새 방
  const crowd: Awaited<ReturnType<typeof join>>[] = []
  for (let i = 0; i < 31; i++) crowd.push(await join(`P${i}`, 20))
  await sleep(500)
  const rooms = new Set(crowd.map((c) => c.room.roomId))
  const sizes = [...rooms].map((r) => crowd.filter((c) => c.room.roomId === r).length).sort((x, y) => y - x)
  ok(rooms.size === 2 && sizes[0] === 30 && sizes[1] === 1, `20층 31명 → 방 ${rooms.size}개 (${sizes.join(' + ')}명)`)
  const nos = new Set(crowd.map((c) => c.seen.roomNo))
  ok(nos.has(1) && nos.has(2), `방 번호 1, 2 (${[...nos].join(', ')})`)

  let refused = ''
  try {
    await new Client(URL).joinOrCreate('lounge', { building: 'samsung', floor: 17 })
  } catch (e) {
    refused = String((e as Error).message)
  }
  ok(refused.includes('not_authenticated'), `토큰도 로컬 정보도 없으면 입장 거부 (${refused})`)

  await b.room.leave()
  await sleep(400)
  ok(![...a.seen.players.values()].some((p) => p.id === 'B'), 'B 가 나가면 A 화면에서 사라진다')

  for (const c of [a, other, ...crowd]) await c.room.leave().catch(() => {})
} catch (e) {
  console.error(e)
  failed++
} finally {
  srv.kill()
}
console.log(failed ? `\n${failed}개 실패` : '\n모두 통과')
process.exit(failed ? 1 : 0)
