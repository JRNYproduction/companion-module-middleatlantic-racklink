import { InstanceBase, InstanceStatus, TCPHelper } from '@companion-module/base'
import * as P from './protocol.js'
import { getConfigFields } from './config.js'
import { getActions } from './actions.js'
import { getFeedbacks } from './feedbacks.js'
import { getVariableDefinitions, getAllVariableValues } from './variables.js'
import { getPresets } from './presets.js'
import { UpgradeScripts } from './upgrades.js'

const MAX_OUTLETS = 16
const MAX_CONTACTS = 8

const OPTIONAL_QUERIES = new Set([
	...P.INFO.map((i) => i.cmd),
	...P.SENSORS.map((x) => x.cmd),
	...P.THRESHOLDS.map((x) => x.cmd),
	P.CMD.SURGE_STATE,
	P.CMD.ENERGY_STATES,
	P.CMD.OCCUPANCY,
	P.CMD.LOG_COUNT,
	P.CMD.LOG_ALERTS,
])

class RackLinkInstance extends InstanceBase {
	constructor(internal) {
		super(internal)
		this.socket = null
		this.parser = new P.FrameParser()
		this.queue = []
		this.sending = false
		this.timers = {}
		this.lastSent = null
		this.inflight = null
		this.lastRx = 0
		this.unsupported = new Set()
	}

	// ---------------------------------------------------------------- lifecycle

	async init(config, _isFirstInit, secrets) {
		this.config = config
		this.secrets = secrets || {}
		this.resetState()
		this.updateDefinitions()
		this.connect()
	}

	async destroy() {
		this.teardown()
	}

	async configUpdated(config, secrets) {
		this.teardown()
		this.unsupported = new Set()
		this.config = config
		this.secrets = secrets || {}
		this.resetState()
		this.updateDefinitions()
		this.connect()
	}

	getConfigFields() {
		return getConfigFields()
	}

	// ---------------------------------------------------------------- state

	resetState() {
		const outlets = {}
		for (let i = 1; i <= MAX_OUTLETS; i++) {
			outlets[i] = { state: null, name: '', cycleTime: null, controllable: null, energy: null, cycling: false }
		}
		const contacts = {}
		for (let i = 1; i <= MAX_CONTACTS; i++) {
			contacts[i] = { state: null, name: '', cycleTime: null, controllable: null }
		}
		this.state = {
			connected: false,
			loggedIn: false,
			ready: false,
			detectedOutlets: null,
			detectedContacts: null,
			outlets,
			contacts,
			sequence: null,
			sequenceDelay: null,
			epo: null,
			sensors: {},
			surgeState: null,
			energyStates: '',
			occupancy: null,
			thresholds: {},
			info: {},
			logAlerts: null,
			statusReg: null,
			logCount: null,
			lastLog: null,
			lastNack: '',
		}
	}

	isAdvanced() {
		return this.config.model === 'premium' || this.config.model === 'premium_plus'
	}

	outletCount() {
		const cfg = Number(this.config.outlet_count) || 0
		if (cfg > 0) return Math.min(cfg, MAX_OUTLETS)
		return this.state.detectedOutlets || MAX_OUTLETS
	}

	contactCount() {
		return this.state.detectedContacts || 0
	}

	outletChoices(includeAll = false) {
		const choices = []
		if (includeAll) choices.push({ id: 0, label: 'All outlets' })
		for (let i = 1; i <= this.outletCount(); i++) {
			const name = this.state.outlets[i].name
			choices.push({ id: i, label: name ? `${i}: ${name}` : `Outlet ${i}` })
		}
		return choices
	}

	contactChoices() {
		const choices = []
		const count = this.contactCount() || MAX_CONTACTS
		for (let i = 1; i <= count; i++) {
			const name = this.state.contacts[i].name
			choices.push({ id: i, label: name ? `${i}: ${name}` : `Contact ${i}` })
		}
		return choices
	}

	updateDefinitions() {
		this.setActionDefinitions(getActions(this))
		this.setFeedbackDefinitions(getFeedbacks(this))
		this.setVariableDefinitions(getVariableDefinitions(this))
		const { structure, presets } = getPresets(this)
		this.setPresetDefinitions(structure, presets)
		this.setVariableValues(getAllVariableValues(this))
	}

