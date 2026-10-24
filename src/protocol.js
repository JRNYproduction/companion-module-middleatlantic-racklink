/*
 * Middle Atlantic RackLink control protocol (TCP port 60000)
 * Implemented from "Control System Communication Protocol Manual RackLink" (I-00472).
 *
 * Frame:  <0xFE><Length><Envelope: 0x00 Cmd Sub Data...><Checksum><0xFF>
 *  - Length   = number of bytes in the (unescaped) envelope
 *  - Checksum = sum(header .. end of envelope) & 0x7F
 *  - 0xFD/0xFE/0xFF inside the envelope are escaped as 0xFD, (~byte & 0xFF)
 */

const HEADER = 0xfe
const TAIL = 0xff
const ESCAPE = 0xfd
const DESTINATION = 0x00

const CMD = Object.freeze({
	PING: 0x01,
	LOGIN: 0x02,
	NACK: 0x10,
	OUTLET: 0x20,
	OUTLET_NAME: 0x21,
	OUTLET_COUNT: 0x22,
	ENERGY_STATE: 0x23,
	CONTACT: 0x30,
	CONTACT_NAME: 0x31,
	CONTACT_COUNT: 0x32,
	SEQUENCE: 0x36,
	EPO: 0x37,
	LOG_ALERTS: 0x40,
	STATUS_REG: 0x41,
	KWH: 0x50,
	PEAK_VOLTAGE: 0x51,
	RMS_VOLTAGE: 0x52,
	PEAK_LOAD: 0x53,
	RMS_LOAD: 0x54,
	TEMPERATURE: 0x55,
	WATTAGE: 0x56,
	POWER_FACTOR: 0x57,
	THERMAL_LOAD: 0x58,
	SURGE_STATE: 0x59,
	ENERGY_STATES: 0x60,
	OCCUPANCY: 0x61,
	TH_LOW_VOLTAGE: 0x70,
	TH_HIGH_VOLTAGE: 0x71,
	TH_MAX_LOAD: 0x73,
	TH_MIN_LOAD: 0x74,
	TH_MAX_TEMP: 0x76,
	TH_MIN_TEMP: 0x77,
	LOG_READ: 0x80,
	LOG_COUNT: 0x81,
	LOG_CLEAR: 0x82,
	PART_NUMBER: 0x90,
	AMP_RATING: 0x91,
	SURGE_EXISTS: 0x93,
	IP_ADDRESS: 0x94,
	MAC_ADDRESS: 0x95,
})

const SUB = Object.freeze({
	SET: 0x01,
	GET: 0x02,
	RESPONSE: 0x10,
	STATUS: 0x12, // unsolicited status change (local event)
	LOG_UPDATE: 0x30, // scheduled log report
})

const NACK_CODES = Object.freeze({
	0x01: 'Bad CRC on previous command',
	0x02: 'Bad length on previous command',
	0x03: 'Bad escape sequence on previous command',
	0x04: 'Previous command invalid (not supported by this model?)',
	0x05: 'Previous sub-command invalid',
	0x06: 'Previous command incorrect byte count',
	0x07: 'Invalid data bytes in previous command',
	0x08: 'Invalid credentials (login required)',
	0x10: 'Unknown error',
	0x11: 'Access denied (EPO active)',
})

const OUTLET_STATE = Object.freeze({ OFF: 0x00, ON: 0x01, CYCLE: 0x02, NOT_CONTROLLABLE: 0x03 })

const SEQUENCE_STATES = Object.freeze({
	0: 'Not Sequencing',
	1: 'Sequencing Up',
	2: 'Sequence Up Complete',
	3: 'Sequencing Down',
	4: 'Sequence Down Complete',
})

const ENERGY_LETTERS = Object.freeze({
	D: 'Disconnected',
	S: 'Standby',
	I: 'On',
	O: 'Off',
	U: 'Unknown',
})

const CONTROLLABLE_LETTERS = Object.freeze({
	C: 'Controllable',
	N: 'Not Controllable',
	X: 'Does Not Exist',
})

/** Numeric sensor readings (Premium / Premium+). value format from the manual */
const SENSORS = Object.freeze([
	{ cmd: CMD.KWH, id: 'kwh', name: 'Kilowatt Hours', format: '##########.#', unit: 'kWh' },
	{ cmd: CMD.PEAK_VOLTAGE, id: 'peak_voltage', name: 'Peak Voltage', format: '###', unit: 'V' },
	{ cmd: CMD.RMS_VOLTAGE, id: 'rms_voltage', name: 'RMS Voltage', format: '###', unit: 'V' },
	{ cmd: CMD.PEAK_LOAD, id: 'peak_load', name: 'Peak Load', format: '##.#', unit: 'A' },
	{ cmd: CMD.RMS_LOAD, id: 'rms_load', name: 'RMS Load', format: '##.#', unit: 'A' },
	{ cmd: CMD.TEMPERATURE, id: 'temperature', name: 'Temperature', format: '###', unit: '°F' },
	{ cmd: CMD.WATTAGE, id: 'wattage', name: 'Wattage', format: '####', unit: 'W' },
	{ cmd: CMD.POWER_FACTOR, id: 'power_factor', name: 'Power Factor', format: '#.#', unit: '' },
	{ cmd: CMD.THERMAL_LOAD, id: 'thermal_load', name: 'Thermal Load', format: '####.#', unit: 'BTU' },
])

