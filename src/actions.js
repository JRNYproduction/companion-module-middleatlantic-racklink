import * as P from './protocol.js'

const STATE_CHOICES = [
	{ id: 'on', label: 'On' },
	{ id: 'off', label: 'Off' },
	{ id: 'toggle', label: 'Toggle' },
	{ id: 'cycle', label: 'Power cycle (off, wait, on)' },
]

function getActions(self) {
	const outletAll = self.outletChoices(true)
	const outlets = self.outletChoices(false)
	const contacts = self.contactChoices()

	const cycleOption = {
		type: 'number',
		id: 'cycle_time',
		label: 'Cycle off-time (seconds, 0-3600)',
		default: 5,
		min: 0,
		max: 3600,
		isVisibleExpression: `$(options:action) == 'cycle'`,
	}

	const actions = {
		outlet_control: {
			name: 'Outlet: On / Off / Toggle / Cycle',
			options: [
				{ type: 'dropdown', id: 'outlet', label: 'Outlet', default: 1, choices: outletAll },
				{ type: 'dropdown', id: 'action', label: 'Action', default: 'toggle', choices: STATE_CHOICES, disableAutoExpression: true },
				cycleOption,
			],
			callback: async ({ options }) => {
				self.setOutlets([Number(options.outlet)], options.action, options.cycle_time)
			},
		},

		outlet_group: {
			name: 'Outlet: Control multiple outlets',
			options: [
				{
					type: 'multidropdown',
					id: 'outlets',
					label: 'Outlets',
					default: [1],
					choices: outlets,
				},
				{ type: 'dropdown', id: 'action', label: 'Action', default: 'on', choices: STATE_CHOICES, disableAutoExpression: true },
				cycleOption,
			],
			callback: async ({ options }) => {
				const list = (options.outlets || []).map(Number)
				if (options.action === 'toggle') {
					const allOn = list.every((n) => self.state.outlets[n]?.state === true)
					for (const n of list) self.setPoint('outlet', n, allOn ? 'off' : 'on')
				} else {
					self.setOutlets(list, options.action, options.cycle_time)
				}
			},
		},

		outlet_by_number: {
			name: 'Outlet: Control by number (variables allowed)',
			options: [
				{
					type: 'textinput',
					id: 'outlet',
					label: 'Outlet number (1-16)',
					default: '1',
					useVariables: true,
				},
				{ type: 'dropdown', id: 'action', label: 'Action', default: 'toggle', choices: STATE_CHOICES, disableAutoExpression: true },
				cycleOption,
			],
			callback: async ({ options }) => {
				const n = parseInt(String(options.outlet ?? ''), 10)
				if (!(n >= 1 && n <= 16)) {
					self.log('warn', `Invalid outlet number "${options.outlet}"`)
					return
				}
				self.setPoint('outlet', n, options.action, options.cycle_time)
			},
		},

		outlet_rename: {
			name: 'Outlet: Rename',
			options: [
				{ type: 'dropdown', id: 'outlet', label: 'Outlet', default: 1, choices: outlets },
				{ type: 'textinput', id: 'name', label: 'New name', default: '', useVariables: true },
			],
			callback: async ({ options }) => {
				const name = String(options.name ?? '').slice(0, 240)
				const n = Number(options.outlet)
				self.send(P.CMD.OUTLET_NAME, P.SUB.SET, [n, ...P.ascii(name)])
				self.send(P.CMD.OUTLET_NAME, P.SUB.GET, [n])
			},
		},

		sequence: {
			name: 'Sequence: Power up / down',
			options: [
				{
					type: 'dropdown',
					id: 'direction',
					label: 'Direction',
					default: 'up',
					choices: [
						{ id: 'up', label: 'Sequence UP (on)' },
						{ id: 'down', label: 'Sequence DOWN (off)' },
					],
				},
				{
					type: 'number',
					id: 'delay',
					label: 'Delay between outlets (seconds, 0-999; ignored by Premium+)',
					default: 3,
					min: 0,
					max: 999,
				},
			],
			callback: async ({ options }) => {
				const delay = self.config.model === 'premium_plus' ? 0 : options.delay
				self.send(P.CMD.SEQUENCE, P.SUB.SET, [options.direction === 'down' ? 0x03 : 0x01, ...P.asciiInt(delay, 4)])
			},
		},

		sequence_toggle: {
			name: 'Sequence: Toggle (down if any outlet on, else up)',
			options: [
				{
					type: 'number',
					id: 'delay',
					label: 'Delay between outlets (seconds, 0-999; ignored by Premium+)',
					default: 3,
					min: 0,
					max: 999,
				},
			],
			callback: async ({ options }) => {
				const delay = self.config.model === 'premium_plus' ? 0 : options.delay
				const dir = self.countOn() > 0 ? 0x03 : 0x01
				self.send(P.CMD.SEQUENCE, P.SUB.SET, [dir, ...P.asciiInt(delay, 4)])
			},
		},

		...(self.contactCount() > 0 ? dryContactActions(self, contacts, cycleOption) : {}),

		epo: {
			name: 'EPO: Emergency Power Off / Recover (Premium/Premium+)',
			description: 'Initiating EPO immediately cuts power to all outlets.',
			options: [
				{
					type: 'dropdown',
					id: 'mode',
					label: 'Command',
					default: 'recover',
					choices: [
						{ id: 'initiate', label: 'INITIATE Emergency Power Off' },
						{ id: 'recover', label: 'Recover from EPO' },
					],
				},
			],
			callback: async ({ options }) => {
				self.send(P.CMD.EPO, P.SUB.SET, [options.mode === 'initiate' ? 0x01 : 0x00])
			},
		},

		energy_state: {
			name: 'Energy Management: Set outlet state (Premium/Premium+)',
			options: [
				{ type: 'dropdown', id: 'outlet', label: 'Outlet', default: 1, choices: outlets },
				{
					type: 'dropdown',
					id: 'state',
					label: 'State',
					default: 'I',
					choices: Object.entries(P.ENERGY_LETTERS)
						.filter(([k]) => k !== 'U')
						.map(([id, label]) => ({ id, label })),
				},
			],
			callback: async ({ options }) => {
				const n = Number(options.outlet)
				self.send(P.CMD.ENERGY_STATE, P.SUB.SET, [n, options.state.charCodeAt(0)])
			},
		},

		threshold_set: {
			name: 'Threshold: Set (Premium/Premium+)',
			options: [
				{
					type: 'dropdown',
					id: 'threshold',
					label: 'Threshold',
					default: P.THRESHOLDS[0].id,
					choices: P.THRESHOLDS.map((t) => ({ id: t.id, label: `${t.name} (${t.unit})` })),
				},
				{ type: 'textinput', id: 'value', label: 'Value', default: '', useVariables: true },
			],
			callback: async ({ options }) => {
				const t = P.THRESHOLDS.find((x) => x.id === options.threshold)
				if (!t) return
				try {
					const str = P.formatValue(String(options.value ?? ''), t.format)
					self.send(t.cmd, P.SUB.SET, P.ascii(str))
					self.send(t.cmd, P.SUB.GET)
				} catch (e) {
					self.log('warn', `${t.name}: ${e.message}`)
				}
			},
		},

		sensor_write: {
			name: 'Sensor: Write value, e.g. reset kWh (Premium/Premium+)',
			options: [
				{
					type: 'dropdown',
					id: 'sensor',
					label: 'Value',
					default: 'kwh',
					choices: P.SENSORS.map((s) => ({ id: s.id, label: s.name })),
				},
				{ type: 'textinput', id: 'value', label: 'Value', default: '0', useVariables: true },
			],
			callback: async ({ options }) => {
				const s = P.SENSORS.find((x) => x.id === options.sensor)
				if (!s) return
				try {
					const str = P.formatValue(String(options.value ?? ''), s.format)
					self.send(s.cmd, P.SUB.SET, P.ascii(str))
					self.send(s.cmd, P.SUB.GET)
				} catch (e) {
					self.log('warn', `${s.name}: ${e.message}`)
				}
			},
		},

		log_alerts: {
			name: 'Log: Register log alerts (Premium/Premium+)',
			options: [
				{
					type: 'multidropdown',
					id: 'alerts',
					label: 'Enabled alerts',
					default: P.LOG_ALERT_BITS.map((b) => b.id),
					choices: P.LOG_ALERT_BITS.map((b) => ({ id: b.id, label: b.label })),
				},
			],
			callback: async ({ options }) => {
				const bytes = [0, 0]
				for (const id of options.alerts || []) {
					const bit = P.LOG_ALERT_BITS.find((b) => b.id === id)
					if (bit) bytes[bit.byte] |= bit.mask
				}
				self.send(P.CMD.LOG_ALERTS, P.SUB.SET, bytes)
			},
		},

		log_read: {
			name: 'Log: Read entries (Premium/Premium+)',
			options: [
				{ type: 'number', id: 'start', label: 'First entry index', default: 1, min: 0, max: 9999 },
				{ type: 'number', id: 'count', label: 'Number of entries (1-99)', default: 1, min: 1, max: 99 },
			],
			callback: async ({ options }) => {
				self.send(P.CMD.LOG_READ, P.SUB.GET, [
					...P.asciiInt(options.start, 4),
					0x7c,
					...P.asciiInt(options.count, 2),
				])
			},
		},

		log_clear: {
			name: 'Log: Clear (Premium/Premium+)',
			options: [],
			callback: async () => {
				self.send(P.CMD.LOG_CLEAR, P.SUB.SET)
				self.send(P.CMD.LOG_COUNT, P.SUB.GET)
			},
		},

		refresh: {
			name: 'Refresh: Query device',
			options: [
				{
					type: 'dropdown',
					id: 'what',
					label: 'What',
					default: 'all',
					choices: [
						{ id: 'all', label: 'Everything' },
						{ id: 'states', label: 'Outlet + contact states' },
						{ id: 'names', label: 'Outlet + contact names' },
						{ id: 'counts', label: 'Outlet / contact counts' },
						{ id: 'info', label: 'Product info' },
						{ id: 'sensors', label: 'Sensors (Premium/Premium+)' },
						{ id: 'energy', label: 'Energy states (Premium/Premium+)' },
						{ id: 'thresholds', label: 'Thresholds (Premium/Premium+)' },
						{ id: 'log', label: 'Log count / alerts (Premium/Premium+)' },
					],
				},
			],
			callback: async ({ options }) => {
				self.refresh(options.what)
			},
		},

		register_status: {
			name: 'Connection: Re-register for live status updates (troubleshooting)',
			options: [],
			callback: async () => self.registerStatusUpdates(),
		},

		reconnect: {
			name: 'Connection: Force reconnect (troubleshooting)',
			options: [],
			callback: async () => self.reconnect(),
		},

		raw: {
			name: 'Advanced: Send raw command',
			description: 'Hex bytes for Command, Subcommand and Data. Header, length, destination, checksum and tail are added.',
			options: [
				{
					type: 'textinput',
					id: 'hex',
					label: 'Hex (e.g. "20 02 03" = get outlet 3 state)',
					default: '',
					useVariables: true,
				},
			],
			callback: async ({ options }) => {
				try {
					const bytes = P.parseHex(String(options.hex ?? ''))
					if (bytes.length < 2) throw new Error('Need at least command and subcommand bytes')
					self.send(bytes[0], bytes[1], bytes.slice(2))
				} catch (e) {
					self.log('warn', `Raw command: ${e.message}`)
				}
			},
		},
	}

	return actions
}