	/** Debounced re-publish of definitions (names/counts changed) */
	scheduleDefinitionUpdate() {
		if (this.timers.defs) return
		this.timers.defs = setTimeout(() => {
			delete this.timers.defs
			this.updateDefinitions()
			this.checkAllFeedbacks()
		}, 500)
	}

	// ---------------------------------------------------------------- connection

	connect() {
		if (!this.config.host) {
			this.updateStatus(InstanceStatus.BadConfig, 'IP address not set')
			return
		}
		this.updateStatus(InstanceStatus.Connecting)
		this.socket = new TCPHelper(this.config.host, Number(this.config.port) || 60000)

		this.socket.on('status_change', (status, message) => {
			if (status !== InstanceStatus.Ok) {
				this.updateStatus(status, message)
				if (this.state.connected) this.onDisconnect()
			}
		})
		this.socket.on('error', (err) => {
			this.log('error', `Network error: ${err.message}`)
		})
		this.socket.on('connect', () => this.onConnect())
		this.socket.on('end', () => this.onDisconnect())
		this.socket.on('data', (data) => this.onData(data))

		// watchdog
		const wd = Number(this.config.watchdog) || 0
		if (wd > 0) {
			this.timers.watchdog = setInterval(() => {
				if (this.state.loggedIn && Date.now() - this.lastRx > wd * 1000) {
					this.log('warn', `No data from RackLink for ${wd}s, reconnecting`)
					this.reconnect()
				}
			}, 5000)
		}
	}

	reconnect() {
		this.teardown()
		this.resetConnectionState()
		this.connect()
	}

	teardown() {
		for (const key of Object.keys(this.timers)) {
			clearTimeout(this.timers[key])
			clearInterval(this.timers[key])
			delete this.timers[key]
		}
		this.queue = []
		this.sending = false
		this.inflight = null
		if (this.socket) {
			this.socket.removeAllListeners()
			this.socket.destroy()
			this.socket = null
		}
	}

	resetConnectionState() {
		this.state.connected = false
		this.state.loggedIn = false
		this.state.ready = false
	}

	onConnect() {
		this.log('info', `Connected to ${this.config.host}, logging in`)
		this.parser.reset()
		this.queue = []
		this.inflight = null
		this.state.connected = true
		this.state.loggedIn = false
		this.state.ready = false
		this.lastRx = Date.now()
		this.updateStatus(InstanceStatus.Connecting, 'Logging in')
		this.sendLogin()
		this.publishConnection()
	}

	onDisconnect() {
		this.stopPolling()
		clearTimeout(this.timers.login)
		clearTimeout(this.timers.firstPing)
		this.queue = []
		this.sending = false
		this.inflight = null
		clearTimeout(this.timers.inflight)
		this.resetConnectionState()
		this.publishConnection()
	}

	sendLogin() {
		const creds = `${this.config.username || 'user'}|${this.secrets?.password ?? ''}`
		this.writeNow(P.buildMessage(P.CMD.LOGIN, P.SUB.SET, P.ascii(creds)), 'login')
		clearTimeout(this.timers.login)
		this.timers.login = setTimeout(() => {
			if (!this.state.loggedIn && this.state.connected) {
				this.updateStatus(InstanceStatus.ConnectionFailure, 'No login response (is the control protocol enabled?)')
				this.sendLogin()
			}
		}, 5000)
	}

	onLoginResult(accepted) {
		clearTimeout(this.timers.login)
		if (!accepted) {
			this.state.loggedIn = false
			this.updateStatus(InstanceStatus.AuthenticationFailure, 'Login rejected, check username/password')
			this.log('error', 'RackLink rejected the login credentials')
			this.publishConnection()
			return
		}
		this.log('info', 'Login accepted')
		this.state.loggedIn = true
		this.updateStatus(InstanceStatus.Ok)
		this.publishConnection()
		// The device sends a PING after login; commands are valid once we've answered it.
		this.timers.firstPing = setTimeout(() => this.onReady(), 3000)
	}

	onReady() {
		clearTimeout(this.timers.firstPing)
		if (this.state.ready || !this.state.loggedIn) return
		this.state.ready = true
		this.publishConnection()
		this.registerStatusUpdates()
		this.refresh('all')
		this.startPolling()
	}