const THRESHOLDS = Object.freeze([
	{ cmd: CMD.TH_LOW_VOLTAGE, id: 'th_low_voltage', name: 'Low Voltage Threshold', format: '###', unit: 'V' },
	{ cmd: CMD.TH_HIGH_VOLTAGE, id: 'th_high_voltage', name: 'High Voltage Threshold', format: '###', unit: 'V' },
	{ cmd: CMD.TH_MAX_LOAD, id: 'th_max_load', name: 'Max Load Current Threshold', format: '##.#', unit: 'A' },
	{ cmd: CMD.TH_MIN_LOAD, id: 'th_min_load', name: 'Min Load Current Threshold', format: '##.#', unit: 'A' },
	{ cmd: CMD.TH_MAX_TEMP, id: 'th_max_temp', name: 'Max Temperature Threshold', format: '###', unit: '°F' },
	{ cmd: CMD.TH_MIN_TEMP, id: 'th_min_temp', name: 'Min Temperature Threshold', format: '###', unit: '°F' },
])

const INFO = Object.freeze([
	{ cmd: CMD.PART_NUMBER, id: 'part_number', name: 'Part Number' },
	{ cmd: CMD.AMP_RATING, id: 'amp_rating', name: 'Amp Rating' },
	{ cmd: CMD.SURGE_EXISTS, id: 'surge_exists', name: 'Surge Protection Present (Y/N)' },
	{ cmd: CMD.IP_ADDRESS, id: 'ip_address', name: 'IP Address' },
	{ cmd: CMD.MAC_ADDRESS, id: 'mac_address', name: 'MAC Address' },
])

/** Register Log Alerts (0x40) bits: [byteIndex, bitMask] */
const LOG_ALERT_BITS = Object.freeze([
	{ id: 'normal', label: 'Normal Log Alerts', byte: 0, mask: 0x01 },
	{ id: 'over_voltage', label: 'Over Voltage', byte: 0, mask: 0x02 },
	{ id: 'under_voltage', label: 'Under Voltage', byte: 0, mask: 0x04 },
	{ id: 'over_temp', label: 'Over Temperature', byte: 0, mask: 0x08 },
	{ id: 'under_temp', label: 'Under Temperature', byte: 0, mask: 0x10 },
	{ id: 'surge_fault', label: 'Surge Fault', byte: 0, mask: 0x20 },
	{ id: 'auto_ping', label: 'Auto Ping Timeout', byte: 1, mask: 0x01 },
	{ id: 'rs232_ping', label: 'RS232 Ping Timeout', byte: 1, mask: 0x02 },
	{ id: 'over_current', label: 'Over Current', byte: 1, mask: 0x04 },
	{ id: 'under_current', label: 'Under Current', byte: 1, mask: 0x08 },
	{ id: 'epo', label: 'EPO', byte: 1, mask: 0x10 },
])

const LOG_TYPES = Object.freeze({
	'00': 'Normal',
	'01': 'Over Voltage',
	'02': 'Under Voltage',
	'03': 'Over Current',
	'04': 'Under Current',
	'05': 'Over Temperature',
	'06': 'Under Temperature',
	'07': 'Surge Fault',
	'08': 'Auto Ping Fault',
	'09': 'RS-232 Ping Fail',
	10: 'EPO Initiate',
	11: 'EPO Recovery',
})

function checksum(bytes) {
	let sum = 0
	for (const b of bytes) sum += b
	return sum & 0x7f
}

/**
 * Build a complete, escaped frame.
 * @param {number} command
 * @param {number} subcommand
 * @param {number[]|Buffer} data
 * @returns {Buffer}
 */
function buildMessage(command, subcommand, data = []) {
	const envelope = [DESTINATION, command & 0xff, subcommand & 0xff, ...Array.from(data, (b) => b & 0xff)]
	if (envelope.length > 250) throw new Error(`RackLink envelope too long (${envelope.length} > 250 bytes)`)

	const cs = checksum([HEADER, envelope.length, ...envelope])
	const out = [HEADER, envelope.length]
	for (const b of envelope) {
		if (b === HEADER || b === TAIL || b === ESCAPE) out.push(ESCAPE, ~b & 0xff)
		else out.push(b)
	}
	out.push(cs, TAIL)
	return Buffer.from(out)
}

/** ASCII bytes for a string */
function ascii(str) {
	return Array.from(Buffer.from(String(str), 'latin1'))
}