/** Shown only on units that report dry contacts (not on Select models like the RLNK-915R) */
function dryContactActions(self, contacts, cycleOption) {
	return {
		contact_control: {
			name: 'Dry Contact: On / Off / Toggle / Cycle',
			options: [
				{ type: 'dropdown', id: 'contact', label: 'Contact', default: 1, choices: contacts },
				{ type: 'dropdown', id: 'action', label: 'Action', default: 'toggle', choices: STATE_CHOICES, disableAutoExpression: true },
				cycleOption,
			],
			callback: async ({ options }) => {
				self.setPoint('contact', Number(options.contact), options.action, options.cycle_time)
			},
		},

		contact_rename: {
			name: 'Dry Contact: Rename',
			options: [
				{ type: 'dropdown', id: 'contact', label: 'Contact', default: 1, choices: contacts },
				{ type: 'textinput', id: 'name', label: 'New name', default: '', useVariables: true },
			],
			callback: async ({ options }) => {
				const name = String(options.name ?? '').slice(0, 240)
				const n = Number(options.contact)
				self.send(P.CMD.CONTACT_NAME, P.SUB.SET, [n, ...P.ascii(name)])
				self.send(P.CMD.CONTACT_NAME, P.SUB.GET, [n])
			},
		},
	}
}

export { getActions }