	registerStatusUpdates() {
		// byte1 bit1: outlet changes | byte2: dry contact (0x01), input (0x02), sequence (0x04), EPO (0x08)
		let data
		if (this.isAdvanced()) {
			data = [0x01, 0x0f, 0x5b, 0x01, 0x00, 0x00]
			if (this.config.subscribe_sensors) {
				data[4] = 0x7f // kWh, peak V, RMS V, peak load, RMS load, temperature, wattage
				data[5] = 0x0f // power factor, thermal load, log count, surge state
			}
		} else {
			data = [0x01, 0x01, 0x00, 0x00, 0x00, 0x00] // as documented for Select series
		}
		this.send(P.CMD.STATUS_REG, P.SUB.SET, data)
	}

	startPolling() {
		this.stopPolling()
		const poll = Number(this.config.poll_interval) || 0
		if (poll > 0) {
			this.timers.poll = setInterval(() => this.refresh('states'), poll * 1000)
		}
		const sensorPoll = Number(this.config.sensor_poll_interval) || 0
		if (sensorPoll > 0 && this.isAdvanced()) {
			this.timers.sensorPoll = setInterval(() => this.refresh('sensors'), sensorPoll * 1000)
		}
	}

	stopPolling() {
		clearInterval(this.timers.poll)
		clearInterval(this.timers.sensorPoll)
		delete this.timers.poll
		delete this.timers.sensorPoll
	}

	/**
	 * Query the device.
	 * @param {'all'|'states'|'outlets'|'names'|'contacts'|'counts'|'sensors'|'thresholds'|'info'|'log'|'energy'} what
	 */
	refresh(what) {
		if (what === 'all' && !(Number(this.config.outlet_count) > 0) && !this.state.detectedOutlets) {
			// auto-detect first so we don't query outlets that don't exist
			this.pendingFullRefresh = true
			this.send(P.CMD.OUTLET_COUNT, P.SUB.GET)
			this.send(P.CMD.CONTACT_COUNT, P.SUB.GET)
			clearTimeout(this.timers.countFallback)
			this.timers.countFallback = setTimeout(() => this.runPendingRefresh(), 4000)
			return
		}
		const all = what === 'all' || what === 'all_after_count'
		if (what === 'all' || what === 'counts') {
			this.send(P.CMD.OUTLET_COUNT, P.SUB.GET)
			this.send(P.CMD.CONTACT_COUNT, P.SUB.GET)
		}
		if (all || what === 'states' || what === 'outlets') {
			for (let i = 1; i <= this.outletCount(); i++) this.send(P.CMD.OUTLET, P.SUB.GET, [i])
		}
		if (all || what === 'states' || what === 'contacts') {
			for (let i = 1; i <= this.contactCount(); i++) this.send(P.CMD.CONTACT, P.SUB.GET, [i])
		}
		if (all || what === 'names') {
			for (let i = 1; i <= this.outletCount(); i++) this.send(P.CMD.OUTLET_NAME, P.SUB.GET, [i])
			for (let i = 1; i <= this.contactCount(); i++) this.send(P.CMD.CONTACT_NAME, P.SUB.GET, [i])
		}
		if (all || what === 'info') {
			for (const item of P.INFO) this.send(item.cmd, P.SUB.GET)
		}
		if (!this.isAdvanced()) return

		if (all || what === 'sensors') {
			for (const s of P.SENSORS) this.send(s.cmd, P.SUB.GET)
			this.send(P.CMD.SURGE_STATE, P.SUB.GET)
			this.send(P.CMD.ENERGY_STATES, P.SUB.GET)
			this.send(P.CMD.OCCUPANCY, P.SUB.GET)
		}
		if (all || what === 'energy') {
			for (let i = 1; i <= this.outletCount(); i++) this.send(P.CMD.ENERGY_STATE, P.SUB.GET, [i])
		}
		if (all || what === 'thresholds') {
			for (const t of P.THRESHOLDS) this.send(t.cmd, P.SUB.GET)
		}
		if (all || what === 'log') {
			this.send(P.CMD.LOG_COUNT, P.SUB.GET)
			this.send(P.CMD.LOG_ALERTS, P.SUB.GET)
		}
	}

	runPendingRefresh() {
		clearTimeout(this.timers.countFallback)
		if (!this.pendingFullRefresh) return
		this.pendingFullRefresh = false
		this.refresh('all_after_count')
	}

	// ---------------------------------------------------------------- sending

	/** Write immediately, bypassing the queue (login / pong) */
	writeNow(buf, label) {
		if (!this.socket || !this.socket.isConnected) return
		if (this.config.debug) this.log('debug', `TX ${label}: ${P.toHex(buf)}`)
		this.socket.send(buf)
	}

