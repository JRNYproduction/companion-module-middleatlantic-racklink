/*
 * Minimal RackLink device simulator for testing the module without hardware.
 *   node tools/mock-racklink.js [port] [outlets]
 * Then point the Companion connection at 127.0.0.1 (default port 60000).
 * Login: user / password.  Type a number + Enter in this terminal to flip that
 * outlet "locally" (simulates the front panel) and watch Companion follow.
 */
import net from 'net'
import * as P from '../src/protocol.js'

const PORT = Number(process.argv[2]) || 60000
const OUTLETS = Number(process.argv[3]) || 9
const outlets = Array.from({ length: OUTLETS + 1 }, (_, i) => ({ on: false, name: `Outlet ${i}`, cycle: 5 }))
const clients = new Set()

function send(sock, cmd, sub, data = []) {
	sock.write(P.buildMessage(cmd, sub, data))
}
function outletMsg(sock, n, sub) {
	send(sock, P.CMD.OUTLET, sub, [n, outlets[n].on ? 1 : 0, ...P.asciiInt(outlets[n].cycle, 4)])
}
function broadcastOutlet(n) {
	for (const c of clients) if (c.loggedIn && c.registered) outletMsg(c.sock, n, P.SUB.STATUS)
}

net
	.createServer((sock) => {
		const client = { sock, loggedIn: false, registered: false }
		clients.add(client)
		const parser = new P.FrameParser()
		console.log('client connected')
		const ping = setInterval(() => client.loggedIn && send(sock, P.CMD.PING, P.SUB.SET), 10000)
		sock.on('close', () => {
			clearInterval(ping)
			clients.delete(client)
			console.log('client disconnected')
		})
		sock.on('error', () => {})
		sock.on('data', (chunk) => {
			for (const f of parser.push(chunk)) {
				const { command: cmd, subcommand: sub, data } = f
				if (!f.checksumOk || !f.lengthOk) {
					send(sock, P.CMD.NACK, P.SUB.RESPONSE, [0x01])
					continue
				}
				if (cmd === P.CMD.LOGIN) {
					const ok = P.bufToAscii(data) === 'user|password'
					client.loggedIn = ok
					send(sock, P.CMD.LOGIN, P.SUB.RESPONSE, [ok ? 1 : 0])
					if (ok) setTimeout(() => send(sock, P.CMD.PING, P.SUB.SET), 200)
					continue
				}
				if (cmd === P.CMD.PING) continue // pong
				if (!client.loggedIn) {
					send(sock, P.CMD.NACK, P.SUB.RESPONSE, [0x08])
					continue
				}
				switch (cmd) {
					case P.CMD.STATUS_REG:
						client.registered = true
						send(sock, P.CMD.STATUS_REG, P.SUB.RESPONSE, data)
						break
					case P.CMD.OUTLET_COUNT: {
						const letters = Array.from({ length: 16 }, (_, i) => (i < OUTLETS ? 'C' : 'X')).join('')
						send(sock, P.CMD.OUTLET_COUNT, P.SUB.RESPONSE, P.ascii(letters))
						break
					}
					case P.CMD.OUTLET: {
						const n = data[0]
						if (!outlets[n] || n === 0) {
							send(sock, P.CMD.NACK, P.SUB.RESPONSE, [0x07])
							break
						}
						if (sub === P.SUB.SET) {
							const st = data[1]
							if (st === 2) {
								const secs = parseInt(P.bufToAscii(data.subarray(2, 6)), 10) || 0
								outlets[n].on = false
								outletMsg(sock, n, P.SUB.RESPONSE)
								setTimeout(() => {
									outlets[n].on = true
									broadcastOutlet(n)
								}, secs * 1000)
							} else {
								outlets[n].on = st === 1
								outletMsg(sock, n, P.SUB.RESPONSE)
							}
						} else outletMsg(sock, n, P.SUB.RESPONSE)
						break
					}
					case P.CMD.OUTLET_NAME: {
						const n = data[0]
						if (!outlets[n] || n === 0) {
							send(sock, P.CMD.NACK, P.SUB.RESPONSE, [0x07])
							break
						}
						if (sub === P.SUB.SET) outlets[n].name = P.bufToAscii(data.subarray(1))
						send(sock, P.CMD.OUTLET_NAME, P.SUB.RESPONSE, [n, ...P.ascii(outlets[n].name)])
						break
					}
					case P.CMD.SEQUENCE: {
						const up = data[0] === 1
						const delay = parseInt(P.bufToAscii(data.subarray(1, 5)), 10) || 0
						send(sock, P.CMD.SEQUENCE, P.SUB.SET, [up ? 1 : 3, ...data.subarray(1, 5)])
						const order = Array.from({ length: OUTLETS }, (_, i) => i + 1)
						if (!up) order.reverse()
						order.forEach((n, i) =>
							setTimeout(() => {
								outlets[n].on = up
								broadcastOutlet(n)
								if (i === order.length - 1)
									for (const c of clients)
										if (c.loggedIn) send(c.sock, P.CMD.SEQUENCE, P.SUB.SET, [up ? 2 : 4, ...data.subarray(1, 5)])
							}, i * delay * 1000)
						)
						break
					}
					case P.CMD.PART_NUMBER:
						send(sock, cmd, P.SUB.RESPONSE, P.ascii(`RLNK-9${OUTLETS === 9 ? '15' : '20'}R (mock)`))
						break
					case P.CMD.IP_ADDRESS:
						send(sock, cmd, P.SUB.RESPONSE, P.ascii('127.0.0.1'))
						break
					case P.CMD.MAC_ADDRESS:
						send(sock, cmd, P.SUB.RESPONSE, P.ascii('00:11:22:33:44:55'))
						break
					case P.CMD.AMP_RATING:
						send(sock, cmd, P.SUB.RESPONSE, P.ascii('015'))
						break
					case P.CMD.SURGE_EXISTS:
						send(sock, cmd, P.SUB.RESPONSE, P.ascii('N'))
						break
					default:
						send(sock, P.CMD.NACK, P.SUB.RESPONSE, [0x04]) // like a Select unit for Premium-only commands
				}
			}
		})
	})
	.listen(PORT, () => console.log(`Mock RackLink (${OUTLETS} outlets) listening on ${PORT}. Type an outlet number + Enter to flip it locally.`))

process.stdin.on('data', (d) => {
	const n = parseInt(String(d), 10)
	if (outlets[n] && n > 0) {
		outlets[n].on = !outlets[n].on
		console.log(`outlet ${n} -> ${outlets[n].on ? 'ON' : 'OFF'} (local)`)
		broadcastOutlet(n)
	}
})