/** Zero-padded ASCII integer, e.g. asciiInt(5, 4) -> "0005" */
function asciiInt(value, width) {
	let n = Math.round(Number(value))
	if (!Number.isFinite(n) || n < 0) n = 0
	const max = Math.pow(10, width) - 1
	if (n > max) n = max
	return ascii(String(n).padStart(width, '0'))
}

/** Format a value to a manual format like "##.#" or "###" */
function formatValue(value, format) {
	const num = Number(value)
	if (!Number.isFinite(num) || num < 0) throw new Error(`Invalid value "${value}"`)
	const dot = format.indexOf('.')
	const decimals = dot === -1 ? 0 : format.length - dot - 1
	const str = num.toFixed(decimals).padStart(format.length, '0')
	if (str.length > format.length) throw new Error(`Value ${value} does not fit format ${format}`)
	return str
}

function bufToAscii(buf) {
	return Buffer.from(buf).toString('latin1').replace(/\0+$/, '')
}

function toHex(buf) {
	return Array.from(buf, (b) => b.toString(16).padStart(2, '0')).join(' ')
}

/** Parse "20 02 03" / "0x20,0x02,0x03" / "200203" into bytes */
function parseHex(str) {
	const clean = String(str)
		.replace(/0x/gi, '')
		.replace(/[^0-9a-f]/gi, '')
	if (clean.length === 0 || clean.length % 2 !== 0) throw new Error('Hex string must contain an even number of digits')
	const bytes = []
	for (let i = 0; i < clean.length; i += 2) bytes.push(parseInt(clean.substr(i, 2), 16))
	return bytes
}

/**
 * Streaming frame parser. Feed it TCP chunks; it returns decoded frames.
 * Frame object: { command, subcommand, data: Buffer, raw: Buffer, checksumOk, lengthOk }
 */
class FrameParser {
	constructor() {
		this.reset()
	}

	reset() {
		this.inFrame = false
		this.escape = false
		this.bytes = []
		this.raw = []
	}

	push(chunk) {
		const frames = []
		for (const b of chunk) {
			if (b === HEADER) {
				// start (or restart) a frame
				this.inFrame = true
				this.escape = false
				this.bytes = []
				this.raw = [b]
				continue
			}
			if (!this.inFrame) continue
			this.raw.push(b)

			if (b === TAIL) {
				const frame = this._decode()
				if (frame) frames.push(frame)
				this.reset()
				continue
			}
			if (b === ESCAPE) {
				this.escape = true
				continue
			}
			if (this.escape) {
				this.bytes.push(~b & 0xff)
				this.escape = false
			} else {
				this.bytes.push(b)
			}
			if (this.bytes.length > 300) this.reset() // runaway / garbage protection
		}
		return frames
	}

	_decode() {
		// bytes = [length, ...envelope, checksum]
		const b = this.bytes
		if (b.length < 5) return null
		const length = b[0]
		const envelope = b.slice(1, b.length - 1)
		const cs = b[b.length - 1]
		const lengthOk = envelope.length === length
		const checksumOk = checksum([HEADER, length, ...envelope]) === cs
		if (envelope.length < 3) return null
		return {
			command: envelope[1],
			subcommand: envelope[2],
			data: Buffer.from(envelope.slice(3)),
			raw: Buffer.from(this.raw),
			lengthOk,
			checksumOk,
		}
	}
}

/** Parse a Read Log Entry response string into fields (best effort) */
function parseLogEntry(str) {
	const parts = str.split('|')
	// "RR|EE|NNNN|TT|MM/DD/YYYY HH:MM:SS,TTT,WWWW,F.F,VVV,CC.R,LLLL.L,O,1,2,..."
	const entry = { raw: str }
	if (parts.length >= 5) {
		entry.requestNumber = parts[0]
		entry.remaining = parts[1]
		entry.entryNumber = parts[2]
		entry.typeCode = parts[3]
		entry.type = LOG_TYPES[parts[3]] || LOG_TYPES[Number(parts[3])] || parts[3]
		const rest = parts.slice(4).join('|').split(',')
		entry.dateTime = rest[0]
		entry.temperature = rest[1]
		entry.wattage = rest[2]
		entry.powerFactor = rest[3]
		entry.voltage = rest[4]
		entry.current = rest[5]
		entry.thermalLoad = rest[6]
		entry.occupancy = rest[7]
		entry.energyStates = rest.slice(8).join(',')
	}
	return entry
}

const PONG = buildMessage(CMD.PING, SUB.RESPONSE)

export {
	HEADER,
	TAIL,
	ESCAPE,
	CMD,
	SUB,
	NACK_CODES,
	OUTLET_STATE,
	SEQUENCE_STATES,
	ENERGY_LETTERS,
	CONTROLLABLE_LETTERS,
	SENSORS,
	THRESHOLDS,
	INFO,
	LOG_ALERT_BITS,
	LOG_TYPES,
	PONG,
	checksum,
	buildMessage,
	ascii,
	asciiInt,
	formatValue,
	bufToAscii,
	toHex,
	parseHex,
	parseLogEntry,
	FrameParser,
}