	/** Queue a command. Dropped if not logged in. */
	send(command, subcommand, data = []) {
		if (subcommand === P.SUB.GET && this.unsupported.has(command)) return false
		if (!this.state.loggedIn) {
			this.log('debug', `Not logged in, dropping command 0x${command.toString(16)}`)
			return false
		}
		let buf
		try {
			buf = P.buildMessage(command, subcommand, data)
		} catch (e) {
			this.log('error', e.message)
			return false
		}
		this.queue.push({ buf, command, subcommand, data: Array.from(data) })
		this.drain()
		return true
	}

	/**
	 * Stop-and-wait: one command in flight at a time. The next is sent when the
	 * device answers (response or NACK) or after a timeout. This keeps embedded
	 * RackLink units happy and lets us attribute NACKs to the right command.
	 */
	drain() {
		if (this.inflight || this.sending || this.queue.length === 0) return
		if (!this.socket || !this.socket.isConnected) {
			this.queue = []
			return
		}
		const item = this.queue.shift()
		this.inflight = item
		this.lastSent = item
		if (this.config.debug) this.log('debug', `TX: ${P.toHex(item.buf)}`)
		this.socket.send(item.buf)
		this.timers.inflight = setTimeout(() => {
			if (this.config.debug) this.log('debug', `No reply to 0x${item.command.toString(16)}, continuing`)
			this.completeInflight()
		}, 1500)
	}

	completeInflight() {
		clearTimeout(this.timers.inflight)
		this.inflight = null
		const gap = Number(this.config.send_interval)
		this.sending = true
		this.timers.drain = setTimeout(
			() => {
				this.sending = false
				this.drain()
			},
			Number.isFinite(gap) ? gap : 30
		)
	}

	/** Does this incoming frame answer the command currently in flight? */
	answersInflight(frame) {
		const f = this.inflight
		if (!f) return false
		if (frame.command === P.CMD.NACK) return true
		if (frame.command !== f.command) return false
		if (frame.subcommand === P.SUB.STATUS || frame.subcommand === P.SUB.LOG_UPDATE) return false
		// for per-outlet commands make sure it's the same outlet
		const perPoint = [P.CMD.OUTLET, P.CMD.CONTACT, P.CMD.OUTLET_NAME, P.CMD.CONTACT_NAME, P.CMD.ENERGY_STATE]
		if (perPoint.includes(f.command) && f.data.length > 0) return frame.data[0] === f.data[0]
		return true
	}

	// ---------------------------------------------------------------- receiving

	onData(chunk) {
		this.lastRx = Date.now()
		const frames = this.parser.push(chunk)
		for (const frame of frames) {
			if (this.config.debug) this.log('debug', `RX: ${P.toHex(frame.raw)}`)
			if (!frame.lengthOk) {
				this.log('warn', `Discarding frame with bad length: ${P.toHex(frame.raw)}`)
				continue
			}
			if (!frame.checksumOk) {
				this.log('debug', `Checksum mismatch (processing anyway): ${P.toHex(frame.raw)}`)
			}
			const answered = this.answersInflight(frame)
			if (answered) this.lastSent = this.inflight
			try {
				this.handleFrame(frame)
			} catch (e) {
				this.log('error', `Error handling frame ${P.toHex(frame.raw)}: ${e.message}`)
			}
			if (answered) this.completeInflight()
		}
	}

