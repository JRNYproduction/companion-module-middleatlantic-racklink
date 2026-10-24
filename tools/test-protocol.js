// Verifies frame building against the examples in Middle Atlantic's protocol manual (I-00472)
import * as P from '../src/protocol.js'
const cases = [
	['Login user|password', P.buildMessage(0x02, 0x01, P.ascii('user|password')), 'fe10000201757365727c70617373776f72643fff'],
	['Pong', P.PONG, 'fe0300011012ff'],
	['Outlet 1 ON', P.buildMessage(0x20, 0x01, [1, 1, ...P.asciiInt(0, 4)]), 'fe090020010101303030306aff'],
	['Outlet 2 cycle 5s', P.buildMessage(0x20, 0x01, [2, 2, ...P.asciiInt(5, 4)]), 'fe0900200102023030303571ff'],
	['Sequence up 3s', P.buildMessage(0x36, 0x01, [1, ...P.asciiInt(3, 4)]), 'fe08003601013030303301ff'],
	['Sequence down 5s', P.buildMessage(0x36, 0x01, [3, ...P.asciiInt(5, 4)]), 'fe08003601033030303505ff'],
	['Read outlet 1 name', P.buildMessage(0x21, 0x02, [1]), 'fe040021020126ff'],
	['Read outlet count', P.buildMessage(0x22, 0x02), 'fe0300220225ff'],
	['Escaping example', P.buildMessage(0x06, 0x00, [0xff]), 'fe04000600fd0007ff'],
]
let fail = 0
for (const [name, buf, exp] of cases) {
	const ok = buf.toString('hex') === exp
	if (!ok) fail++
	console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ${buf.toString('hex')}`)
}
process.exit(fail ? 1 : 0)