	handleFrame({ command, subcommand, data }) {
		const C = P.CMD
		switch (command) {
			case C.PING:
				if (subcommand === P.SUB.SET) {
					this.writeNow(P.PONG, 'pong')
					if (this.state.loggedIn && !this.state.ready) this.onReady()
				}
				return
			case C.LOGIN:
				this.onLoginResult(data[0] === 0x01)
				return
			case C.NACK:
				return this.onNack(data[0])
			case C.OUTLET:
				return this.onPointState('outlet', data, subcommand)
			case C.CONTACT:
				return this.onPointState('contact', data, subcommand)
			case C.OUTLET_NAME:
				return this.onPointName('outlet', data)
			case C.CONTACT_NAME:
				return this.onPointName('contact', data)
			case C.OUTLET_COUNT:
				return this.onCount('outlet', data)
			case C.CONTACT_COUNT:
				return this.onCount('contact', data)
			case C.ENERGY_STATE: {
				const n = data[0]
				if (this.state.outlets[n]) {
					this.state.outlets[n].energy = String.fromCharCode(data[1])
					this.setVariableValues({ [`outlet_${n}_energy`]: this.energyLabel(this.state.outlets[n].energy) })
					this.checkFeedbacks('energy_state')
				}
				return
			}
			case C.SEQUENCE:
				this.state.sequence = data[0]
				this.state.sequenceDelay = data.length >= 5 ? parseInt(P.bufToAscii(data.subarray(1, 5)), 10) : null
				this.setVariableValues({
					sequence_state: P.SEQUENCE_STATES[data[0]] ?? `Unknown (${data[0]})`,
					sequence_delay: this.state.sequenceDelay ?? '',
				})
				this.checkFeedbacks('sequence_state')
				return
			case C.EPO:
				this.state.epo = data[0] === 0x01
				this.setVariableValues({ epo_state: this.state.epo ? 'EPO Active' : 'Normal' })
				this.checkFeedbacks('epo_active')
				return
			case C.LOG_ALERTS:
				this.state.logAlerts = Array.from(data.subarray(0, 2))
				this.setVariableValues({ log_alerts_mask: P.toHex(data.subarray(0, 2)) })
				return
			case C.STATUS_REG:
				this.state.statusReg = Array.from(data)
				this.log('debug', `Status updates registered: ${P.toHex(data)}`)
				return
			case C.SURGE_STATE: {
				const v = data[0]
				this.state.surgeState = v
				this.setVariableValues({ surge_state: ['N/A', 'Protected', 'Compromised'][v] ?? `Unknown (${v})` })
				this.checkFeedbacks('surge_state')
				return
			}
			case C.ENERGY_STATES: {
				const letters = P.bufToAscii(data)
				this.state.energyStates = letters
				const values = { energy_states: letters }
				for (let i = 1; i <= Math.min(letters.length, MAX_OUTLETS); i++) {
					this.state.outlets[i].energy = letters[i - 1]
					values[`outlet_${i}_energy`] = this.energyLabel(letters[i - 1])
				}
				this.setVariableValues(values)
				this.checkFeedbacks('energy_state')
				return
			}
			case C.OCCUPANCY: {
				const l = String.fromCharCode(data[0])
				this.state.occupancy = l
				this.setVariableValues({ occupancy: l === 'O' ? 'Occupied' : l === 'U' ? 'Unoccupied' : l })
				this.checkFeedbacks('occupancy')
				return
			}
			case C.LOG_READ: {
				const entry = P.parseLogEntry(P.bufToAscii(data))
				this.state.lastLog = entry
				this.setVariableValues({
					log_last_entry: entry.raw,
					log_last_type: entry.type ?? '',
					log_last_time: entry.dateTime ?? '',
					log_last_number: entry.entryNumber ?? '',
				})
				return
			}
			case C.LOG_COUNT: {
				const count = parseInt(P.bufToAscii(data), 10)
				this.state.logCount = Number.isFinite(count) ? count : null
				this.setVariableValues({ log_count: this.state.logCount ?? '' })
				return
			}
			case C.LOG_CLEAR:
				this.state.logCount = 0
				this.setVariableValues({ log_count: 0 })
				return
		}

		const sensor = P.SENSORS.find((s) => s.cmd === command)
		if (sensor) {
			const value = P.bufToAscii(data).trim()
			this.state.sensors[sensor.id] = value
			this.setVariableValues({ [sensor.id]: this.cleanNumber(value) })
			this.checkFeedbacks('value_compare')
			return
		}
		const threshold = P.THRESHOLDS.find((t) => t.cmd === command)
		if (threshold) {
			const value = P.bufToAscii(data).trim()
			this.state.thresholds[threshold.id] = value
			this.setVariableValues({ [threshold.id]: this.cleanNumber(value) })
			this.checkFeedbacks('value_compare')
			return
		}
		const info = P.INFO.find((i) => i.cmd === command)
		if (info) {
			const value = P.bufToAscii(data).trim()
			this.state.info[info.id] = value
			this.setVariableValues({ [info.id]: value })
			return
		}
		this.log('debug', `Unhandled message cmd=0x${command.toString(16)} sub=0x${subcommand.toString(16)}`)
	}

	onNack(code) {
		const text = P.NACK_CODES[code] || `Unknown NACK 0x${(code ?? 0).toString(16)}`
		const last = this.lastSent ? `0x${this.lastSent.command.toString(16)}/0x${this.lastSent.subcommand.toString(16)}` : 'n/a'
		this.state.lastNack = `${text} (last cmd ${last})`
		this.setVariableValues({ last_error: this.state.lastNack })

		if (code === 0x08) {
			this.log('warn', 'RackLink requires login again')
			this.state.loggedIn = false
			this.state.ready = false
			this.stopPolling()
			this.queue = []
			this.publishConnection()
			this.sendLogin()
			return
		}
		if (code === 0x11) {
			this.state.epo = true
			this.setVariableValues({ epo_state: 'EPO Active' })
			this.checkFeedbacks('epo_active')
		}
		// Unsupported count queries: fall back sensibly
		if (this.lastSent && this.lastSent.command === P.CMD.CONTACT_COUNT) {
			this.log('debug', 'Dry contacts not supported by this unit')
			this.state.detectedContacts = 0
			this.runPendingRefresh()
			return
		}
		if (this.lastSent && this.lastSent.command === P.CMD.OUTLET_COUNT) {
			this.log('info', 'Outlet count query not supported, using configured count (or 16)')
			return
		}
		// Optional queries this model doesn't support (e.g. surge info on Select units):
		// remember them, stop asking, and keep the log quiet.
		if (this.lastSent && this.lastSent.subcommand === P.SUB.GET && OPTIONAL_QUERIES.has(this.lastSent.command)) {
			this.unsupported.add(this.lastSent.command)
			this.log('debug', `Query 0x${this.lastSent.command.toString(16)} not supported by this unit, skipping it`)
			this.state.lastNack = ''
			this.setVariableValues({ last_error: '' })
			return
		}
		this.log('warn', `RackLink NACK: ${this.state.lastNack}`)
	}

	onPointState(kind, data, subcommand) {
		const n = data[0]
		const table = kind === 'outlet' ? this.state.outlets : this.state.contacts
		const point = table[n]
		if (!point) return
		const raw = data[1]
		const prev = point.state
		const values = {}

		if (raw === P.OUTLET_STATE.NOT_CONTROLLABLE) {
			point.controllable = 'N'
			values[`${kind}_${n}_controllable`] = 'Not Controllable'
		} else {
			point.state = raw === P.OUTLET_STATE.ON
			if (point.cycling && prev === false && point.state === true) this.endCycle(kind, n)
		}
		if (data.length >= 6) {
			const ct = parseInt(P.bufToAscii(data.subarray(2, 6)), 10)
			if (Number.isFinite(ct)) point.cycleTime = ct
		}
		values[`${kind}_${n}_state`] = point.state === null ? 'Unknown' : point.state ? 'On' : 'Off'
		values[`${kind}_${n}_cycle_time`] = point.cycleTime ?? ''
		if (kind === 'outlet') values.outlets_on_count = this.countOn()
		this.setVariableValues(values)

		if (subcommand === P.SUB.STATUS && prev !== point.state) {
			this.log('info', `${kind} ${n} changed locally to ${values[`${kind}_${n}_state`]}`)
		}
		this.checkFeedbacks(kind === 'outlet' ? 'outlet_state' : 'contact_state', 'all_outlets', 'outlet_cycling')
	}

	onPointName(kind, data) {
		const n = data[0]
		const table = kind === 'outlet' ? this.state.outlets : this.state.contacts
		if (!table[n]) return
		const name = P.bufToAscii(data.subarray(1)).trim()
		const changed = table[n].name !== name
		table[n].name = name
		this.setVariableValues({ [`${kind}_${n}_name`]: name || `${kind === 'outlet' ? 'Outlet' : 'Contact'} ${n}` })
		if (changed) this.scheduleDefinitionUpdate() // refresh dropdown labels
	}

	onCount(kind, data) {
		const letters = P.bufToAscii(data)
		const max = kind === 'outlet' ? MAX_OUTLETS : MAX_CONTACTS
		const table = kind === 'outlet' ? this.state.outlets : this.state.contacts
		let highest = 0
		const values = {}
		for (let i = 1; i <= Math.min(letters.length, max); i++) {
			const l = letters[i - 1]
			table[i].controllable = l
			if (l !== 'X') highest = i
			values[`${kind}_${i}_controllable`] = P.CONTROLLABLE_LETTERS[l] || l
		}
		const prev = kind === 'outlet' ? this.state.detectedOutlets : this.state.detectedContacts
		if (kind === 'outlet') this.state.detectedOutlets = highest || null
		else this.state.detectedContacts = highest

		if (prev !== highest) {
			this.log('info', `Detected ${highest} ${kind}${highest === 1 ? '' : 's'}`)
			this.updateDefinitions()
			// query the newly known points
			if (kind === 'contact' && highest > 0 && !this.pendingFullRefresh) {
				this.refresh('contacts')
				for (let i = 1; i <= highest; i++) this.send(P.CMD.CONTACT_NAME, P.SUB.GET, [i])
			}
		}
		values[kind === 'outlet' ? 'outlet_count' : 'contact_count'] =
			kind === 'outlet' ? this.outletCount() : this.contactCount()
		this.setVariableValues(values)
		this.checkFeedbacks('outlet_controllable')
		if (kind === 'contact') this.runPendingRefresh()
	}

	// ---------------------------------------------------------------- commands (used by actions)

	setPoint(kind, n, action, cycleTime = 5) {
		const cmd = kind === 'outlet' ? P.CMD.OUTLET : P.CMD.CONTACT
		const point = (kind === 'outlet' ? this.state.outlets : this.state.contacts)[n]
		if (!point) return
		let stateByte
		switch (action) {
			case 'on':
				stateByte = P.OUTLET_STATE.ON
				break
			case 'off':
				stateByte = P.OUTLET_STATE.OFF
				break
			case 'toggle':
				stateByte = point.state === true ? P.OUTLET_STATE.OFF : P.OUTLET_STATE.ON
				break
			case 'cycle':
				stateByte = P.OUTLET_STATE.CYCLE
				break
			default:
				return
		}
		const time = stateByte === P.OUTLET_STATE.CYCLE ? Math.max(0, Math.min(3600, Number(cycleTime) || 0)) : 0
		if (this.send(cmd, P.SUB.SET, [n, stateByte, ...P.asciiInt(time, 4)]) && stateByte === P.OUTLET_STATE.CYCLE) {
			this.startCycle(kind, n, time)
		}
	}

	setOutlets(list, action, cycleTime) {
		const outlets = list.includes(0) ? this.allOutletNumbers() : list
		let effective = action
		if (action === 'toggle' && list.includes(0)) {
			// toggle "all": everything off if all are on, otherwise everything on
			effective = outlets.every((n) => this.state.outlets[n].state === true) ? 'off' : 'on'
		}
		for (const n of outlets) this.setPoint('outlet', n, effective, cycleTime)
	}

	allOutletNumbers() {
		const out = []
		for (let i = 1; i <= this.outletCount(); i++) {
			if (this.state.outlets[i].controllable !== 'X') out.push(i)
		}
		return out
	}

	startCycle(kind, n, seconds) {
		if (kind !== 'outlet') return
		this.state.outlets[n].cycling = true
		this.setVariableValues({ [`outlet_${n}_cycling`]: 'Yes' })
		this.checkFeedbacks('outlet_cycling')
		clearTimeout(this.timers[`cycle${n}`])
		this.timers[`cycle${n}`] = setTimeout(() => this.endCycle('outlet', n), (seconds + 5) * 1000)
	}

	endCycle(kind, n) {
		if (kind !== 'outlet') return
		clearTimeout(this.timers[`cycle${n}`])
		delete this.timers[`cycle${n}`]
		this.state.outlets[n].cycling = false
		this.setVariableValues({ [`outlet_${n}_cycling`]: 'No' })
		this.checkFeedbacks('outlet_cycling')
		this.send(P.CMD.OUTLET, P.SUB.GET, [n])
	}

	// ---------------------------------------------------------------- helpers

	countOn() {
		let c = 0
		for (let i = 1; i <= this.outletCount(); i++) if (this.state.outlets[i].state === true) c++
		return c
	}

	energyLabel(letter) {
		return P.ENERGY_LETTERS[letter] || letter || ''
	}

	cleanNumber(str) {
		const n = Number(str)
		return Number.isFinite(n) ? n : str
	}

	publishConnection() {
		this.setVariableValues({
			connection_state: this.state.ready
				? 'Ready'
				: this.state.loggedIn
					? 'Logged In'
					: this.state.connected
						? 'Connected'
						: 'Disconnected',
		})
		this.checkFeedbacks('connection_state')
	}
}

export default RackLinkInstance
export { UpgradeScripts }
